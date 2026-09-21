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
import { sortOptions, optionTitleFor } from '@/lib/options'
import { netPrice, subItemAmount, installCostDisplay, consultantFeeRange, displayFrozenAmount } from '@/components/budget/budgetCalc'
import { parseSubLineItems, parseDiscountStatus, parseDiscountPercent } from '@/lib/lineItems'
import { parseSetAside } from '@/lib/works'
import type { BudgetConsultantFee, BudgetCustomLineItem, BudgetInstallation } from '@/types'
import { buildMarkdown, fileSlug } from './markdown'
import { decodeCapturedImage } from './capturedImage'
import type {
  ExportBudgetLine, ExportChoices, ExportElevation, ExportNote,
  ExportSnapshot, ExportWork,
} from './types'

export const EXPORTS_BUCKET = 'exports'

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
}

interface BudgetRow {
  installation: BudgetInstallation | null
  consultant_fee: BudgetConsultantFee | null
  custom_line_items: BudgetCustomLineItem[] | null
}

const OPTION_SELECT = `
  id, option, sort_order, created_at, name, image_path, thumbnail_path,
  orig_w, orig_h, scale_px_per_cm, wall_w_cm, wall_h_cm, wall_color, foreground_masks,
  artworks(
    id, work_id, x_fraction, y_fraction, visible, display_order,
    brightness, fade, frame_type, frame_width_mm,
    mount_color, mount_top_mm, mount_right_mm, mount_bottom_mm, mount_left_mm,
    shadow_angle, shadow_blur, shadow_opacity
  )
`

/** Everything the pack needs, in as few round trips as the shapes allow. */
async function readProject(supabase: SupabaseClient, projectId: string) {
  const [project, elevations, works, notes, artists, budget] = await Promise.all([
    supabase.from('projects')
      .select('id, name, client_name, budget, consultant_id')
      .eq('id', projectId).maybeSingle(),
    supabase.from('elevations')
      .select(`id, name, display_order, client_picked_option, elevation_options(${OPTION_SELECT})`)
      .eq('project_id', projectId)
      .order('display_order', { ascending: true }),
    supabase.from('works')
      .select('id, artist, artist_id, name, image_path, w_cm, h_cm, price, vat_applies, discount_status, discount_percent, sub_line_items, year, medium, edition, source, set_aside, considered_for, display_order')
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
  ])

  return {
    project: project.data as { id: string; name: string; client_name: string | null; budget: number | null; consultant_id: string } | null,
    elevations: (elevations.data ?? []) as unknown as ElevationRow[],
    works: (works.data ?? []) as unknown as WorkRow[],
    notes: ((notes.data ?? []) as unknown as NoteRow[]).map(rowToNote),
    artists: (artists.data ?? []) as Array<{ id: string; name: string; note: string | null }>,
    budget: budget.data as BudgetRow | null,
  }
}

// ── Turning notes into the export's shape ──────────────────────────────────

