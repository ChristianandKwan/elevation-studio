/**
 * The shadow a frame's inner lip throws onto the artwork it holds.
 *
 * A frame stands proud of the picture, so under the same light that casts the
 * artwork's shadow on the wall, the lip casts a shallower one onto the picture
 * along the edges nearest the light. It is just as dark, but spreads about
 * two-thirds as far, because the lip is shallower than the gap to the wall.
 *
 * Shared by the studio overlay, the client portal, the PNG export and the
 * dashboard thumbnails, so all four draw the same shadow. Safe to import from
 * both client and server code.
 */
export const FRAME_LIP_SPREAD = 2 / 3

/**
 * Offset and blur of the lip shadow, in the same pixels as `blur` (display
 * pixels as stored). Follows the wall shadow's geometry: offset is 0.55 of
 * the blur, pointing away from the light at `angle`.
 *
 * `blur` comes back as a box-shadow / canvas shadowBlur length, which is
 * twice the Gaussian's standard deviation. The wall shadow is a CSS
 * drop-shadow, whose blur *is* the standard deviation, so the doubling is what
 * keeps the lip at two-thirds of the wall shadow's spread rather than a third.
 */
export function frameLipShadow(angle: number | null | undefined, blur: number) {
  const rad = ((angle ?? 225) * Math.PI) / 180
  const lipBlur = blur * FRAME_LIP_SPREAD
  const dist = lipBlur * 0.55
  return { x: -Math.sin(rad) * dist, y: Math.cos(rad) * dist, blur: lipBlur * 2 }
}

/**
 * An element to lay over the artwork (inside the frame's border) carrying the
 * lip shadow as an inset box-shadow. An inset shadow on the <img> itself would
 * paint underneath the picture, which is why this is a separate layer.
 */
export function frameLipShadeElement(angle: number | null | undefined, blur: number, opacity: number) {
  const s = frameLipShadow(angle, blur)
  const el = document.createElement('div')
  el.style.cssText = [
    'position:absolute', 'inset:0', 'pointer-events:none',
    `box-shadow:inset ${s.x.toFixed(1)}px ${s.y.toFixed(1)}px ${s.blur.toFixed(1)}px rgba(0,0,0,${opacity.toFixed(2)})`,
  ].join(';')
  return el
}
