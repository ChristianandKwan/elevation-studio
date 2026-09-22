/**
 * What the consultant types in when adding works, and how that typing becomes
 * one work each.
 *
 * Adding from the Index is usually a set: five prints by one artist, one
 * medium, one edition line, out of one gallery. Those belong to the batch and
 * are typed once. A title, a size and a price belong to the single work.
 *
 * No runtime imports, so `node --test` can run it.
 */

/**
 * Detail typed once for a whole batch.
 *
 * `artist` is the odd one out: it fills each work's own artist box rather than
 * being folded in here, because a batch can hold one work by somebody else and
 * an emptied box has to mean unattributed, not "use the batch's".
 */
export interface BatchMeta {
  artist: string
  year: string
  medium: string
  edition: string
  source: string
}

/** One work's own fields, held as strings while they are being typed. */
export interface TypedWork {
  name: string
  wStr: string
  hStr: string
  priceStr: string
  artist: string
}

/** One work, ready to upload. */
export interface WorkMeta {
  name: string
  wCm: number
  hCm: number
  price: number
  artist: string
  /** The artist row the name resolved to; null when unattributed. */
  artistId: string | null
  year: string | null
  medium: string | null
  edition: string | null
  source: string | null
}

export const DEFAULT_W = 40
export const DEFAULT_H = 60

export const EMPTY_BATCH: BatchMeta = { artist: '', year: '', medium: '', edition: '', source: '' }

/** Free text stored as null when empty, so the export doesn't print a blank row. */
export function blankAsNull(value: string): string | null {
  return value.trim() || null
}

/** A typed size, or the default when what was typed is not a size. */
function cm(value: string, fallback: number): number {
  const n = parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** A typed price, or nothing. Half-typed text is not a price. */
function money(value: string): number {
  const n = parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Fold the batch's detail into each typed work.
 *
 * `withCatalogue` is false for the studio uploader, which asks for none of it:
 * year, medium, edition and source are filled in from the Index, where there
 * is room to read them off a gallery page.
 *
 * A name left empty stays empty — the upload puts the filename there, which
 * is more use than "Untitled".
 */
export function buildWorkMetas(
  rows: TypedWork[],
  batch: BatchMeta,
  { withCatalogue }: { withCatalogue: boolean },
): WorkMeta[] {
  return rows.map(row => ({
    name: row.name.trim(),
    wCm: cm(row.wStr, DEFAULT_W),
    hCm: cm(row.hStr, DEFAULT_H),
    price: money(row.priceStr),
    artist: row.artist.trim(),
    artistId: null,
    year: withCatalogue ? blankAsNull(batch.year) : null,
    medium: withCatalogue ? blankAsNull(batch.medium) : null,
    edition: withCatalogue ? blankAsNull(batch.edition) : null,
    source: withCatalogue ? blankAsNull(batch.source) : null,
  }))
}

/**
 * The batch's artist copied down onto the works that have not been given one
 * by hand. Typing the artist at the top of five prints is the point of the
 * batch fields; typing over one of them has to survive the next keystroke up
 * there, which is what `handEdited` carries.
 */
export function fillArtistDown(
  rows: TypedWork[],
  artist: string,
  handEdited: ReadonlySet<number>,
): TypedWork[] {
  return rows.map((row, i) => (handEdited.has(i) ? row : { ...row, artist }))
}
