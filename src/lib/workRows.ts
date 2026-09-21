import type { Artwork, Work } from '@/types'
import { readLineItemFields } from './lineItems'
import { parseWorkStatus } from './works'

/**
 * Database rows → the app's Work and Artwork shapes.
 *
 * Both page loaders and the thumbnail pipeline come through here so the
 * three cannot drift. Every value is defended: a row read before a migration
 * ran must not take a screen down.
 */

type Row = Record<string, unknown>

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** A `works` row as the app holds it. The signed URL is minted by the loader. */
export function rowToWork(row: Row, imageUrl: string | null): Work {
  return {
    id: row.id as string,
    projectId: str(row.project_id),
    artist: str(row.artist),
    artistId: strOrNull(row.artist_id),
    name: str(row.name, 'Untitled'),
    imagePath: strOrNull(row.image_path),
    imageUrl,
    wCm: num(row.w_cm, 40),
    hCm: num(row.h_cm, 60),
    price: num(row.price, 0),
    ...readLineItemFields(row),
    year: strOrNull(row.year),
    medium: strOrNull(row.medium),
    edition: strOrNull(row.edition),
    source: strOrNull(row.source),
    status: parseWorkStatus(row.status),
    consideredFor: strOrNull(row.considered_for),
    displayOrder: num(row.display_order, 0),
  }
}

/**
 * A placement row with its work joined in (`work:works(...)`), flattened to
 * the studio's Artwork. Null for a placement whose work is missing — a row
 * the old code wrote between running migration 026 and deploying; 027
 * attaches those, and until then the wall simply doesn't show them.
 */
export function placementToArtwork(row: Row, imageUrl: string | null): Artwork | null {
  const work = row.work as Row | null | undefined
  if (!work || typeof work !== 'object' || !work.id) return null
  const w = rowToWork(work, imageUrl)
  return {
    id: row.id as string,
    workId: w.id,
    name: w.name,
    imageUrl,
    imagePath: w.imagePath,
    wCm: w.wCm,
    hCm: w.hCm,
    xF: num(row.x_fraction, 0.08),
    yF: num(row.y_fraction, 0.08),
    visible: row.visible !== false,
    price: w.price,
    artist: w.artist,
    note: w.note,
    noteShownToClient: w.noteShownToClient,
    vatApplies: w.vatApplies,
    discountStatus: w.discountStatus,
    discountPercent: w.discountPercent,
    subLineItems: w.subLineItems,
    frameType: strOrNull(row.frame_type),
    frameWidthMm: numOrNull(row.frame_width_mm),
    // Zero, not null, for a row written before 027 ran.
    mountColor: strOrNull(row.mount_color),
    mountTopMm: num(row.mount_top_mm, 0),
    mountRightMm: num(row.mount_right_mm, 0),
    mountBottomMm: num(row.mount_bottom_mm, 0),
    mountLeftMm: num(row.mount_left_mm, 0),
    brightness: num(row.brightness, 1),
    fade: numOrNull(row.fade),
    shadowAngle: numOrNull(row.shadow_angle),
    shadowBlur: numOrNull(row.shadow_blur),
    shadowOpacity: numOrNull(row.shadow_opacity),
  }
}

/** The image path a placement's work points at, if any. */
export function placementImagePath(row: Row): string | null {
  const work = row.work as Row | null | undefined
  return work && typeof work === 'object' ? strOrNull(work.image_path) : null
}

/** Placement rows → artworks in display order, dropping any whose work is missing. */
export function placementsToArtworks(
  rows: Row[] | null | undefined,
  urlFor: (path: string | null) => string | null,
): Artwork[] {
  return [...(rows ?? [])]
    .sort((a, b) => num(a.display_order, 0) - num(b.display_order, 0))
    .map(r => placementToArtwork(r, urlFor(placementImagePath(r))))
    .filter((a): a is Artwork => a !== null)
}
