/**
 * Assembling the export pack: the half that touches the world.
 *
 * `markdown.ts` decides what the document says. This decides what goes in the
 * zip — it reads the project, renders each chosen wall, collects the image
 * files, and hands the result to storage. It makes no judgements about the
 * document's structure, and the split is deliberate: everything worth testing
 * without a database is on the other side of it.
 *
 * ── Why the zip goes to storage rather than down the wire ────────────────
 *
 * A pack is a few megabytes of markdown and twenty or so images. That is
 * small enough to build in memory and much too big to rely on coming back as
 * a serverless response body, which is capped well below it. So the zip is
 * written to the `exports` bucket and the caller gets a signed URL, which is
 * the same shape the dashboard thumbnails already use.
 *
 * Each project keeps exactly one pack, at `<projectId>.zip`, overwritten on
 * every export. That is what stops the bucket growing without bound, and it
 * is why the bucket is *not* swept by /api/admin/sweep-storage: that sweep
 * aborts on any bucket where nothing matches a live database row, and no row
 * anywhere points at an export.
 *
 * Server-only: imports sharp, by way of thumbnail.ts. Never import from a
 * client component.
 */
import { zipSync, type Zippable } from 'fflate'
import type { SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'

import { buildThumbnailBuffer, EXPORT_WALL_W, type ArtworkEntry } from '@/lib/thumbnail'
import { notesForExport, notesMentioning, notesOn, rowToNote, workSetLabel, type Note, type NoteRow } from '@/lib/notes'
import { MESSAGE_COLUMNS, messagesByOption, rowToMessage, type OptionMessage, type OptionMessageRow } from '@/lib/messages'
import { sortOptions, optionTitleFor } from '@/lib/options'
import {
  netPrice, subItemAmount, installCostDisplay, consultantFeeRange,
  displayFrozenAmount, computeProjectTotals, getOptionTotals, bucketTotal,
  type BudgetArtwork, type BudgetElevationData,
} from '@/components/budget/budgetCalc'
import { parseSubLineItems, parseDiscountStatus, parseDiscountPercent } from '@/lib/lineItems'
import { parseSetAside } from '@/lib/works'
import type { BudgetConsultantFee, BudgetCustomLineItem, BudgetInstallation } from '@/types'
import { buildMarkdown, fileSlug } from './markdown'
import { decodeCapturedImage } from './capturedImage'
import { EXPORTS_BUCKET, exportObjectPath } from './bucket'
import type {
  ExportBudgetLine, ExportBudgetNote, ExportChoices, ExportElevation, ExportMessage, ExportNote,
  ExportSnapshot, ExportWork,
} from './types'

/** How long the download link lives. Long enough to click, short enough to expire. */
const DOWNLOAD_TTL = 60 * 60

/**
 * Quality for the rendered walls.
 *
 * They are photographs with artwork composited onto them, so JPEG is the
 * right format and the difference is not academic: the same wall is 2.4MB as
 * a PNG and about a tenth of that at q88, which is the difference between a
 * pack that can be dragged into a chat and one that cannot. Work images are
 * *not* re-encoded — the original file is what a designer wants.
 */
const WALL_QUALITY = 88

/** What actually went in, for the confirmation message. */
export interface PackContents {
  elevations: number
  works: number
  images: number
}

/** The pack itself, before anybody has decided where to put it. */
export interface AssembledPack {
  zip: Uint8Array
  /** What the browser should call the downloaded file. */
  filename: string
  /** The document, kept so it can be read without unzipping anything. */
  markdown: string
  included: PackContents
}

export interface PackResult {
  /** Path inside the exports bucket. */
  path: string
  filename: string
  bytes: number
  /** Signed URL, good for an hour. */
  url: string
  included: PackContents
}

// ── Reading the project ────────────────────────────────────────────────────
//
// The shapes below are the columns this module asks for, named rather than
// left as `any` so a renamed column is a type error here instead of a quietly
// missing section in somebody's proposal.

interface PlacementRow {
  id: string
  work_id: string
  x_fraction: number
  y_fraction: number
  visible: boolean
  display_order: number | null
  brightness: number | null
  fade: number | null
  frame_type: string | null
  frame_width_mm: number | null
  mount_color: string | null
  mount_top_mm: number | null
  mount_right_mm: number | null
  mount_bottom_mm: number | null
  mount_left_mm: number | null
  shadow_angle: number | null
  shadow_blur: number | null
  shadow_opacity: number | null
}

interface OptionRow {
  id: string
  option: string
  sort_order: number | null
  created_at: string | null
  name: string | null
  image_path: string | null
  thumbnail_path: string | null
  orig_w: number | null
  orig_h: number | null
  scale_px_per_cm: number | null
  wall_w_cm: number | null
  wall_h_cm: number | null
  wall_color: string | null
  foreground_masks: unknown
  consultant_note: string | null
  consultant_note_shown_to_client: boolean | null
  artworks: PlacementRow[]
}

interface ElevationRow {
  id: string
  name: string
  display_order: number | null
  client_picked_option: string | null
  elevation_options: OptionRow[]
}

interface WorkRow {
  id: string
  artist: string | null
  artist_id: string | null
  name: string | null
  image_path: string | null
  w_cm: number
  h_cm: number
  price: number | null
  vat_applies: boolean | null
  discount_status: unknown
  discount_percent: unknown
  sub_line_items: unknown
  year: string | null
  medium: string | null
  edition: string | null
  source: string | null
  set_aside: unknown
  considered_for: string | null
  display_order: number | null
  note: string | null
  note_shown_to_client: boolean | null
}

interface BudgetRow {
  installation: BudgetInstallation | null
  consultant_fee: BudgetConsultantFee | null
  custom_line_items: BudgetCustomLineItem[] | null
}

const OPTION_SELECT = `
  id, option, sort_order, created_at, name, image_path, thumbnail_path,
  orig_w, orig_h, scale_px_per_cm, wall_w_cm, wall_h_cm, wall_color, foreground_masks,
  consultant_note, consultant_note_shown_to_client,
  artworks(
    id, work_id, x_fraction, y_fraction, visible, display_order,
    brightness, fade, frame_type, frame_width_mm,
    mount_color, mount_top_mm, mount_right_mm, mount_bottom_mm, mount_left_mm,
    shadow_angle, shadow_blur, shadow_opacity
  )
`

/** Everything the pack needs, in as few round trips as the shapes allow. */
async function readProject(supabase: SupabaseClient, projectId: string) {
  const [project, elevations, works, notes, artists, budget, messages] = await Promise.all([
    supabase.from('projects')
      .select('id, name, client_name, budget, consultant_id')
      .eq('id', projectId).maybeSingle(),
    supabase.from('elevations')
      .select(`id, name, display_order, client_picked_option, elevation_options(${OPTION_SELECT})`)
      .eq('project_id', projectId)
      .order('display_order', { ascending: true }),
    supabase.from('works')
      .select('id, artist, artist_id, name, image_path, w_cm, h_cm, price, vat_applies, discount_status, discount_percent, sub_line_items, year, medium, edition, source, set_aside, considered_for, display_order, note, note_shown_to_client')
      .eq('project_id', projectId)
      .order('display_order', { ascending: true }),
    supabase.from('notes')
      .select('id, project_id, anchor_type, elevation_id, option_id, work_id, artist_id, body, share, display_order, updated_at, note_works(work_id)')
      .eq('project_id', projectId)
      .order('display_order', { ascending: true }),
    supabase.from('artist_profiles').select('id, name, note'),
    supabase.from('project_budgets')
      .select('installation, consultant_fee, custom_line_items')
      .eq('project_id', projectId).maybeSingle(),
    supabase.from('option_messages')
      .select(MESSAGE_COLUMNS)
      .eq('project_id', projectId)
      .order('created_at', { ascending: true }),
  ])

  return {
    project: project.data as { id: string; name: string; client_name: string | null; budget: number | null; consultant_id: string } | null,
    elevations: (elevations.data ?? []) as unknown as ElevationRow[],
    works: (works.data ?? []) as unknown as WorkRow[],
    notes: ((notes.data ?? []) as unknown as NoteRow[]).map(rowToNote),
    artists: (artists.data ?? []) as Array<{ id: string; name: string; note: string | null }>,
    budget: budget.data as BudgetRow | null,
    messages: ((messages.data ?? []) as OptionMessageRow[]).map(rowToMessage),
  }
}

// ── Turning notes into the export's shape ──────────────────────────────────

/**
 * Notes for one anchor, already filtered.
 *
 * `notesForExport` is applied once, to the whole set — the filter that drops
 * empty notes lives in exactly one place, and this reads its result.
 */
function notesFor(
  visible: Note[],
  anchor: Parameters<typeof notesOn>[1],
  id: string | null,
  nameOf: (id: string) => string | undefined,
): ExportNote[] {
  return notesOn(visible, anchor, id).map(n => toExportNote(n, nameOf))
}

function toExportNote(n: Note, nameOf: (id: string) => string | undefined): ExportNote {
  const covers = n.workIds.length > 1 ? workSetLabel(n.workIds, nameOf) : undefined
  return { id: n.id, body: n.body, ...(covers ? { covers } : {}) }
}

/** A Budget-screen note, or null when nothing was written. */
function budgetNote(body: string | null, shownToClient: boolean | null): ExportBudgetNote | null {
  const text = body?.trim()
  return text ? { body: text, shownToClient: shownToClient !== false } : null
}

const SENT_ON = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London',
})

