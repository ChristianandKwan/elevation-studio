/**
 * The order works hang in, as a reader of the wall sees them: left to right,
 * top first where two share a left edge.
 *
 * Positions are the artwork's recorded top-left corner as a fraction of the
 * wall photograph — the bands grow right and down from there — so sorting on
 * them is sorting on where each work starts.
 */
export function hangingOrder<T extends { x_fraction: number; y_fraction: number }>(placed: T[]): T[] {
  return [...placed].sort((a, b) => (a.x_fraction - b.x_fraction) || (a.y_fraction - b.y_fraction))
}
