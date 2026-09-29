/**
 * Bends an image through a perspective transform, pixel by pixel.
 *
 * The server has no canvas, so the dashboard picture cannot use warp.ts the
 * way the studio's export does. This works on raw RGBA instead: each output
 * pixel asks where it came from (the inverse transform) and blends the four
 * source pixels around that point. Colour is blended premultiplied by alpha,
 * so the transparent space around a work does not darken its edges.
 */
import type { Homography } from './homography.ts'

/** The inverse of a 3×3 transform, or null when it has none. */
function invert(h: Homography): Homography | null {
  const [a, b, c, d, e, f, g, hh, i] = h
  const A = e * i - f * hh, B = -(d * i - f * g), C = d * hh - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) return null
  const inv = [
    A, -(b * i - c * hh), b * f - c * e,
    B, a * i - c * g, -(a * f - c * d),
    C, -(a * hh - b * g), a * e - b * d,
  ]
  return inv.map(v => v / det)
}

/**
 * `src` (srcW × srcH, RGBA) drawn through `h` onto a transparent outW × outH
 * image. `h` maps source pixels to output pixels, as the studio's transforms
 * do. Returns the output unchanged-size buffer; a degenerate transform gives a
 * transparent one.
 */
export function warpRgba(
  src: Uint8Array, srcW: number, srcH: number, h: Homography, outW: number, outH: number,
): Uint8Array {
  const out = new Uint8Array(outW * outH * 4)
  const inv = invert(h)
  if (!inv) return out
  const [a, b, c, d, e, f, g, hh, i] = inv

  // Premultiplied alpha, sampled at (sx, sy) in pixel-centre coordinates.
  const px = new Float64Array(4)
  function sample(sx: number, sy: number) {
    px.fill(0)
    const x0 = Math.floor(sx), y0 = Math.floor(sy)
    const fx = sx - x0, fy = sy - y0
    for (let k = 0; k < 4; k++) {
      const x = x0 + (k & 1), y = y0 + (k >> 1)
      if (x < 0 || y < 0 || x >= srcW || y >= srcH) continue
      const wgt = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy)
      if (wgt === 0) continue
      const o = (y * srcW + x) * 4
      const alpha = src[o + 3] / 255
      px[0] += src[o] * alpha * wgt
      px[1] += src[o + 1] * alpha * wgt
      px[2] += src[o + 2] * alpha * wgt
      px[3] += alpha * wgt
    }
  }

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const cx = x + 0.5, cy = y + 0.5
      const w = g * cx + hh * cy + i
      if (w === 0) continue
      const u = (a * cx + b * cy + c) / w - 0.5
      const v = (d * cx + e * cy + f) / w - 0.5
      if (u <= -1 || v <= -1 || u >= srcW || v >= srcH) continue
      sample(u, v)
      if (px[3] <= 0) continue
      const o = (y * outW + x) * 4
      out[o] = Math.round(px[0] / px[3])
      out[o + 1] = Math.round(px[1] / px[3])
      out[o + 2] = Math.round(px[2] / px[3])
      out[o + 3] = Math.round(px[3] * 255)
    }
  }
  return out
}
