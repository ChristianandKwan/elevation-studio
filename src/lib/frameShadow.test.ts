/**
 * The physics behind the two lip shadows. These numbers were agreed by eye
 * against renders, so the point of pinning them is that a later tweak to one
 * lip can't quietly move the other.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  FRAME_LIP_SPREAD, MOUNT_LIP_SPREAD, FRAME_PROUD_MM, MOUNT_PROUD_MM,
  MOUNT_LIP_OPACITY, mountLipOpacity, frameLipShadow, mountLipShadow, SHADOW_PUSH,
} from './frameShadow.ts'

describe('the two lips', () => {
  test('the mount is as much shorter than the frame as the card is thinner', () => {
    // 2.5mm of card against 15mm of frame — about a sixth.
    assert.equal(MOUNT_LIP_SPREAD, FRAME_LIP_SPREAD * (MOUNT_PROUD_MM / FRAME_PROUD_MM))
    const ratio = MOUNT_LIP_SPREAD / FRAME_LIP_SPREAD
    assert.ok(ratio > 0.15 && ratio < 0.18, `expected about a sixth, got ${ratio}`)
  })

  test('the mount reads two-thirds as dark', () => {
    assert.equal(MOUNT_LIP_OPACITY, 2 / 3)
    assert.ok(Math.abs(mountLipOpacity(0.3) - 0.2) < 1e-9)
    assert.equal(mountLipOpacity(0), 0)
  })

  test('the mount lip is shorter and nearer than the frame lip', () => {
    const f = frameLipShadow(225, 12)
    const m = mountLipShadow(225, 12)
    assert.ok(m.blur < f.blur, 'mount should blur less')
    assert.ok(Math.abs(m.x) < Math.abs(f.x), 'mount should sit nearer its edge')
    // Both follow the same light, so they point the same way.
    assert.equal(Math.sign(m.x), Math.sign(f.x))
    assert.equal(Math.sign(m.y), Math.sign(f.y))
  })

  test('both lips follow the light, and vanish with it', () => {
    const lit = frameLipShadow(45, 12)
    const unlit = frameLipShadow(45, 0)
    assert.equal(unlit.blur, 0)
    assert.equal(Math.abs(unlit.x), 0)
    assert.ok(lit.blur > 0)
    // Opposite angles throw opposite ways.
    const a = mountLipShadow(45, 12)
    const b = mountLipShadow(225, 12)
    assert.ok(Math.abs(a.x + b.x) < 1e-9, 'opposite angles should cancel')
  })

  test('offset is the push times the blur, as the wall shadow uses', () => {
    const m = mountLipShadow(90, 20)
    const lipBlur = 20 * MOUNT_LIP_SPREAD
    assert.ok(Math.abs(Math.hypot(m.x, m.y) - lipBlur * SHADOW_PUSH) < 1e-9)
  })
})
