/**
 * Frames, in one place.
 *
 * A framed artwork is drawn four times over, in three different technologies:
 * the studio canvas and the client portal set a CSS border, the PNG export
 * fills a 2D canvas, and the dashboard picture is composited server-side by
 * sharp, which wants raw channel values rather than hex. Each of those used to
 * carry its own copy of the colour table — four copies of the same five
 * colours, with nothing keeping them honest.
 *
 * Hex is the source. The channel values are derived from it, so the wall, the
 * export, the dashboard and the client can't drift apart.
 *
 * No runtime imports, so `node --test` can run it.
 */

/** Every frame the consultant can choose, in the order the picker lists them. */
export const FRAME_COLORS: Record<string, string> = {
  black: '#1a1a1a',
  white: '#f0ede8',
  'pale-wood': '#c4a882',
  'mid-wood': '#7d5a35',
  'dark-wood': '#3d2814',
}

export type FrameType = keyof typeof FRAME_COLORS

/** The wood frames. Only these carry grain; a painted frame really is flat. */
export const WOOD_FRAMES: readonly string[] = ['pale-wood', 'mid-wood', 'dark-wood']

export function isWoodFrame(type: string | null | undefined): boolean {
  return !!type && WOOD_FRAMES.includes(type)
}

/** "pale-wood" → "pale wood", for the picker. */
export function frameLabel(type: string): string {
  return type.replace(/-/g, ' ')
}

/**
 * The frame's colour as hex. An unknown type falls back to black rather than
 * drawing nothing — a frame the consultant asked for must always be visible.
 */
export function frameHex(type: string | null | undefined): string {
  return (type && FRAME_COLORS[type]) || FRAME_COLORS.black
}

