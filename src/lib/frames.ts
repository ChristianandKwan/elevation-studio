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
  const hex = frameHex(type)
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}
