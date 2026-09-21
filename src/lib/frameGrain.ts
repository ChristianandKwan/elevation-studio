import {
  frameRails, grainCss, grainAlpha, GRAIN_PITCH_MM, GRAIN_REPEAT_PITCHES,
  GRAIN_STRIPES, isWoodFrame,
} from './frames'

/**
 * Grain over a frame, for the two renderers that draw with CSS — the studio
 * canvas and the client portal.
 *
 * Four rails, not one band: grain runs along the length of each piece of
 * timber, so the top and bottom of a frame are striped one way and the sides
 * the other. At a 20mm frame this is barely perceptible; it earns its place
 * on the wide frames, where a flat fill reads as a colour swatch.
 *
 * Returns an element to append to the overlay. An absolutely positioned child
 * resolves against its ancestor's *padding* box, and the mount is that padding
 * — so the only thing between this and the border box is the border itself.
 * Pass the frame width, not the whole outer band, or a mounted work drags its
 * grain a mount's width up and to the left of the frame. Never over the
 * artwork itself.
 */
export function frameGrainElement(
  frameType: string,
  outerW: number,
  outerH: number,
  framePx: number,
  dispPxPerCm: number,
  offsetLeft: number,
  offsetTop: number,
): HTMLElement {
  const wrap = document.createElement('div')
  wrap.className = 'aw-grain'
  wrap.style.cssText = [
    'position:absolute',
    `left:${-offsetLeft}px`,
    `top:${-offsetTop}px`,
    `width:${outerW}px`,
    `height:${outerH}px`,
    'pointer-events:none',
  ].join(';')

  const alpha = grainAlpha(frameType)
  if (!isWoodFrame(frameType) || alpha <= 0) return wrap

  // Pitch is held in millimetres of real frame, so a wide frame shows more
  // lines than a narrow one instead of the pattern stretching.
  const pitchPx = (GRAIN_PITCH_MM / 10) * dispPxPerCm

  for (const rail of frameRails(outerW, outerH, framePx)) {
    const el = document.createElement('div')
    el.style.cssText = [
      'position:absolute',
      `left:${rail.x}px`,
      `top:${rail.y}px`,
      `width:${rail.w}px`,
      `height:${rail.h}px`,
      `background-image:${grainCss(alpha, pitchPx, rail.runs)}`,
    ].join(';')
    wrap.appendChild(el)
  }
  return wrap
}

/**
 * The same grain, painted into a 2D canvas for the PNG export.
 *
 * Draws over a frame that has already been filled with its base colour, and
 * only within the four rails — never over the mount or the artwork.
 */
export function paintFrameGrain(
  ctx: CanvasRenderingContext2D,
  frameType: string,
  outerW: number,
  outerH: number,
  framePx: number,
  pxPerCm: number,
): void {
  const alpha = grainAlpha(frameType)
  if (!isWoodFrame(frameType) || alpha <= 0 || framePx <= 0) return

  const pitch = Math.max(2, (GRAIN_PITCH_MM / 10) * pxPerCm)
  const repeat = Math.max(6, pitch * GRAIN_REPEAT_PITCHES)

  for (const rail of frameRails(outerW, outerH, framePx)) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(rail.x, rail.y, rail.w, rail.h)
    ctx.clip()
    // Grain travels along the rail, so the lines stack across it.
    const along = rail.runs === 'horizontal'
    const start = along ? rail.y : rail.x
    const end = along ? rail.y + rail.h : rail.x + rail.w
    for (let base = start; base < end; base += repeat) {
      for (const stripe of GRAIN_STRIPES) {
        const at = Math.round(base + stripe.at * repeat)
        if (at < start || at >= end) continue
        const dark = `rgba(0,0,0,${(alpha * stripe.weight).toFixed(3)})`
        const light = `rgba(255,255,255,${(alpha * stripe.weight * 0.5).toFixed(3)})`
        if (along) {
          ctx.fillStyle = dark
          ctx.fillRect(rail.x, at, rail.w, 1)
          ctx.fillStyle = light
          ctx.fillRect(rail.x, at + 1, rail.w, 1)
        } else {
          ctx.fillStyle = dark
          ctx.fillRect(at, rail.y, 1, rail.h)
          ctx.fillStyle = light
          ctx.fillRect(at + 1, rail.y, 1, rail.h)
        }
      }
    }
    ctx.restore()
  }
}