/** The same colour as channel values, for sharp and for canvas pixel work. */
export function frameRgb(type: string | null | undefined): { r: number; g: number; b: number } {
  return hexToRgb(frameHex(type))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

// ─── MOUNTS ───────────────────────────────────────────────
// The card window between the artwork and the frame. Its colours are their
// own set: a mount's "white" is a brighter, cooler card than a painted white
// frame, and the two are never the same paint.

export const MOUNT_COLORS: Record<string, string> = {
  'bright-white': '#ffffff',
  ivory: '#f7f2e4',
  cream: '#eee4cf',
  grey: '#9a958d',
  black: '#1c1a18',
}

export const MOUNT_DEFAULT_MM = 50

/** "bright-white" → "bright white", for the picker. */
export const mountLabel = frameLabel

export function mountHex(color: string | null | undefined): string {
  return (color && MOUNT_COLORS[color]) || MOUNT_COLORS['bright-white']
}

export function mountRgb(color: string | null | undefined): { r: number; g: number; b: number } {
  return hexToRgb(mountHex(color))
}

/** The four mount widths in mm, as every renderer needs them. */
export interface MountInset { top: number; right: number; bottom: number; left: number }

export const NO_MOUNT: MountInset = { top: 0, right: 0, bottom: 0, left: 0 }

/**
 * What mount, if any, a placement actually draws.
 *
 * A colour with every side at zero is not a mount, and neither is a width
 * with no colour chosen — the same pairing frames use. Returns null when
 * there is nothing to draw, so each renderer asks the question once and in
 * the same way.
 */
export function mountOf(art: {
  mountColor?: string | null
  mountTopMm?: number | null
  mountRightMm?: number | null
  mountBottomMm?: number | null
  mountLeftMm?: number | null
}): { hex: string; mm: MountInset } | null {
  if (!art.mountColor) return null
  const mm: MountInset = {
    top:    Math.max(0, art.mountTopMm    ?? 0),
    right:  Math.max(0, art.mountRightMm  ?? 0),
    bottom: Math.max(0, art.mountBottomMm ?? 0),
    left:   Math.max(0, art.mountLeftMm   ?? 0),
  }
  if (mm.top === 0 && mm.right === 0 && mm.bottom === 0 && mm.left === 0) return null
  return { hex: mountHex(art.mountColor), mm }
}

/** True when all four sides match — what the studio shows as one figure. */
export function mountIsUniform(mm: MountInset): boolean {
  return mm.top === mm.right && mm.right === mm.bottom && mm.bottom === mm.left
}

// ─── GRAIN ────────────────────────────────────────────────

/**
 * How strongly the grain reads, as an alpha. Deliberately low: at a 20mm
 * frame it should be barely perceptible, and only become apparent on the
 * wide frames where a flat fill looks like a colour swatch.
 *
 * Light woods take slightly more than dark ones, where the same alpha over a
 * near-black base is invisible.
 */
export const GRAIN_ALPHA: Record<string, number> = {
  'pale-wood': 0.055,
  'mid-wood': 0.07,
  'dark-wood': 0.10,
}

export function grainAlpha(type: string | null | undefined): number {
  return (type && GRAIN_ALPHA[type]) || 0
}

/**
 * The grain's stripe rhythm in millimetres of real frame — so a wide frame
 * shows more lines than a narrow one, rather than the pattern stretching.
 */
export const GRAIN_PITCH_MM = 3.2

/**
 * Where the lines fall within one repeat, and how strongly each reads.
 *
 * Evenly spaced lines look like corduroy, not timber — obvious the moment a
 * frame gets wide. These offsets are deliberately uneven, and the repeat runs
 * over several pitches so the pattern doesn't visibly tile. All three
 * renderers read this same table, so the wall, the export and the dashboard
 * show the same piece of wood.
 */
export const GRAIN_STRIPES: ReadonlyArray<{ at: number; weight: number }> = [
  { at: 0.00, weight: 1.00 },
  { at: 0.17, weight: 0.38 },
  { at: 0.31, weight: 0.72 },
  { at: 0.46, weight: 0.30 },
  { at: 0.58, weight: 0.90 },
  { at: 0.71, weight: 0.42 },
  { at: 0.88, weight: 0.65 },
]

/** One repeat spans this many pitches, so the tiling is harder to spot. */
export const GRAIN_REPEAT_PITCHES = 4

/**
 * The frame and mount bands in pixels, at one renderer's scale.
 *
 * Every renderer works this out the same way so the wall, the export, the
 * dashboard picture and the client portal agree. Note that the bands grow
 * right and down from the artwork's recorded position rather than centring
 * on it — the overlay is content-box with its border outside, and the other
 * three follow it.
 */
export interface BandsPx {
  frame: number
  mount: MountInset
  /** Everything outside the artwork on each side: mount plus frame. */
  outer: MountInset
}

export function bandsPx(
  art: Parameters<typeof mountOf>[0] & { frameType?: string | null; frameWidthMm?: number | null },
  pxPerCm: number,
): BandsPx {
  const frame = art.frameType && art.frameWidthMm
    ? Math.round((art.frameWidthMm / 10) * pxPerCm)
    : 0
  const m = mountOf(art)
  const mount: MountInset = m
    ? {
        top:    Math.round((m.mm.top    / 10) * pxPerCm),
        right:  Math.round((m.mm.right  / 10) * pxPerCm),
        bottom: Math.round((m.mm.bottom / 10) * pxPerCm),
        left:   Math.round((m.mm.left   / 10) * pxPerCm),
      }
    : { ...NO_MOUNT }
  return {
    frame,
    mount,
    outer: {
      top:    mount.top    + frame,
      right:  mount.right  + frame,
      bottom: mount.bottom + frame,
      left:   mount.left   + frame,
    },
  }
}

/**
 * Grain as a CSS gradient, for the two renderers that draw with CSS.
 *
 * Wood grain runs along the length of the timber, so the top and bottom rails
 * of a frame are striped one way and the sides the other. `runs` is the
 * direction the grain travels, so a top rail asks for 'horizontal'.
 *
 * Two lines per repeat — one darker than the timber, one lighter — because a
 * single dark line reads as a scratch rather than as grain.
 */
export function grainCss(alpha: number, pitchPx: number, runs: 'horizontal' | 'vertical'): string {
  const repeat = Math.max(6, pitchPx * GRAIN_REPEAT_PITCHES)
  // Stripes lie across the direction the grain runs.
  const axis = runs === 'horizontal' ? 'to bottom' : 'to right'

  const stops: string[] = []
  let cursor = 0
  for (const s of GRAIN_STRIPES) {
    const at = Math.round(s.at * repeat)
    if (at > cursor) stops.push(`rgba(0,0,0,0) ${cursor}px, rgba(0,0,0,0) ${at}px`)
    const dark = (alpha * s.weight).toFixed(3)
    const light = (alpha * s.weight * 0.5).toFixed(3)
    stops.push(`rgba(0,0,0,${dark}) ${at}px, rgba(0,0,0,${dark}) ${at + 1}px`)
    stops.push(`rgba(255,255,255,${light}) ${at + 1}px, rgba(255,255,255,${light}) ${at + 2}px`)
    cursor = at + 2
  }
  if (cursor < repeat) stops.push(`rgba(0,0,0,0) ${cursor}px, rgba(0,0,0,0) ${repeat}px`)

  return `repeating-linear-gradient(${axis}, ${stops.join(', ')})`
}

/** The four rails of a frame, as rectangles inside an outer box of w × h. */
export function frameRails(w: number, h: number, frame: number): Array<{
  x: number; y: number; w: number; h: number; runs: 'horizontal' | 'vertical'
}> {
  if (frame <= 0) return []
  return [
    { x: 0,         y: 0,         w,                    h: frame,     runs: 'horizontal' },
    { x: 0,         y: h - frame, w,                    h: frame,     runs: 'horizontal' },
    { x: 0,         y: frame,     w: frame,             h: h - frame * 2, runs: 'vertical' },
    { x: w - frame, y: frame,     w: frame,             h: h - frame * 2, runs: 'vertical' },
  ]
}

/**
 * The same grain as an SVG, for the server-side dashboard render.
 *
 * sharp composites this over a frame already filled with its base colour.
 * Returns null when the frame takes no grain, so the caller can skip the
 * composite entirely rather than laying down a transparent layer.
 */
export function frameGrainSvg(
  frameType: string | null | undefined,
  outerW: number,
  outerH: number,
  framePx: number,
  pxPerCm: number,
): string | null {
  const alpha = grainAlpha(frameType)
  if (!isWoodFrame(frameType) || alpha <= 0 || framePx <= 0) return null

  const pitch = Math.max(2, (GRAIN_PITCH_MM / 10) * pxPerCm)
  const repeat = Math.max(6, Math.round(pitch * GRAIN_REPEAT_PITCHES))

  const lines = (vertical: boolean) => GRAIN_STRIPES.map(st => {
    const at = Math.round(st.at * repeat)
    const dark = (alpha * st.weight).toFixed(3)
    const light = (alpha * st.weight * 0.5).toFixed(3)
    return vertical
      ? `<rect x="${at}" y="0" width="1" height="${repeat}" fill="#000" opacity="${dark}"/>` +
        `<rect x="${at + 1}" y="0" width="1" height="${repeat}" fill="#fff" opacity="${light}"/>`
      : `<rect x="0" y="${at}" width="${repeat}" height="1" fill="#000" opacity="${dark}"/>` +
        `<rect x="0" y="${at + 1}" width="${repeat}" height="1" fill="#fff" opacity="${light}"/>`
  }).join('')

  // Two patterns: lines stacked across a rail whose grain runs along it, and
  // lines stacked along one whose grain runs up it.
  const defs =
    `<pattern id="gh" patternUnits="userSpaceOnUse" width="${repeat}" height="${repeat}">` +
      lines(false) +
    `</pattern>` +
    `<pattern id="gv" patternUnits="userSpaceOnUse" width="${repeat}" height="${repeat}">` +
      lines(true) +
    `</pattern>`

  const rects = frameRails(outerW, outerH, framePx)
    .map(r => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ` +
              `fill="url(#${r.runs === 'horizontal' ? 'gh' : 'gv'})"/>`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outerW}" height="${outerH}">` +
         `<defs>${defs}</defs>${rects}</svg>`
}