function toExportMessage(m: OptionMessage): ExportMessage {
  return { from: m.author, body: m.body, sentOn: SENT_ON.format(new Date(m.createdAt)) }
}

// ── Images ─────────────────────────────────────────────────────────────────

/**
 * How many images to fetch or render at once.
 *
 * Rendering a wall is a second of sharp compositing and downloading a work is
 * a round trip to storage; doing either one at a time made a project with a
 * dozen options take the best part of a minute. Four at a time is most of the
 * win without asking a serverless function to hold twelve decoded images in
 * memory at the same moment.
 */
const CONCURRENCY = 4

/** Map over `items` with at most `CONCURRENCY` in flight, keeping order. */
async function mapLimit<T, R>(
  items: T[], fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

/** A file destined for the zip. */
interface PackFile {
  path: string
  bytes: Uint8Array
}

/**
 * Unique paths inside the zip.
 *
 * Two works can share a name — that is the whole reason `merge_works` exists —
 * and in this data they frequently do. A collision would silently drop one
 * image and leave a work pointing at another work's picture, which is the
 * kind of error nobody spots until a client does.
 */
function uniquePath(taken: Set<string>, dir: string, slug: string, ext: string): string {
  let candidate = `${dir}/${slug}${ext}`
  let n = 2
  while (taken.has(candidate)) candidate = `${dir}/${slug}-${n++}${ext}`
  taken.add(candidate)
  return candidate
}

/** `.jpg` from `abc/def.jpg`, defaulting where the path says nothing useful. */
function extensionOf(path: string, fallback = '.jpg'): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(path)
  return m ? `.${m[1].toLowerCase()}` : fallback
}

