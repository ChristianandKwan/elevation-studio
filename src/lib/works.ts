import type { Artwork, Work, WorkStatus } from '@/types'

/**
 * A work belongs to the project; a placement puts it on an elevation option.
 *
 * The database table for placements is still called `artworks` — renaming it
 * with hand-run migrations and independent deploys would take the live app
 * down — so in the code a "placement" is a row of `artworks` and a "work" is
 * a row of `works`. The studio's flat `Artwork` shape is a placement with its
 * work's fields folded in, which is what the canvas, sidebar, budget and
 * client portal all read. Migration 026 tells the full story.
 *
 * This module has no runtime imports so `node --test` can run it.
 */

export const WORK_STATUSES: WorkStatus[] = ['proposed', 'considered', 'declined']

export const WORK_STATUS_LABEL: Record<WorkStatus, string> = {
  proposed: 'Proposed',
  considered: 'Considered',
  declined: 'Declined',
}

export const WORK_STATUS_HINT: Record<WorkStatus, string> = {
  proposed: 'Put forward to the client.',
  considered: 'Looked at, not put forward yet.',
  declined: 'Not recommended. Say why in the note — it stays in the record.',
}

export function parseWorkStatus(raw: unknown): WorkStatus {
  return WORK_STATUSES.includes(raw as WorkStatus) ? (raw as WorkStatus) : 'proposed'
}

/** The columns a placement row carries: where it hangs, how it is framed and lit. */
export const PLACEMENT_COLUMNS =
  'id, work_id, x_fraction, y_fraction, visible, display_order, frame_type, frame_width_mm, brightness, fade, shadow_angle, shadow_blur, shadow_opacity'

/** The columns a work row carries. */
export const WORK_COLUMNS =
  'id, project_id, artist, name, image_path, w_cm, h_cm, price, vat_applies, discount_status, discount_percent, sub_line_items, note, note_shown_to_client, year, medium, edition, source, status, considered_for, display_order'

/** A placement with its work joined in — what the studio and portal loaders select. */
export const PLACEMENT_WITH_WORK_SELECT = `${PLACEMENT_COLUMNS}, work:works(${WORK_COLUMNS})`

/** The half of a studio artwork that is about where it hangs. Written to `artworks` by placement id. */
export function placementRow(art: Artwork) {
  return {
    x_fraction: art.xF,
    y_fraction: art.yF,
    visible: art.visible,
    frame_type: art.frameType ?? null,
    frame_width_mm: art.frameWidthMm ?? null,
    brightness: art.brightness ?? 1,
    fade: art.fade ?? null,
    shadow_angle: art.shadowAngle ?? null,
    shadow_blur: art.shadowBlur ?? null,
    shadow_opacity: art.shadowOpacity ?? null,
  }
}

/**
 * The half that is about the work itself. Written to `works` by work id, so
 * a size or price changed on one wall changes on every wall it hangs on.
 */
export function workRow(art: Artwork) {
  return {
    name: art.name,
    artist: art.artist,
    w_cm: art.wCm,
    h_cm: art.hCm,
    price: art.price,
    note: art.note,
    note_shown_to_client: art.noteShownToClient,
    vat_applies: art.vatApplies,
    discount_status: art.discountStatus,
    discount_percent: art.discountPercent,
    sub_line_items: art.subLineItems,
  }
}

/** What the budget and the index may change on a work. */
export type WorkPatch = Partial<Pick<Work,
  | 'name' | 'artist' | 'wCm' | 'hCm' | 'price' | 'vatApplies' | 'discountStatus'
  | 'discountPercent' | 'subLineItems' | 'note' | 'noteShownToClient'
  | 'year' | 'medium' | 'edition' | 'source' | 'status' | 'consideredFor'
>>

/** Map a patch onto the columns it writes. */
export function toWorkColumns(patch: WorkPatch): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.artist !== undefined) row.artist = patch.artist
  if (patch.wCm !== undefined) row.w_cm = patch.wCm
  if (patch.hCm !== undefined) row.h_cm = patch.hCm
  if (patch.price !== undefined) row.price = patch.price
  if (patch.vatApplies !== undefined) row.vat_applies = patch.vatApplies
  if (patch.discountStatus !== undefined) row.discount_status = patch.discountStatus
  if (patch.discountPercent !== undefined) row.discount_percent = patch.discountPercent
  if (patch.subLineItems !== undefined) row.sub_line_items = patch.subLineItems
  if (patch.note !== undefined) row.note = patch.note
  if (patch.noteShownToClient !== undefined) row.note_shown_to_client = patch.noteShownToClient
  if (patch.year !== undefined) row.year = patch.year
  if (patch.medium !== undefined) row.medium = patch.medium
  if (patch.edition !== undefined) row.edition = patch.edition
  if (patch.source !== undefined) row.source = patch.source
  if (patch.status !== undefined) row.status = patch.status
  if (patch.consideredFor !== undefined) row.considered_for = patch.consideredFor
  return row
}

/**
 * Where a new upload goes. Two path levels, like the old
 * `{projectId}/{optionId}/…` layout, so the nightly storage sweep walks it
 * unchanged — it decides what is live by the paths in `works`, not by folder.
 */
export function workStoragePath(projectId: string, fileName: string, uuid: string): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot > 0 ? fileName.slice(dot + 1) : 'jpg'
  return `${projectId}/works/art-${uuid}.${ext}`
}

export const UNATTRIBUTED = 'Unattributed'

export interface ArtistGroup { key: string; label: string; works: Work[] }

/** Works grouped by artist, as the index lists them. Unattributed works come last. */
export function groupWorksByArtist(works: Work[]): ArtistGroup[] {
  const groups = new Map<string, ArtistGroup>()
  for (const w of works) {
    const label = w.artist.trim() || UNATTRIBUTED
    const key = label.toLowerCase()
    const g = groups.get(key) ?? { key, label, works: [] }
    g.works.push(w)
    groups.set(key, g)
  }
  const out = [...groups.values()]
  for (const g of out) g.works.sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  out.sort((a, b) => {
    if (a.label === UNATTRIBUTED) return 1
    if (b.label === UNATTRIBUTED) return -1
    return a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
  })
  return out
}

/** An elevation as the index sees it: its name and, per option, the label and the works hung on it. */
export interface IndexElevation {
  id: string
  name: string
  options: Array<{ label: string; workIds: string[] }>
}

export interface Placed { elevationId: string; elevationName: string; labels: string[] }

/** Where a work is hung: each elevation it is on, with the option labels. */
export function placementsOf(workId: string, elevations: IndexElevation[]): Placed[] {
  const out: Placed[] = []
  for (const e of elevations) {
    const labels = e.options.filter(o => o.workIds.includes(workId)).map(o => o.label)
    if (labels.length > 0) out.push({ elevationId: e.id, elevationName: e.name, labels })
  }
  return out
}
