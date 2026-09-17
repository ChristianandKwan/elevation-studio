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
 *   `letter`      The position letter: first = A, second = B, … It follows
 *                 the row when it is moved and is never reused from a
 *                 deleted tab, because it isn't stored.
 *
 *   `name`        An optional name the consultant gave the option
 *                 ("Kandinsky 1"). When set it replaces the letter.
 *
 *   `label`       What to show in a tab: the name if set, else the letter.
 *   `title`       What to say in a sentence: the name if set, else
 *                 "Option A" — so copy reads "Pick Kandinsky 1" or
 *                 "Pick Option A", never "Pick Option Kandinsky 1".
 *
 * Position comes from `sort_order` (migration 023). The fallbacks below
 * only matter for rows that somehow have equal sort_order values.
 */

export interface OrderableOption {
  /** Stored key — stable identity, NOT the display letter. */
  option: string
  sort_order?: number | null
  created_at?: string | null
  /** Optional consultant-given name; null/blank means "use the letter". */
  name?: string | null
}

export type Labelled<T> = T & { letter: string; label: string; title: string }

/** Longest option name accepted (matches the column check in migration 023). */
export const OPTION_NAME_MAX = 40

/** The option's name, trimmed and capped, or null when it has none. */
export function cleanOptionName(name: string | null | undefined): string | null {
  const trimmed = (name ?? '').trim().slice(0, OPTION_NAME_MAX)
  return trimmed || null
}

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

/** Sort, then attach each option's letter, tab label and sentence title. */
export function labelOptions<T extends OrderableOption>(options: readonly T[]): Labelled<T>[] {
  return sortOptions(options).map((o, i) => {
    const letter = optionLabel(i)
    const name = cleanOptionName(o.name)
    return { ...o, letter, label: name ?? letter, title: name ?? `Option ${letter}` }
  })
}

/**
 * Tab label (name or letter) for the option with this key. Falls back to
 * the key itself if it isn't among the given options, so stale picks still
 * read as something.
 */
export function optionLabelFor(options: readonly OrderableOption[], key: string | null | undefined): string {
  if (!key) return ''
  return labelOptions(options).find(o => o.option === key)?.label ?? key
}

/** Sentence title ("Kandinsky 1" or "Option A") for the option with this key. */
export function optionTitleFor(options: readonly OrderableOption[], key: string | null | undefined): string {
  if (!key) return ''
  return labelOptions(options).find(o => o.option === key)?.title ?? `Option ${key}`
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

/** Badge colour follows the position letter, so "A" and "B" keep their house colours. */
export function optionTagClass(letter: string): string {
  if (letter === 'A') return 'tag tag-option-a'
  if (letter === 'B') return 'tag tag-option-b'
  return 'tag tag-option-other'
}
