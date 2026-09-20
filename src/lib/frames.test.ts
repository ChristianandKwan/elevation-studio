import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { FRAME_COLORS, WOOD_FRAMES, isWoodFrame, frameLabel, frameHex, frameRgb } from './frames.ts'

describe('frame colours', () => {
  test('every frame is a six-digit hex', () => {
    for (const [name, hex] of Object.entries(FRAME_COLORS)) {
      assert.match(hex, /^#[0-9a-f]{6}$/, `${name} is not a six-digit hex`)
    }
  })

  test('channel values agree with the hex they come from', () => {
    // This is the whole point of the module: the dashboard render and the
    // wall must not drift.
    assert.deepEqual(frameRgb('black'), { r: 26, g: 26, b: 26 })
    assert.deepEqual(frameRgb('white'), { r: 240, g: 237, b: 232 })
    assert.deepEqual(frameRgb('pale-wood'), { r: 196, g: 168, b: 130 })
    assert.deepEqual(frameRgb('mid-wood'), { r: 125, g: 90, b: 53 })
    assert.deepEqual(frameRgb('dark-wood'), { r: 61, g: 40, b: 20 })
  })

  test('an unknown or missing frame falls back to black, never to nothing', () => {
    assert.equal(frameHex('walnut-burr'), FRAME_COLORS.black)
    assert.equal(frameHex(null), FRAME_COLORS.black)
    assert.equal(frameHex(undefined), FRAME_COLORS.black)
    assert.deepEqual(frameRgb('walnut-burr'), { r: 26, g: 26, b: 26 })
  })

  test('the wood frames are the ones that take grain', () => {
    for (const w of WOOD_FRAMES) assert.ok(w in FRAME_COLORS, `${w} is not a frame`)
    assert.ok(isWoodFrame('mid-wood'))
    assert.ok(!isWoodFrame('black'))
    assert.ok(!isWoodFrame(null))
  })

  test('labels read as words', () => {
    assert.equal(frameLabel('pale-wood'), 'pale wood')
    assert.equal(frameLabel('black'), 'black')
  })
})
