/**
 * The export's one untrusted input.
 *
 * Everything else in the pack is read from the database by the server. The
 * budget page is photographed in the browser and posted up, so these are the
 * checks that stand between a request body and a file in somebody's zip.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { decodeCapturedImage, MAX_DATA_URL_CHARS } from './capturedImage.ts'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff])

const asPng = (body: Buffer) =>
  'data:image/png;base64,' + Buffer.concat([PNG_MAGIC, body]).toString('base64')

describe('a captured page', () => {
  test('a real PNG comes back with its bytes and extension', () => {
    const got = decodeCapturedImage(asPng(Buffer.from('rest of the file')))
    assert.ok(got)
    assert.equal(got.ext, '.png')
    assert.deepEqual([...got.bytes.slice(0, 8)], [...PNG_MAGIC])
  })

  test('JPEG is accepted too — it is the step-down for a long budget', () => {
    const url = 'data:image/jpeg;base64,' +
      Buffer.concat([JPEG_MAGIC, Buffer.from('body')]).toString('base64')
    const got = decodeCapturedImage(url)
    assert.ok(got)
    assert.equal(got.ext, '.jpg')
  })
})

describe('what is refused', () => {
  test('base64 that decodes to something that is not an image', () => {
    // Base64 will decode almost any string into bytes, so the declared type
    // proves nothing. The magic number is what actually establishes it.
    const url = 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')
    assert.equal(decodeCapturedImage(url), null)
  })

  test('a type we do not take, even with honest bytes', () => {
    const url = 'data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64')
    assert.equal(decodeCapturedImage(url), null)
  })

  test('anything past the size ceiling, before it is decoded', () => {
    // Checked on the string so an oversized body is refused without first
    // being turned into megabytes of Buffer.
    const url = 'data:image/png;base64,' + 'A'.repeat(MAX_DATA_URL_CHARS)
    assert.equal(decodeCapturedImage(url), null)
  })

  test('a bare URL, which would make the zip fetch something', () => {
    assert.equal(decodeCapturedImage('https://example.com/budget.png'), null)
  })

  test('things that are not strings at all', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
      assert.equal(decodeCapturedImage(bad), null)
    }
  })

  test('a truncated file that is shorter than its own magic number', () => {
    const url = 'data:image/png;base64,' + Buffer.from([0x89, 0x50]).toString('base64')
    assert.equal(decodeCapturedImage(url), null)
  })
})
