import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_H, DEFAULT_W, EMPTY_BATCH,
  blankAsNull, buildWorkMetas, fillArtistDown,
  type BatchMeta, type TypedWork,
} from './workMeta.ts'

function row(over: Partial<TypedWork> = {}): TypedWork {
  return { name: 'Plate IV', wStr: '56', hStr: '76', priceStr: '4500', artist: 'Sarah Chen', ...over }
}

function batch(over: Partial<BatchMeta> = {}): BatchMeta {
  return {
    artist: 'Sarah Chen',
    year: '2018',
    medium: 'Screenprint',
    edition: 'Edition of 150',
    source: 'Cristea Roberts Gallery, London',
    ...over,
  }
}

describe('the batch fields', () => {
  test('one set of catalogue detail reaches every work in the batch', () => {
    const metas = buildWorkMetas(
      [row({ name: 'Plate I' }), row({ name: 'Plate II' }), row({ name: 'Plate III' })],
      batch(),
      { withCatalogue: true },
    )
    assert.equal(metas.length, 3)
    for (const m of metas) {
      assert.equal(m.year, '2018')
      assert.equal(m.medium, 'Screenprint')
      assert.equal(m.edition, 'Edition of 150')
      assert.equal(m.source, 'Cristea Roberts Gallery, London')
    }
    assert.deepEqual(metas.map(m => m.name), ['Plate I', 'Plate II', 'Plate III'])
  })

  test('the ones left empty are stored as nothing, not as blank text', () => {
    // facts() in the export drops nulls; an empty string would print a row
    // with nothing after the colon.
    const [meta] = buildWorkMetas([row()], EMPTY_BATCH, { withCatalogue: true })
    assert.equal(meta.year, null)
    assert.equal(meta.medium, null)
    assert.equal(meta.edition, null)
    assert.equal(meta.source, null)
  })

  test('whitespace alone is empty', () => {
    const [meta] = buildWorkMetas([row()], batch({ year: '   ' }), { withCatalogue: true })
    assert.equal(meta.year, null)
  })

  test('the studio uploader carries none of it, even if something is in there', () => {
    // The studio asks for the five fields that change what you see on the
    // wall. The rest is Index work.
    const [meta] = buildWorkMetas([row()], batch(), { withCatalogue: false })
    assert.equal(meta.year, null)
    assert.equal(meta.medium, null)
    assert.equal(meta.edition, null)
    assert.equal(meta.source, null)
    assert.equal(meta.artist, 'Sarah Chen')
    assert.equal(meta.price, 4500)
  })
})

describe('one work at a time', () => {
  test('a work keeps the artist in its own box', () => {
    const metas = buildWorkMetas(
      [row(), row({ artist: 'Ben Nicholson' })],
      batch(),
      { withCatalogue: true },
    )
    assert.deepEqual(metas.map(m => m.artist), ['Sarah Chen', 'Ben Nicholson'])
  })

  test('an emptied artist box means unattributed, not the batch artist', () => {
    const [meta] = buildWorkMetas([row({ artist: '' })], batch(), { withCatalogue: true })
    assert.equal(meta.artist, '')
  })

  test('the artist row is left for the caller to resolve', () => {
    // Only the screen knows which artists the practice already has, and
    // naming a new one creates a row.
    const [meta] = buildWorkMetas([row()], batch(), { withCatalogue: true })
    assert.equal(meta.artistId, null)
  })

  test('a size that is not a size falls back to the default', () => {
    const [meta] = buildWorkMetas([row({ wStr: '', hStr: 'about a metre' })], batch(), { withCatalogue: true })
    assert.equal(meta.wCm, DEFAULT_W)
    assert.equal(meta.hCm, DEFAULT_H)
  })

  test('a negative size is not a size either', () => {
    const [meta] = buildWorkMetas([row({ wStr: '-56' })], batch(), { withCatalogue: true })
    assert.equal(meta.wCm, DEFAULT_W)
  })

  test('half-typed prices are not prices', () => {
    for (const priceStr of ['', '.', '-', 'ask']) {
      const [meta] = buildWorkMetas([row({ priceStr })], batch(), { withCatalogue: true })
      assert.equal(meta.price, 0, `${JSON.stringify(priceStr)} should not be a price`)
    }
  })

  test('a title is trimmed, and an emptied one is left for the filename', () => {
    const [padded] = buildWorkMetas([row({ name: '  Plate IV  ' })], batch(), { withCatalogue: true })
    assert.equal(padded.name, 'Plate IV')
    const [cleared] = buildWorkMetas([row({ name: '   ' })], batch(), { withCatalogue: true })
    assert.equal(cleared.name, '')
  })
})

describe('copying the artist down', () => {
  test('typing the artist once fills in all of them', () => {
    const rows = [row({ artist: '' }), row({ artist: '' }), row({ artist: '' })]
    const filled = fillArtistDown(rows, 'Sarah Chen', new Set())
    assert.deepEqual(filled.map(r => r.artist), ['Sarah Chen', 'Sarah Chen', 'Sarah Chen'])
  })

  test('a work typed over by hand is left alone', () => {
    const rows = [row({ artist: 'Sarah Chen' }), row({ artist: 'Ben Nicholson' }), row({ artist: 'Sarah Chen' })]
    // Correcting the batch's spelling must not undo the one that was changed.
    const filled = fillArtistDown(rows, 'Sarah Chen-Whitworth', new Set([1]))
    assert.deepEqual(filled.map(r => r.artist), ['Sarah Chen-Whitworth', 'Ben Nicholson', 'Sarah Chen-Whitworth'])
  })

  test('clearing the batch artist clears the ones following it', () => {
    const rows = [row(), row({ artist: 'Ben Nicholson' })]
    const filled = fillArtistDown(rows, '', new Set([1]))
    assert.deepEqual(filled.map(r => r.artist), ['', 'Ben Nicholson'])
  })

  test('nothing else about a work moves', () => {
    const filled = fillArtistDown([row({ name: 'Plate I', priceStr: '99' })], 'Ben Nicholson', new Set())
    assert.deepEqual(filled[0], { name: 'Plate I', wStr: '56', hStr: '76', priceStr: '99', artist: 'Ben Nicholson' })
  })
})

describe('blankAsNull', () => {
  test('keeps text, drops emptiness', () => {
    assert.equal(blankAsNull('c. 1973'), 'c. 1973')
    assert.equal(blankAsNull('  2018  '), '2018')
    assert.equal(blankAsNull(''), null)
    assert.equal(blankAsNull('\n\t '), null)
  })
})
