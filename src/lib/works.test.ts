/**
 * Runs under Node's own test runner with no build step (see budgetCalc.test.ts
 * for why that works). `works.ts` must therefore stay free of runtime imports.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  placementRow, workRow, toWorkColumns, workStoragePath, workFieldsOf,
  groupWorksByArtist, placementsOf, parseSetAside, standingOf, UNATTRIBUTED,
} from './works.ts'
import type { Artwork, Work } from '@/types'
import type { Placed } from './works.ts'

/**
 * Every column the old single-table save wrote (useStudio's `artworkRow`
 * before migration 026). The two halves must cover exactly this set, with
 * nothing in both — a column in neither would silently stop saving.
 */
const LEGACY_COLUMNS = [
  'x_fraction', 'y_fraction', 'w_cm', 'h_cm', 'visible', 'price', 'artist', 'note',
  'note_shown_to_client', 'vat_applies', 'discount_status', 'discount_percent',
  'sub_line_items', 'brightness', 'fade', 'name', 'frame_type', 'frame_width_mm',
  'shadow_angle', 'shadow_blur', 'shadow_opacity',
].sort()

/**
 * Placement columns added after 026. Listed separately so the legacy set above
 * stays exactly what the old single table held — that is what proves the split
 * dropped nothing. Anything added here must also be added to a migration.
 */
const ADDED_PLACEMENT_COLUMNS = [
  'mount_color', 'mount_top_mm', 'mount_right_mm', 'mount_bottom_mm', 'mount_left_mm',
].sort()

function art(partial: Partial<Artwork> = {}): Artwork {
  return {
    id: 'p1', workId: 'w1', name: 'Berlin', imageUrl: null, imagePath: null,
    wCm: 101.6, hCm: 121.9, xF: 0.2, yF: 0.3, visible: true, price: 5300, artist: 'Paula Scher',
    note: '', noteShownToClient: true, vatApplies: true, discountStatus: 'none', discountPercent: null,
    subLineItems: [], frameType: 'black', frameWidthMm: 20, brightness: 1, fade: null,
    shadowAngle: null, shadowBlur: null, shadowOpacity: null,
    ...partial,
  }
}

let seq = 0
function work(partial: Partial<Work> = {}): Work {
  return {
    id: `w${seq++}`, projectId: 'proj', artist: '', artistId: null, name: 'Untitled', imagePath: null, imageUrl: null,
    wCm: 40, hCm: 60, price: 0, vatApplies: true, discountStatus: 'none', discountPercent: null,
    subLineItems: [], note: '', noteShownToClient: true, year: null, medium: null, edition: null,
    source: null, setAside: null, consideredFor: null, displayOrder: 0,
    ...partial,
  }
}

describe('the two halves of a save', () => {
  test('cover every legacy column exactly once', () => {
    const p = Object.keys(placementRow(art()))
    const w = Object.keys(workRow(art()))
    assert.deepEqual([...p, ...w].sort(), [...LEGACY_COLUMNS, ...ADDED_PLACEMENT_COLUMNS].sort())
    assert.deepEqual(p.filter(k => w.includes(k)), [])
  })

  test('every legacy column is still written by one half or the other', () => {
    const covered = [...Object.keys(placementRow(art())), ...Object.keys(workRow(art()))]
    for (const col of LEGACY_COLUMNS) {
      assert.ok(covered.includes(col), `${col} is no longer saved by either half`)
    }
  })

  test('a mount is part of the placement, never the work', () => {
    const a = art({ mountColor: 'ivory', mountTopMm: 50, mountRightMm: 50, mountBottomMm: 60, mountLeftMm: 50 })
    const p = placementRow(a)
    assert.equal(p.mount_color, 'ivory')
    assert.equal(p.mount_bottom_mm, 60)
    assert.equal('mount_color' in workRow(a), false)
  })

  test('no mount saves as null colour and zero sides, not as undefined', () => {
    const p = placementRow(art())
    assert.equal(p.mount_color, null)
    assert.equal(p.mount_top_mm, 0)
    assert.equal(p.mount_left_mm, 0)
  })

  test('placement half never carries work fields', () => {
    const p = placementRow(art({ price: 999, name: 'X' }))
    assert.equal('price' in p, false)
    assert.equal('name' in p, false)
    assert.equal(p.x_fraction, 0.2)
  })

  test('defaults match what the old save wrote', () => {
    const p = placementRow(art({ brightness: undefined, frameType: undefined }))
    assert.equal(p.brightness, 1)
    assert.equal(p.frame_type, null)
  })
})

describe('toWorkColumns', () => {
  test('writes only the keys present, mapping names', () => {
    assert.deepEqual(toWorkColumns({ price: 100, consideredFor: 'e1', setAside: 'us' }),
      { price: 100, considered_for: 'e1', set_aside: 'us' })
  })
  test('null is a value, undefined is absence', () => {
    assert.deepEqual(toWorkColumns({ consideredFor: null, year: undefined }), { considered_for: null })
  })
  test('an empty patch writes nothing', () => {
    assert.deepEqual(toWorkColumns({}), {})
  })
})

describe('workStoragePath', () => {
  test('two levels under the project, keeping the extension', () => {
    assert.equal(workStoragePath('proj', 'Berlin Map.JPG', 'abc'), 'proj/works/art-abc.JPG')
  })
  test('a name with no extension gets jpg', () => {
    assert.equal(workStoragePath('proj', 'scan', 'abc'), 'proj/works/art-abc.jpg')
  })
})