/**
 * Notes for one anchor, already filtered.
 *
 * `notesForExport` is applied once, here, to the whole set — the filter that
 * drops private and empty notes lives in exactly one place and this is the
 * only call site in the pack.
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

// ── Images ─────────────────────────────────────────────────────────────────

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
  supabase: SupabaseClient, opt: OptionRow, workById: Map<string, WorkRow>,
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
  const placed = (opt.artworks ?? []).filter(a => a.visible && workById.get(a.work_id)?.image_path)
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
function buildBudget(
  chosen: Array<{ opt: OptionRow; works: WorkRow[] }>,
  budgetRow: BudgetRow | null,
  clientBudget: number | null,
  budgetNotes: ExportNote[],
  imageFile: string | null,
) {
  const lines: ExportBudgetLine[] = []
  let total = 0
  /**
   * Artwork prices alone, with no framing, duty or installation in it.
   *
   * This is the base a percentage consultant fee is taken on — see `artMin`
   * in TotalsPanel.tsx, which is `artVatable + artExempt`. Charging the fee
   * on the running total instead would quietly inflate it by a percentage of
   * the framing and the installation.
   */
  let artOnly = 0

  for (const { opt, works } of chosen) {
    for (const a of (opt.artworks ?? []).filter(p => p.visible)) {
      const w = works.find(x => x.id === a.work_id)
      if (!w) continue
      const net = netPrice({
        price: w.price ?? 0,
        discountStatus: parseDiscountStatus(w.discount_status),
        discountPercent: parseDiscountPercent(w.discount_percent),
      })
      lines.push({ label: `${w.name ?? 'Untitled'} — ${w.artist || 'Unattributed'}`, amount: net })
      total += net
      artOnly += net

      for (const item of parseSubLineItems(w.sub_line_items)) {
        const amount = subItemAmount(item, net)
        if (amount === 0) continue
        lines.push({ label: item.label?.trim() || item.kind, amount, sub: true })
        total += amount
      }
    }
  }

  let totalMax = total

  // Lines the consultant has marked as not shown to the client stay out. The
  // pack is the input to a client proposal, and the budget screen's own
  // `shownToClient` is the answer to "may they see this?" — asking it a
  // second way here would be a second answer to drift from.
  const install = budgetRow?.installation
  if (install && (install.shownToClient ?? true)) {
    // Indicative installation is tiered on how many works are going out, so
    // the count is the ones actually in this export. A confirmed amount
    // ignores the count, which `installCostDisplay` already handles.
    const count = artCountOf(chosen)
    const display = installCostDisplay(install, count, count)
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
      const range = consultantFeeRange(fee, artOnly, artOnly)
      lines.push({ label: `Consultant fee (${fee.amount}%)`, amount: range.min })
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

/** How many works are actually going out, which is what installation is tiered on. */
function artCountOf(chosen: Array<{ opt: OptionRow; works: WorkRow[] }>): number {
  let n = 0
  for (const { opt, works } of chosen) {
    for (const a of (opt.artworks ?? []).filter(p => p.visible)) {
      if (works.some(w => w.id === a.work_id)) n += 1
    }
  }
  return n
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
  const { project, elevations, works, notes, artists, budget } = await readProject(supabase, projectId)
  if (!project) return null

  const workById = new Map(works.map(w => [w.id, w]))
  const nameOf = (id: string) => workById.get(id)?.name ?? undefined

  // The one filter for what may leave the studio, applied once.
  const visible = notesForExport(notes)

  // Which option was picked for each elevation. An elevation the consultant
  // unticked contributes nothing — not an empty section, no mention at all.
  //
  // `options` is carried alongside because the option's *title* is a function
  // of its position among its siblings, never of the stored key — see
  // options.ts. Taking the first match also enforces the invariant the rest
  // of the pack assumes: at most one option per elevation, whatever the
  // request asked for.
  const wanted = new Set(choices.optionIds)
  const chosen: Array<{ elev: ElevationRow; opt: OptionRow; options: OptionRow[] }> = []
  for (const elev of elevations) {
    const options = sortOptions(elev.elevation_options ?? [])
    const opt = options.find(o => wanted.has(o.id))
    if (opt) chosen.push({ elev, opt, options })
  }

  const files: PackFile[] = []
  const taken = new Set<string>()

  // ── Wall renders, one per chosen option ──
  const renderPaths = new Map<string, string>()
  if (choices.includeWallRenders) {
    for (const { elev, opt } of chosen) {
      const bytes = await renderWall(supabase, opt, workById)
      if (!bytes) continue
      const path = uniquePath(taken, 'images/elevations', fileSlug(elev.name, 'elevation'), '.jpg')
      files.push({ path, bytes })
      renderPaths.set(opt.id, path)
    }
  }

  // ── The cached option thumbnails, where they were asked for ──
  const thumbPaths = new Map<string, string>()
  if (choices.includeThumbnails) {
    for (const { elev, opt } of chosen) {
      if (!opt.thumbnail_path) continue
      const bytes = await download(supabase, 'thumbnails', opt.thumbnail_path)
      if (!bytes) continue
      const path = uniquePath(taken, 'images/thumbnails', fileSlug(elev.name, 'elevation'), '.png')
      files.push({ path, bytes })
      thumbPaths.set(opt.id, path)
    }
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
  const hangsOn = new Map<string, string[]>()
  for (const { elev, opt } of chosen) {
    for (const a of (opt.artworks ?? []).filter(p => p.visible)) {
      const list = hangsOn.get(a.work_id) ?? []
      if (!list.includes(elev.name)) list.push(elev.name)
      hangsOn.set(a.work_id, list)
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
  }))

  const exportElevations: ExportElevation[] = chosen.map(({ elev, opt, options }) => {
    const placed = (opt.artworks ?? [])
      .filter(p => p.visible && workById.has(p.work_id))
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    return {
      id: elev.id,
      name: elev.name,
      notes: notesFor(visible, 'elevation', elev.id, nameOf),
      option: {
        id: opt.id,
        // The letter is a position, never the stored key — see options.ts.
        title: optionTitleFor(options, opt.option),
        picked: elev.client_picked_option === opt.option,
        wallWCm: opt.wall_w_cm,
        wallHCm: opt.wall_h_cm,
        renderFile: renderPaths.get(opt.id) ?? null,
        thumbnailFile: thumbPaths.get(opt.id) ?? null,
        workIds: placed.map(p => p.work_id),
        notes: notesFor(visible, 'option', opt.id, nameOf),
      },
    }
  })

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
      chosen.map(({ opt }) => ({ opt, works })),
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

  const path = `${projectId}.zip`

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
