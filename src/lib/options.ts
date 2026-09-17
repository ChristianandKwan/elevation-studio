/**
 * Elevation options: ordering and labelling.
 *
 * This is the ONE place that decides what order an elevation's options
 * appear in and what letter each one shows. Every screen that lists
 * options — studio tab strip, client portal, budget, PNG export,
 * dashboard thumbnail, activity-log text — goes through here.
 *
 * Two ideas that used to be the same thing are now separate:
 *
 *   `option`      The stored KEY (a single letter, unique per elevation).
 *                 Stable identity for a row: it is what
 *                 `elevations.client_picked_option` points at and what the
 *                 studio's "active option" state holds. Never shown.
 *
 *   `label`       The DISPLAY letter, derived from position: first = A,
 *                 second = B, … It follows the row when it is moved and is
 *                 never reused from a deleted tab, because it isn't stored.
 *
 * Position comes from `sort_order` (migration 023). The fallbacks below
 * only matter for rows that somehow have equal sort_order values.
 */

export interface OrderableOption {
  /** Stored key — stable identity, NOT the display letter. */
  option: string
  sort_order?: number | null
  created_at?: string | null
}

export type Labelled<T> = T & { label: string }

/** Return the options in display order. Never mutates the input. */
export function sortOptions<T extends OrderableOption>(options: readonly T[]): T[] {
  return [...options].sort((a, b) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0)
    || (a.created_at ?? '').localeCompare(b.created_at ?? '')
    || a.option.localeCompare(b.option),
  )
}

/** Display letter for a 0-based position: 0 → A … 25 → Z, 26 → AA. */
export function optionLabel(position: number): string {
  let n = Math.max(0, Math.floor(position))
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/** Sort, then attach each option's display letter. */
export function labelOptions<T extends OrderableOption>(options: readonly T[]): Labelled<T>[] {
  return sortOptions(options).map((o, i) => ({ ...o, label: optionLabel(i) }))
}

/**
 * Display letter for the option with this key. Falls back to the key
 * itself if it isn't among the given options, so old activity text and
 * stale picks still read as something.
 */
export function optionLabelFor(options: readonly OrderableOption[], key: string | null | undefined): string {
  if (!key) return ''
  const i = sortOptions(options).findIndex(o => o.option === key)
  return i < 0 ? key : optionLabel(i)
}

/** Lowest unused key letter for a new option, or null when all 26 are taken. */
export function nextOptionKey(existing: readonly OrderableOption[]): string | null {
  const used = new Set(existing.map(o => o.option))
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c)
    if (!used.has(letter)) return letter
  }
  return null
}

/** sort_order for a new option added at the end of the elevation. */
export function nextSortOrder(existing: readonly OrderableOption[]): number {
  return existing.reduce((max, o) => Math.max(max, (o.sort_order ?? 0) + 1), 0)
}

/** Badge colour follows the display letter, so "A" and "B" keep their house colours. */
export function optionTagClass(label: string): string {
  if (label === 'A') return 'tag tag-option-a'
  if (label === 'B') return 'tag tag-option-b'
  return 'tag tag-option-other'
}