describe('groupWorksByArtist', () => {
  test('groups case-insensitively, keeps the first spelling, sorts works by name', () => {
    const g = groupWorksByArtist([
      work({ artist: 'Julian Opie', name: 'Dance Synced 5' }),
      work({ artist: 'julian opie', name: 'Dance Synced 2' }),
      work({ artist: 'Paula Scher', name: 'Berlin' }),
    ])
    assert.deepEqual(g.map(x => x.label), ['Julian Opie', 'Paula Scher'])
    assert.deepEqual(g[0].works.map(w => w.name), ['Dance Synced 2', 'Dance Synced 5'])
  })
  test('unattributed works come last', () => {
    const g = groupWorksByArtist([work({ artist: '  ' }), work({ artist: 'Aa' }), work({ artist: 'Zz' })])
    assert.deepEqual(g.map(x => x.label), ['Aa', 'Zz', UNATTRIBUTED])
  })
  test('empty in, empty out', () => {
    assert.deepEqual(groupWorksByArtist([]), [])
  })
})

describe('grouping by the artist row', () => {
  test('one artist is one group however their name is spelled on each work', () => {
    // Two spellings, one artist row. This is what 032 bought: they are one
    // group because they are one artist, not because the spellings happened
    // to match once lower-cased.
    const g = groupWorksByArtist([
      work({ artist: 'Paula Scher', artistId: 'a1', name: 'Berlin' }),
      work({ artist: 'Paula scher', artistId: 'a1', name: 'London' }),
    ])
    assert.equal(g.length, 1)
    assert.equal(g[0].artistId, 'a1')
    assert.equal(g[0].works.length, 2)
  })

  test('two artists whose names differ stay apart', () => {
    // 'Nathan' and 'Nathan I' may be two people; nothing here decides that.
    const g = groupWorksByArtist([
      work({ artist: 'Nathan', artistId: 'a1' }),
      work({ artist: 'Nathan I', artistId: 'a2' }),
    ])
    assert.equal(g.length, 2)
  })

  test('works with no artist row still group by name', () => {
    // Anything written before 032, or by code that has not set an id.
    const g = groupWorksByArtist([
      work({ artist: 'Agnes Martin', artistId: null }),
      work({ artist: 'agnes martin', artistId: null }),
    ])
    assert.equal(g.length, 1)
    assert.equal(g[0].artistId, null)
  })

  test('unattributed works carry no artist id', () => {
    const g = groupWorksByArtist([work({ artist: '' })])
    assert.equal(g[0].artistId, null)
    assert.equal(g[0].label, 'Unattributed')
  })
})

describe('placementsOf', () => {
  const elevations = [
    { id: 'e1', name: 'Conference Room', options: [
      { label: 'A', workIds: ['w1', 'w2'] }, { label: 'B', workIds: ['w2'] }, { label: 'C', workIds: ['w1'] },
    ] },
    { id: 'e2', name: 'Main Office', options: [{ label: 'A', workIds: ['w2'] }] },
  ]
  test('lists each elevation with the option labels', () => {
    assert.deepEqual(placementsOf('w1', elevations), [
      { elevationId: 'e1', elevationName: 'Conference Room', labels: ['A', 'C'] },
    ])
  })
  test('a work on two elevations is reported twice — the index warns on this', () => {
    assert.equal(placementsOf('w2', elevations).length, 2)
  })
  test('an unplaced work has no entries', () => {
    assert.deepEqual(placementsOf('w9', elevations), [])
  })
})

describe('parseSetAside', () => {
  test('anything unrecognised is live, not set aside', () => {
    // A row read before 034 has no set_aside at all, and one read from an
    // older deploy may still carry 'proposed'. Neither means somebody took
    // the work out, so both have to come back null.
    assert.equal(parseSetAside(undefined), null)
    assert.equal(parseSetAside(null), null)
    assert.equal(parseSetAside('proposed'), null)
    assert.equal(parseSetAside('declined'), null)
    assert.equal(parseSetAside(''), null)
  })

  test('the two real values survive', () => {
    assert.equal(parseSetAside('us'), 'us')
    assert.equal(parseSetAside('client'), 'client')
  })
})

describe('standingOf', () => {
  const on = (n: number): Placed[] =>
    Array.from({ length: n }, (_, i) => ({ elevationId: `e${i}`, elevationName: `Room ${i}`, labels: ['A'] }))

  test('a live work is described by where it hangs, not by a stored word', () => {
    assert.equal(standingOf(work(), on(1)), 'On a wall')
    assert.equal(standingOf(work(), on(0)), 'Not placed')
  })

  test('a set-aside work says who set it aside', () => {
    assert.equal(standingOf(work({ setAside: 'us' }), on(0)), 'Ruled out by us')
    assert.equal(standingOf(work({ setAside: 'client' }), on(0)), 'Passed by the client')
  })

  test('being set aside outranks still hanging somewhere', () => {
    // The old model let a work be "declined" and on a wall at once and never
    // reconciled the two; both live declined rows were in exactly that state.
    assert.equal(standingOf(work({ setAside: 'client' }), on(2)), 'Passed by the client')
  })

  test('a work on one option is not set aside by another option being picked', () => {
    // Options are alternatives. Nothing about being on a wall, or not being
    // on a particular wall, may imply anybody turned the work down.
    assert.equal(standingOf(work(), on(1)), 'On a wall')
    assert.equal(standingOf(work(), on(0)), 'Not placed')
  })
})
