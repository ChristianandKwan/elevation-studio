import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { warpRgba } from './warpPixels.ts'
import { applyHomography, perspectiveOf, quadToHomography } from './homography.ts'

/** A transparent RGBA image with some opaque pixels set. */
function image(w: number, h: number, pixels: Array<[number, number, [number, number, number]]>) {
  const buf = new Uint8Array(w * h * 4)
  for (const [x, y, [r, g, b]] of pixels) buf.set([r, g, b, 255], (y * w + x) * 4)
  return buf
}
const at = (buf: Uint8Array, w: number, x: number, y: number) => [...buf.slice((y * w + x) * 4, (y * w + x) * 4 + 4)]

describe('warpRgba', () => {
  test('a wall squared up to itself leaves every pixel where it was', () => {
    const src = image(4, 4, [[1, 2, [200, 30, 30]], [3, 0, [10, 120, 200]]])
    const h = quadToHomography(4, 4, [[0, 0], [4, 0], [4, 4], [0, 4]])!

    const out = warpRgba(src, 4, 4, h, 4, 4)

    assert.deepEqual([...out], [...src])
  })

  test('a wall seen at an angle puts a work where the studio puts it, and nothing outside the wall', () => {
    // A 40×40 layer, blue all over, with a red work in the middle. The right
    // edge recedes: squeezed from 40px tall to 24px, as a wall seen from the left.
    const W = 40
    const pixels: Array<[number, number, [number, number, number]]> = []
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const red = x >= 18 && x <= 21 && y >= 18 && y <= 21
      pixels.push([x, y, red ? [220, 20, 20] : [20, 60, 220]])
    }
    const src = image(W, W, pixels)
    const h = quadToHomography(W, W, [[0, 0], [40, 8], [40, 32], [0, 40]])!

    const out = warpRgba(src, W, W, h, W, W)

    // Where the studio's own transform sends the work's centre.
    const [cx, cy] = applyHomography(h, 20, 20)!
    const centre = at(out, W, Math.floor(cx), Math.floor(cy))
    assert.ok(centre[0] > 150 && centre[2] < 100 && centre[3] === 255, `red at the moved centre, got ${centre}`)
    assert.ok(Math.abs(cx - 20) > 1, 'the centre really has moved')

    assert.equal(at(out, W, 39, 2)[3], 0, 'above the receding top edge is empty')
    assert.equal(at(out, W, 39, 37)[3], 0, 'below the receding bottom edge is empty')
    assert.deepEqual(at(out, W, 39, 20), [20, 60, 220, 255], 'inside the wall is the wall')
  })
})

describe('perspectiveOf', () => {
  const corners = {
    skew_tl_x: 0.1, skew_tl_y: 0.05, skew_tr_x: 0.9, skew_tr_y: 0.15,
    skew_br_x: 0.9, skew_br_y: 0.85, skew_bl_x: 0.1, skew_bl_y: 0.95,
  }

  test('a wall with perspective switched on gives its four corners', () => {
    assert.deepEqual(perspectiveOf({ ...corners, skew_active: true }), [[0.1, 0.05], [0.9, 0.15], [0.9, 0.85], [0.1, 0.95]])
  })

  test('switched off, or with a corner missing, there is no perspective', () => {
    assert.equal(perspectiveOf({ ...corners, skew_active: false }), null)
    assert.equal(perspectiveOf({ ...corners, skew_active: true, skew_br_y: null }), null)
  })
})
