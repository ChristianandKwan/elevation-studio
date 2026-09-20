/**
 * The wall itself, in one place.
 *
 * An elevation is usually a photograph of a real wall. It can also be a wall
 * that only exists as a measurement — "the east wall is 420 × 260" — with no
 * photograph at all. Both end up as a rectangle of known size with a known
 * number of pixels per centimetre, and everything downstream (artwork
 * placement, frames, mounts, shadows, the budget) works the same on either.
 *
 * The photograph brings its own pixels. A plain wall has none, so it is given
 * some: a resolution is chosen from its real size, and the four renderers each
 * fill that rectangle with a flat colour. The studio canvas and the client
 * portal point an <img> at an SVG data URL; the PNG export fills the canvas;
 * the dashboard picture has sharp create a flat image. Nothing else changes.
 *
 * No runtime imports, so `node --test` can run it.
 */

/**
 * Pixels per centimetre given to a wall that has no photograph.
 *
 * A photographed wall lands somewhere around 5–10 px/cm in practice — a 3000
 * px photo of a four-metre wall is 7.5. Ten is at the comfortable end of that
 * range, so a plain wall is never the thing limiting how sharp an artwork can
 * be, and artworks keep the same order of detail whichever kind of wall they
 * hang on.
 */
export const BLANK_WALL_PX_PER_CM = 10

/**
 * Ceiling on the longest edge. A twenty-metre wall at 10 px/cm would be 20000
 * px, which no browser will allocate as a canvas. Past this the resolution is
 * reduced rather than the wall being refused — a very long wall is a real
 * thing to plan, and it is shown in less detail rather than not at all.
 */
export const BLANK_WALL_MAX_EDGE = 6000

/** Bounds on what can be typed, in centimetres. */
export const WALL_MIN_CM = 10
export const WALL_MAX_CM = 2000

/** The default a new plain wall opens with — a fairly ordinary room. */
export const DEFAULT_WALL_W_CM = 400
export const DEFAULT_WALL_H_CM = 260
export const DEFAULT_WALL_COLOR = '#ece8e1'

/**
 * Presets in the picker, for speed. The consultant is not limited to these —
 * the colour is stored as hex and any colour can be chosen — but most walls
 * are one of a handful of off-whites and greys, and clicking is faster than
 * mixing.
 */
export const WALL_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: 'Brilliant white', hex: '#f7f6f4' },
  { label: 'Off white',       hex: '#ece8e1' },
  { label: 'Chalk',           hex: '#e2ddd2' },
  { label: 'Warm grey',       hex: '#cfc8bd' },
  { label: 'Stone',           hex: '#b5ada1' },
  { label: 'Sage',            hex: '#a8b0a0' },
  { label: 'Slate blue',      hex: '#8b98a5' },
  { label: 'Charcoal',        hex: '#4a4845' },
]

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/** True when this option is a plain wall rather than a photograph. */
export function isBlankWall(o: {
  imagePath?: string | null
  wallColor?: string | null
}): boolean {
  return !o.imagePath && !!o.wallColor
}

/**
 * A stored colour as hex. Anything unrecognised falls back to the default
 * rather than drawing nothing — a wall that renders transparent would look
 * like a broken image, and the size it was entered at is still worth seeing.
 */
export function wallHex(color: string | null | undefined): string {
  return color && HEX_RE.test(color) ? color.toLowerCase() : DEFAULT_WALL_COLOR
}

/** The same colour as channel values, for sharp and for canvas pixel work. */
export function wallRgb(color: string | null | undefined): { r: number; g: number; b: number } {
  const hex = wallHex(color)
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/**
 * How many pixels a plain wall of this size gets, and the scale that follows
 * from it.
 *
 * The scale is *derived*, which is the point: a photographed wall has to be
 * calibrated by drawing a line along something of known length, and a wall
 * entered as a measurement already knows. There is no calibration step.
 */
export function blankWallPixels(wCm: number, hCm: number): {
  origW: number
  origH: number
  pxPerCm: number
} {
  const w = clampCm(wCm)
  const h = clampCm(hCm)
  const byEdge = BLANK_WALL_MAX_EDGE / Math.max(w, h)
  const pxPerCm = Math.min(BLANK_WALL_PX_PER_CM, byEdge)
  return {
    origW: Math.max(1, Math.round(w * pxPerCm)),
    origH: Math.max(1, Math.round(h * pxPerCm)),
    pxPerCm,
  }
}

export function clampCm(cm: number): number {
  if (!Number.isFinite(cm)) return WALL_MIN_CM
  return Math.min(WALL_MAX_CM, Math.max(WALL_MIN_CM, cm))
}

/**
 * The wall as an SVG document. Flat colour, no gradient and no texture: a
 * painted wall photographs flat at this scale, and anything else would be a
 * pattern the consultant did not ask for sitting behind every artwork.
 */
export function blankWallSvg(origW: number, origH: number, color: string | null | undefined): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${origW}" height="${origH}" viewBox="0 0 ${origW} ${origH}"><rect width="${origW}" height="${origH}" fill="${wallHex(color)}"/></svg>`
}

/**
 * The wall as something an <img> can load. Stays a few hundred bytes however
 * large the wall is, so nothing is uploaded and nothing has to be cleaned up
 * later: a plain wall costs no storage at all.
 */
export function blankWallDataUrl(origW: number, origH: number, color: string | null | undefined): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(blankWallSvg(origW, origH, color))}`
}

/**
 * What the studio, the client portal and the dashboard should point an <img>
 * at for this option — the photograph if there is one, a generated wall if
 * there is not, and null if the option is still empty.
 */
export function wallImageUrl(o: {
  imageUrl?: string | null
  origW?: number | null
  origH?: number | null
  wallColor?: string | null
}): string | null {
  if (o.imageUrl) return o.imageUrl
  if (!o.wallColor) return null
  const w = o.origW || 0
  const h = o.origH || 0
  if (!w || !h) return null
  return blankWallDataUrl(w, h, o.wallColor)
}

/** "420 × 260 cm", for the sidebar and the tab. */
export function wallSizeLabel(wCm: number | null | undefined, hCm: number | null | undefined): string {
  if (!wCm || !hCm) return 'Plain wall'
  return `${round1(wCm)} × ${round1(hCm)} cm`
}

function round1(n: number): string {
  return String(Math.round(n * 10) / 10)
}
