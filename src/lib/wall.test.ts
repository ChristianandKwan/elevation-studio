import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BLANK_WALL_MAX_EDGE, BLANK_WALL_PX_PER_CM, DEFAULT_WALL_COLOR,
  WALL_MAX_CM, WALL_MIN_CM, WALL_PRESETS,
  blankWallDataUrl, blankWallPixels, blankWallSvg, clampCm,
  isBlankWall, wallHex, wallImageUrl, wallRgb, wallSizeLabel,
} from './wall.ts'

describe('wall colours', () => {
  test('every preset is a six-digit lower-case hex', () => {
    for (const p of WALL_PRESETS) {
      assert.match(p.hex, /^#[0-9a-f]{6}$/, `${p.label} is not a six-digit hex`)
    }
    assert.match(DEFAULT_WALL_COLOR, /^#[0-9a-f]{6}$/)
  })

  test('presets match the format the database will accept', () => {
    // The check constraint in 029 is lower-case only, so a preset written in
    // capitals would be stored by the studio and rejected by Postgres.
    for (const p of WALL_PRESETS) assert.equal(p.hex, p.hex.toLowerCase())
  })

  test('a colour typed in capitals is stored lower-case', () => {
    assert.equal(wallHex('#ECE8E1'), '#ece8e1')
  })

  test('anything unrecognised falls back rather than drawing nothing', () => {
    assert.equal(wallHex(null), DEFAULT_WALL_COLOR)
    assert.equal(wallHex(''), DEFAULT_WALL_COLOR)
    assert.equal(wallHex('red'), DEFAULT_WALL_COLOR)
    assert.equal(wallHex('#abc'), DEFAULT_WALL_COLOR)
  })

  test('channel values agree with the hex they come from', () => {
    // Same contract as frames.ts: sharp draws the dashboard picture from
    // these, the browser draws the wall from the hex, and they must agree.
    assert.deepEqual(wallRgb('#ece8e1'), { r: 236, g: 232, b: 225 })
    assert.deepEqual(wallRgb('#000000'), { r: 0, g: 0, b: 0 })
    assert.deepEqual(wallRgb('#ffffff'), { r: 255, g: 255, b: 255 })
  })
})

describe('wall pixels', () => {
  test('an ordinary wall gets the full resolution', () => {
    const { origW, origH, pxPerCm } = blankWallPixels(400, 260)
    assert.equal(pxPerCm, BLANK_WALL_PX_PER_CM)
    assert.equal(origW, 4000)
    assert.equal(origH, 2600)
  })

  test('the scale is exactly what the pixels imply', () => {
    // The whole reason a plain wall needs no calibration: place a 100 cm print
    // and it must occupy 100 cm of wall.
    for (const [w, h] of [[400, 260], [123.5, 240], [1800, 400], [10, 10]]) {
      const { origW, pxPerCm } = blankWallPixels(w, h)
      const wallCm = clampCm(w)
      assert.ok(
        Math.abs(origW / pxPerCm - wallCm) < 0.5,
        `${w} × ${h}: ${origW}px at ${pxPerCm}px/cm is ${origW / pxPerCm}cm, not ${wallCm}cm`,
      )
    }
  })

  test('a very long wall loses resolution rather than being refused', () => {
    const { origW, origH, pxPerCm } = blankWallPixels(2000, 300)
    assert.ok(pxPerCm < BLANK_WALL_PX_PER_CM, 'should have been reduced')
    assert.equal(origW, BLANK_WALL_MAX_EDGE)
    assert.ok(origH > 0)
    // Still to scale, which is the part that matters.
    assert.ok(Math.abs(origW / pxPerCm - 2000) < 0.5)
  })

  test('a size out of range is pulled into it, not rejected', () => {
    assert.equal(clampCm(0), WALL_MIN_CM)
    assert.equal(clampCm(-5), WALL_MIN_CM)
    assert.equal(clampCm(99999), WALL_MAX_CM)
    assert.equal(clampCm(Number.NaN), WALL_MIN_CM)
    assert.equal(clampCm(400), 400)
  })

  test('never zero pixels, however small the wall', () => {
    const { origW, origH } = blankWallPixels(WALL_MIN_CM, WALL_MIN_CM)
    assert.ok(origW >= 1 && origH >= 1)
  })
})

describe('drawing the wall', () => {
  test('the SVG carries its size and its colour', () => {
    const svg = blankWallSvg(4000, 2600, '#ece8e1')
    assert.match(svg, /width="4000"/)
    assert.match(svg, /height="2600"/)
    assert.match(svg, /fill="#ece8e1"/)
  })

  test('the data URL stays small however large the wall', () => {
    // The point of generating rather than uploading: a plain wall costs no
    // storage, and nothing has to sweep it up later.
    const url = blankWallDataUrl(6000, 4000, '#4a4845')
    assert.ok(url.startsWith('data:image/svg+xml'), url.slice(0, 40))
    assert.ok(url.length < 400, `${url.length} characters is more than expected`)
  })

  test('an unrecognised colour still produces a drawable wall', () => {
    assert.match(blankWallSvg(100, 100, 'not a colour'), /fill="#[0-9a-f]{6}"/)
  })
})

describe('telling the two kinds of wall apart', () => {
  test('a photograph is not a plain wall', () => {
    assert.equal(isBlankWall({ imagePath: 'proj/opt/elevation-1.jpg', wallColor: null }), false)
    // Belt and braces: even a row carrying both is treated as the photograph,
    // because that is what every renderer prefers.
    assert.equal(isBlankWall({ imagePath: 'proj/opt/e.jpg', wallColor: '#ece8e1' }), false)
  })

  test('a colour with no photograph is a plain wall', () => {
    assert.equal(isBlankWall({ imagePath: null, wallColor: '#ece8e1' }), true)
  })

  test('an option with neither is neither', () => {
    assert.equal(isBlankWall({ imagePath: null, wallColor: null }), false)
  })
})

describe('what each renderer points an img at', () => {
  test('the photograph wins when there is one', () => {
    const url = wallImageUrl({
      imageUrl: 'https://example.test/signed.jpg',
      origW: 3000, origH: 2000, wallColor: '#ece8e1',
    })
    assert.equal(url, 'https://example.test/signed.jpg')
  })

  test('a plain wall is drawn', () => {
    const url = wallImageUrl({ imageUrl: null, origW: 4000, origH: 2600, wallColor: '#ece8e1' })
    assert.ok(url && url.startsWith('data:image/svg+xml'))
  })

  test('an option that is not set up yet has nothing to draw', () => {
    assert.equal(wallImageUrl({ imageUrl: null, origW: 0, origH: 0, wallColor: null }), null)
    // A colour with no pixel size is a half-written row; better to show the
    // empty state than a one-pixel wall.
    assert.equal(wallImageUrl({ imageUrl: null, origW: 0, origH: 0, wallColor: '#ece8e1' }), null)
  })
})

describe('the size label', () => {
  test('reads as a measurement', () => {
    assert.equal(wallSizeLabel(400, 260), '400 × 260 cm')
  })

  test('keeps one decimal and drops a trailing zero', () => {
    assert.equal(wallSizeLabel(123.45, 240), '123.5 × 240 cm')
  })

  test('says something sensible before a size is set', () => {
    assert.equal(wallSizeLabel(null, null), 'Plain wall')
  })
})