async function download(
  supabase: SupabaseClient, bucket: string, path: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

/**
 * Render one option's wall at export size.
 *
 * Reuses the dashboard's compositing wholesale — this is the same pipeline
 * that produces the cached thumbnails, asked for a bigger picture. Doing it
 * any other way would make a fifth renderer out of the four the project
 * already has to keep in step.
 */
async function renderWall(
  supabase: SupabaseClient,
  opt: OptionRow,
  workById: Map<string, WorkRow>,
  /**
   * Draw the room with nothing on it. Consultants use an empty wall as a page
   * in the proposal, and it is the same pipeline with no artworks passed —
   * which also means it is the same crop, scale and colour as the hung
   * versions beside it, rather than the raw photograph at some other size.
   */
  bare = false,
): Promise<Uint8Array | null> {
  if (!opt.orig_w || !opt.orig_h) return null

  let elev: string | { color: string }
  if (opt.image_path) {
    const { data } = await supabase.storage.from('elevation-images').createSignedUrl(opt.image_path, DOWNLOAD_TTL)
    if (!data?.signedUrl) return null
    elev = data.signedUrl
  } else if (opt.wall_color) {
    elev = { color: opt.wall_color }
  } else {
    return null
  }

  // One signed URL per file, not per placement: the same print can hang twice.
  const placed = bare
    ? []
    : (opt.artworks ?? []).filter(a => a.visible && workById.get(a.work_id)?.image_path)
  const paths = [...new Set(placed.map(a => workById.get(a.work_id)!.image_path as string))]
  const urls = new Map<string, string>()
  await Promise.all(paths.map(async path => {
    const { data } = await supabase.storage.from('artwork-images').createSignedUrl(path, DOWNLOAD_TTL)
    if (data?.signedUrl) urls.set(path, data.signedUrl)
  }))

  const entries = placed.flatMap((a): ArtworkEntry[] => {
    const w = workById.get(a.work_id)!
    const url = urls.get(w.image_path as string)
    if (!url) return []
    return [{
      url,
      xF: a.x_fraction, yF: a.y_fraction, wCm: w.w_cm, hCm: w.h_cm,
      brightness: a.brightness ?? 1, fade: a.fade ?? null,
      frameType: a.frame_type, frameWidthMm: a.frame_width_mm,
      mountColor: a.mount_color,
      mountTopMm: a.mount_top_mm, mountRightMm: a.mount_right_mm,
      mountBottomMm: a.mount_bottom_mm, mountLeftMm: a.mount_left_mm,
      shadowAngle: a.shadow_angle, shadowBlur: a.shadow_blur, shadowOpacity: a.shadow_opacity,
    }]
  })

  const masks = Array.isArray(opt.foreground_masks)
    ? opt.foreground_masks as Array<Array<{ x: number; y: number }>>
    : null

  const png = await buildThumbnailBuffer(
    elev, entries, opt.orig_w, opt.orig_h, opt.scale_px_per_cm, masks, EXPORT_WALL_W,
  )
  if (!png) return null
  return new Uint8Array(await sharp(png).jpeg({ quality: WALL_QUALITY }).toBuffer())
}

// ── The budget ─────────────────────────────────────────────────────────────

/**
 * The money, using the budget screen's own arithmetic.
 *
 * Every figure here comes from `budgetCalc.ts`. Nothing is recomputed: there
 * is one budget in this product, and a second implementation of it would
 * drift and the drift would land in a client's proposal.
 *
 * The export fixes one option per elevation, so the ranges that budget screen
 * carries for undecided elevations collapse — except indicative installation,
 * which is a range because the cost genuinely is one.
 */
/**
 * The money, using the budget screen's own arithmetic.
 *
 * Every figure comes from `budgetCalc.ts`. Nothing is recomputed: there is
 * one budget in this product, and a second implementation of it would drift
 * and the drift would land in a client's proposal.
 *
 * Because an elevation can now contribute several options, the total is a
 * range wherever the client has not picked one — the cheapest set they could
 * choose and the dearest. That is `computeProjectTotals`, and both ends are
 * combinations they could really buy rather than a minimum of each field
 * taken separately, which is a distinction that module learned the hard way.
 */
function buildBudget(
  chosen: Array<{ elev: ElevationRow; opts: OptionRow[]; options: OptionRow[] }>,
  works: WorkRow[],
  budgetRow: BudgetRow | null,
  clientBudget: number | null,
  budgetNotes: ExportNote[],
  imageFile: string | null,
) {
  const byId = new Map(works.map(w => [w.id, w]))

  const asBudgetArtwork = (a: PlacementRow): BudgetArtwork | null => {
    const w = byId.get(a.work_id)
    if (!w) return null
    return {
      id: a.id,
      workId: w.id,
      name: w.name ?? 'Untitled',
      artist: w.artist ?? '',
      wCm: w.w_cm,
      hCm: w.h_cm,
      price: w.price ?? 0,
      visible: a.visible,
      note: '',
      noteShownToClient: true,
      vatApplies: w.vat_applies ?? true,
      discountStatus: parseDiscountStatus(w.discount_status),
      discountPercent: parseDiscountPercent(w.discount_percent),
      subLineItems: parseSubLineItems(w.sub_line_items),
    }
  }

  const budgetElevations: BudgetElevationData[] = chosen.map(({ elev, opts, options }) => ({
    id: elev.id,
    name: elev.name,
    // Only a pick the consultant actually included counts. Leaving the key in
    // place while its option is out of the export would have
    // `computeProjectTotals` look for an option that is not there, find
    // nothing, and quietly contribute zero for the whole elevation.
    clientPickedOption: opts.some(o => o.option === elev.client_picked_option)
      ? elev.client_picked_option
      : null,
    hiddenFromClient: false,
    options: opts.map(opt => ({
      key: opt.option,
      label: optionTitleFor(options, opt.option),
      title: optionTitleFor(options, opt.option),
      name: opt.name ?? null,
      consultantNote: '',
      consultantNoteShownToClient: true,
      artworks: (opt.artworks ?? [])
        .map(asBudgetArtwork)
        .filter((a): a is BudgetArtwork => a !== null),
    })),
  }))

  const totals = computeProjectTotals(budgetElevations, false)
  const artMin = totals.min.artVatable + totals.min.artExempt
  const artMax = totals.max.artVatable + totals.max.artExempt

  const lines: ExportBudgetLine[] = []

  // Per-elevation detail. Where the client has picked, the works themselves
  // are listed, because that is what is actually being bought. Where they
  // have not, the alternatives are a range and naming one option's works
  // would present a choice that has not been made as though it had.
  for (const elev of budgetElevations) {
    const picked = elev.clientPickedOption
      ? elev.options.find(o => o.key === elev.clientPickedOption)
      : undefined

    if (picked) {
      lines.push({ label: `${elev.name} — ${picked.title}`, amount: bucketTotal(getOptionTotals(picked.artworks), false) })
      for (const a of picked.artworks.filter(x => x.visible)) {
        const net = netPrice(a)
        lines.push({ label: `${a.name} — ${a.artist || 'Unattributed'}`, amount: net, sub: true })
        for (const item of a.subLineItems) {
          const amount = subItemAmount(item, net)
          if (amount === 0) continue
          lines.push({ label: item.label?.trim() || item.kind, amount, sub: true })
        }
      }
      continue
    }

    const each = elev.options.map(o => bucketTotal(getOptionTotals(o.artworks), false))
    if (each.length === 0) continue
    const lo = Math.min(...each)
    const hi = Math.max(...each)
    lines.push({
      label: `${elev.name} — ${elev.options.length} option${elev.options.length === 1 ? '' : 's'}, none picked yet`,
      amount: lo,
      ...(hi !== lo ? { amountMax: hi } : {}),
    })
  }

  let total = bucketTotal(totals.min, false)
  let totalMax = bucketTotal(totals.max, false)

  // Lines the consultant has marked as not shown to the client stay out. The
  // pack is the input to a client proposal, and the budget screen's own
  // `shownToClient` is the answer to "may they see this?" — asking it a
  // second way here would be a second answer to drift from.
  const install = budgetRow?.installation
  if (install && (install.shownToClient ?? true)) {
    // Indicative installation is tiered on how many works are going out, and
    // that count itself has two ends once an elevation is undecided.
    const display = installCostDisplay(install, totals.min.artCount, totals.max.artCount)
    if (display.max > 0) {
      lines.push({
        label: display.isIndicative ? 'Installation (indicative)' : 'Installation',
        amount: display.min,
        ...(display.max !== display.min ? { amountMax: display.max } : {}),
      })
      total += display.min
      totalMax += display.max
    }
  }

  const fee = budgetRow?.consultant_fee
  if (fee && (fee.shownToClient ?? true)) {
    // A flat fee stores the literal figure the consultant typed, in whichever
    // view they typed it. Reading it raw would put an inc-VAT number into an
    // ex-VAT total — which is what `displayFrozenAmount` exists to prevent.
    if (fee.mode === 'flat') {
      const amount = displayFrozenAmount(
        fee.amount, fee.amountIncludesVat, fee.vatApplies ?? true, false,
      )
      lines.push({ label: 'Consultant fee', amount })
      total += amount
      totalMax += amount
    } else {
      // Taken on artwork prices alone — see `artMin` in TotalsPanel.tsx.
      // Charging it on the running total would add a percentage of the
      // framing and the installation too.
      const range = consultantFeeRange(fee, artMin, artMax)
      lines.push({
        label: `Consultant fee (${fee.amount}%)`,
        amount: range.min,
        ...(range.max !== range.min ? { amountMax: range.max } : {}),
      })
      total += range.min
      totalMax += range.max
    }
  }

  for (const item of budgetRow?.custom_line_items ?? []) {
    if (!(item.shownToClient ?? true)) continue
    // Ex-VAT throughout: the pack states its figures once, and says so.
    const amount = displayFrozenAmount(item.amount, item.amountIncludesVat, item.vatApplies, false)
    lines.push({ label: item.name || 'Other', amount })
    total += amount
    totalMax += amount
  }

  return {
    imageFile, lines, total,
    totalMax: Math.max(total, totalMax),
    clientBudget, notes: budgetNotes,
  }
}

// ── Assembly ───────────────────────────────────────────────────────────────

/**
 * Build the pack, without deciding what becomes of it.
 *
 * Kept separate from `buildExportPack` so the whole pipeline — reading the
 * project, rendering the walls, laying out the document, making the zip — can
 * be driven and inspected without writing anything anywhere. Storage is the
 * one step that has a side effect, and it is the one step this does not take.
 *
 * `supabase` must be a service-role client: it signs artwork URLs. The caller
 * is responsible for having established that the person asking owns the
 * project — see the route handler.
 */
export async function assemblePack(
  supabase: SupabaseClient,
  projectId: string,
  choices: ExportChoices,
  consultantName: string,
  /**
   * The budget page, photographed in the browser and sent up with the
   * request. It cannot be rendered here: the budget's appearance is a
   * rendered screen, and drawing it a second time server-side would be a
   * second implementation of a layout that already exists.
   */
  budgetImage?: unknown,
): Promise<AssembledPack | null> {
  const { project, elevations, works, notes, artists, budget, messages } = await readProject(supabase, projectId)
  if (!project) return null

  const workById = new Map(works.map(w => [w.id, w]))
  const nameOf = (id: string) => workById.get(id)?.name ?? undefined

  // The one filter for what goes into the pack, applied once.
  const visible = notesForExport(notes)
  const conversations = messagesByOption(messages)

  // Which option was picked for each elevation. An elevation the consultant
  // unticked contributes nothing — not an empty section, no mention at all.
  //
  // An elevation contributes every option that was ticked, in their own
  // order. `options` is carried alongside because an option's *title* is a
  // function of its position among all its siblings, never of the stored key
  // and never of its position among the included ones — see options.ts.
  const wanted = new Set(choices.optionIds)
  const chosen: Array<{ elev: ElevationRow; opts: OptionRow[]; options: OptionRow[] }> = []
  for (const elev of elevations) {
    const options = sortOptions(elev.elevation_options ?? [])
    const opts = options.filter(o => wanted.has(o.id))
    if (opts.length > 0) chosen.push({ elev, opts, options })
  }

  const files: PackFile[] = []
  const taken = new Set<string>()

  // ── Wall renders, one per included option ──
  //
  // The names are worked out first and the rendering done in parallel, so a
  // project with a dozen options is not a dozen sequential seconds. Names
  // have to be allocated up front either way: `uniquePath` is a running
  // claim on a set, and racing it would hand two walls the same filename.
  const renderPaths = new Map<string, string>()
  if (choices.includeWallRenders) {
    const jobs = chosen.flatMap(({ elev, opts, options }) =>
      opts.map(opt => ({
        opt,
        // Named by elevation and option, because an elevation now
        // contributes several walls and "living-room.jpg" would be whichever
        // of them was written last.
        path: uniquePath(
          taken,
          'images/elevations',
          fileSlug(`${elev.name} ${optionTitleFor(options, opt.option)}`, 'elevation'),
          '.jpg',
        ),
      })))
    const rendered = await mapLimit(jobs, job => renderWall(supabase, job.opt, workById))
    jobs.forEach((job, i) => {
      const bytes = rendered[i]
      if (!bytes) return
      files.push({ path: job.path, bytes })
      renderPaths.set(job.opt.id, job.path)
    })
  }

  // ── The empty room, one per elevation ──
  //
  // Per elevation rather than per option: the options are alternative hangs
  // of one wall, so with nothing on them they are the same picture. Drawn
  // from the first included option, which is where that wall's photograph
  // and scale live.
  const bareWallPaths = new Map<string, string>()
  if (choices.includeBareWalls) {
    const jobs = chosen.map(({ elev, opts }) => ({
      elevId: elev.id,
      opt: opts[0],
      path: uniquePath(taken, 'images/elevations', `${fileSlug(elev.name, 'elevation')}-empty`, '.jpg'),
    }))
    const rendered = await mapLimit(jobs, job => renderWall(supabase, job.opt, workById, true))
    jobs.forEach((job, i) => {
      const bytes = rendered[i]
      if (!bytes) return
      files.push({ path: job.path, bytes })
      bareWallPaths.set(job.elevId, job.path)
    })
  }

  // ── The cached option thumbnails, where they were asked for ──
  const thumbPaths = new Map<string, string>()
  if (choices.includeThumbnails) {
    const jobs = chosen.flatMap(({ elev, opts }) => opts
      .filter(opt => opt.thumbnail_path)
      .map(opt => ({
        opt,
        path: uniquePath(taken, 'images/thumbnails', fileSlug(elev.name, 'elevation'), '.png'),
      })))
    const got = await mapLimit(jobs, job => download(supabase, 'thumbnails', job.opt.thumbnail_path as string))
    jobs.forEach((job, i) => {
      const bytes = got[i]
      if (!bytes) return
      files.push({ path: job.path, bytes })
      thumbPaths.set(job.opt.id, job.path)
    })
  }

  // ── The budget page, where one was taken ──
  let budgetImageFile: string | null = null
  if (choices.includeBudgetImage) {
    const captured = decodeCapturedImage(budgetImage)
    if (captured) {
      budgetImageFile = uniquePath(taken, 'images', 'budget', captured.ext)
      files.push({ path: budgetImageFile, bytes: captured.bytes })
    }
  }

  // ── Which works go in ──
  const included = works.filter(w => choices.includeSetAside || !parseSetAside(w.set_aside))

  // ── The work images, each at its original bytes ──
  const workImagePaths = new Map<string, string>()
  if (choices.includeWorkImages) {
    for (const w of included) {
      if (!w.image_path) continue
      const bytes = await download(supabase, 'artwork-images', w.image_path)
      if (!bytes) continue
      const slug = fileSlug(`${w.artist ?? ''} ${w.name ?? ''}`.trim(), 'work')
      const path = uniquePath(taken, 'images/works', slug, extensionOf(w.image_path))
      files.push({ path, bytes })
      workImagePaths.set(w.id, path)
    }
  }

  // ── Where each work hangs, within this export ──
  //
  // Named by elevation rather than by option: a work on three alternatives
  // for one wall hangs on that wall, and listing it three times would read
  // as three places it is going.
  const hangsOn = new Map<string, string[]>()
  for (const { elev, opts } of chosen) {
    for (const opt of opts) {
      for (const a of (opt.artworks ?? []).filter(pl => pl.visible)) {
        const list = hangsOn.get(a.work_id) ?? []
        if (!list.includes(elev.name)) list.push(elev.name)
        hangsOn.set(a.work_id, list)
      }
    }
  }

  const exportWorks: ExportWork[] = included.map(w => ({
    id: w.id,
    name: w.name ?? 'Untitled',
    artist: w.artist ?? '',
    artistId: w.artist_id,
    wCm: w.w_cm,
    hCm: w.h_cm,
    price: w.price ?? 0,
    discountStatus: parseDiscountStatus(w.discount_status),
    discountPercent: parseDiscountPercent(w.discount_percent),
    subLineItems: parseSubLineItems(w.sub_line_items),
    year: w.year,
    medium: w.medium,
    edition: w.edition,
    source: w.source,
    setAside: parseSetAside(w.set_aside),
    consideredFor: w.considered_for,
    hangsOn: hangsOn.get(w.id) ?? [],
    imageFile: workImagePaths.get(w.id) ?? null,
    // Both a note written about this work and one covering a set it belongs to.
    notes: notesMentioning(visible, w.id).map(n => toExportNote(n, nameOf)),
    budgetNote: budgetNote(w.note, w.note_shown_to_client),
  }))

  const exportElevations: ExportElevation[] = chosen.map(({ elev, opts, options }) => ({
    id: elev.id,
    name: elev.name,
    // The wall belongs to the elevation, not to any one arrangement of it.
    // Taken from the first included option, which is where it is recorded.
    wallWCm: opts[0]?.wall_w_cm ?? null,
    wallHCm: opts[0]?.wall_h_cm ?? null,
    bareWallFile: bareWallPaths.get(elev.id) ?? null,
    notes: notesFor(visible, 'elevation', elev.id, nameOf),
    options: opts.map(opt => {
      const placed = (opt.artworks ?? [])
        .filter(pl => pl.visible && workById.has(pl.work_id))
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      return {
        id: opt.id,
        // The letter is a position among *all* the siblings, never the
        // stored key and never a position among the included ones — see
        // options.ts. Exporting B and D must still call them B and D.
        title: optionTitleFor(options, opt.option),
        picked: elev.client_picked_option === opt.option,
        renderFile: renderPaths.get(opt.id) ?? null,
        thumbnailFile: thumbPaths.get(opt.id) ?? null,
        workIds: placed.map(pl => pl.work_id),
        notes: notesFor(visible, 'option', opt.id, nameOf),
        budgetNote: budgetNote(opt.consultant_note, opt.consultant_note_shown_to_client),
        conversation: (conversations[opt.id] ?? []).map(toExportMessage),
      }
    }),
  }))

  const snapshot: ExportSnapshot = {
    projectName: project.name,
    clientName: project.client_name ?? '',
    consultantName,
    exportedAt: new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric',
    }),
    projectNotes: notesFor(visible, 'project', null, nameOf),
    elevations: exportElevations,
    works: exportWorks,
    artists: artists.map(a => ({
      id: a.id,
      name: a.name,
      notes: notesFor(visible, 'artist', a.id, nameOf),
    })),
    budget: buildBudget(
      chosen,
      works,
      budget,
      project.budget ?? null,
      notesFor(visible, 'budget', null, nameOf),
      budgetImageFile,
    ),
    choices,
  }

  const markdown = buildMarkdown(snapshot)

  // ── The zip ──
  //
  // The markdown is deflated; the images are stored as they are. JPEG and PNG
  // bytes do not compress, and spending seconds proving that on every export
  // would be work for nothing.
  const zippable: Zippable = {
    'proposal.md': [new TextEncoder().encode(markdown), { level: 6 }],
  }
  for (const f of files) zippable[f.path] = [f.bytes, { level: 0 }]

  const zip = zipSync(zippable, { mtime: new Date() })

  return {
    zip,
    filename: `${fileSlug(project.name, 'project')}-export.zip`,
    markdown,
    included: {
      elevations: exportElevations.length,
      works: exportWorks.length,
      images: files.length,
    },
  }
}

/**
 * Build the pack and put it in the exports bucket, returning a signed URL.
 *
 * The object is `<projectId>.zip` and is overwritten every time, which is the
 * whole of the retention policy — see migration 036.
 */
export async function buildExportPack(
  supabase: SupabaseClient,
  projectId: string,
  choices: ExportChoices,
  consultantName: string,
  budgetImage?: unknown,
): Promise<PackResult | null> {
  const pack = await assemblePack(supabase, projectId, choices, consultantName, budgetImage)
  if (!pack) return null

  const path = exportObjectPath(projectId)

  const { error: upErr } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .upload(path, pack.zip, { contentType: 'application/zip', upsert: true })
  if (upErr) throw new Error(`Could not store the export: ${upErr.message}`)

  const { data: signed } = await supabase.storage
    .from(EXPORTS_BUCKET)
    .createSignedUrl(path, DOWNLOAD_TTL, { download: pack.filename })
  if (!signed?.signedUrl) throw new Error('Could not sign the export for download.')

  return {
    path,
    filename: pack.filename,
    bytes: pack.zip.length,
    url: signed.signedUrl,
    included: pack.included,
  }
}
