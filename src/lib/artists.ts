/**
 * Artists.
 *
 * An artist used to be a spelling on each work. That was survivable while
 * nothing hung off them, and stopped being survivable once notes anchored to
 * one: renaming the artist on their works left those notes pointing at a name
 * nothing had any more — not deleted, just unreachable, with no warning.
 *
 * So an artist is a row, and works and notes point at it by id. A rename is
 * one row changing. `works.artist` stays as the spelling to display, written
 * alongside `artist_id` and kept in step here, so the budget, the client
 * portal and the export carry on reading a name off the work.
 *
 * No runtime imports, so `node --test` can run it.
 */

export interface Artist {
  id: string
  /** The spelling to show. */
  name: string
  /** `artistKey(name)` — unique across the practice. */
  nameKey: string
  /** True of them wherever they hang; carries into every project. */
  note: string
}

/**
 * How a name becomes a key: trimmed, runs of whitespace collapsed to one,
 * lower-cased.
 *
 * This has to agree exactly with `artist_name_key()` in migration 032, which
 * is what the unique constraint is built on. If the two drift, a second
 * spelling of one artist gets in and the whole point is lost.
 */
export function artistKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The display spelling, tidied the same way but with its capitals kept. */
export function tidyArtistName(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ')
}

export interface ArtistRow {
  id: string
  name: string
  name_key: string
  note?: string | null
}

export function rowToArtist(r: ArtistRow): Artist {
  return { id: r.id, name: r.name, nameKey: r.name_key, note: r.note ?? '' }
}

/** Find an artist by however the consultant spelled them. */
export function findArtistByName(artists: Artist[], name: string): Artist | undefined {
  const key = artistKey(name)
  if (!key) return undefined
  return artists.find(a => a.nameKey === key)
}

/**
 * Whether a name being typed is a near-miss for an artist already known —
 * the same letters with different capitals or spacing.
 *
 * Returns the existing artist so the caller can offer them instead of
 * quietly creating a second one. This is the check that would have caught
 * 'Paula scher' arriving beside 'Paula Scher'.
 */
export function nearDuplicateOf(artists: Artist[], typed: string): Artist | undefined {
  const tidy = tidyArtistName(typed)
  if (!tidy) return undefined
  const existing = findArtistByName(artists, tidy)
  // Only a near-miss if the spellings actually differ; an exact match is just
  // the same artist and needs no warning.
  return existing && existing.name !== tidy ? existing : undefined
}

/** Artists in the order a picker should list them. */
export function sortArtists(artists: Artist[]): Artist[] {
  return [...artists].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
}

/**
 * Whether this name can be given to this artist.
 *
 * Empty is refused — an artist with no name is the unattributed group, which
 * is the absence of an artist rather than one of them. A name already taken
 * by a different artist is refused too: allowing it would make two rows
 * indistinguishable on screen while staying separate underneath, which is
 * exactly the confusion this table exists to end.
 */
export function canRenameTo(
  artists: Artist[],
  artistId: string,
  name: string,
): { ok: true } | { ok: false; reason: string } {
  const tidy = tidyArtistName(name)
  if (!tidy) return { ok: false, reason: 'An artist needs a name.' }
  const clash = findArtistByName(artists, tidy)
  if (clash && clash.id !== artistId) {
    return { ok: false, reason: `${clash.name} is already in the list. Merging two artists is not something this can do yet.` }
  }
  return { ok: true }
}
