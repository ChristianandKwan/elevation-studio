import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { bringInOpenWall, changeOption, changeWork, shareCutOuts } from './projectState.ts'

/** A placement: one work hung on one option. */
function placement(id: string, workId: string, extra: Record<string, unknown> = {}) {
  return { id, workId, name: 'Street 1', price: 4000, xF: 0.5, yF: 0.5, ...extra }
}

/** Living room (A, B) and Hallway (A). Street 1 (w1) hangs on all three. */
function project() {
  return [
    { id: 'e1', elevation_options: [
      { id: 'o1', option: 'A', consultantNote: '', artworks: [placement('p1', 'w1'), placement('p2', 'w2', { name: 'Dance 5' })] },
      { id: 'o2', option: 'B', consultantNote: '', artworks: [placement('p3', 'w1')] },
    ] },
    { id: 'e2', elevation_options: [
      { id: 'o3', option: 'A', consultantNote: '', artworks: [placement('p4', 'w1', { xF: 0.2 })] },
    ] },
  ]
}

describe('changeWork', () => {
  test("a work's new name and price show on every wall it hangs on, and nowhere else", () => {
    const after = changeWork(project(), 'w1', { name: 'Street 1 (orange)', price: 4200 })

    const all = after.flatMap(e => e.elevation_options.flatMap(o => o.artworks))
    for (const id of ['p1', 'p3', 'p4']) {
      const p = all.find(a => a.id === id)!
      assert.equal(p.name, 'Street 1 (orange)')
      assert.equal(p.price, 4200)
    }
    const dance = all.find(a => a.id === 'p2')!
    assert.equal(dance.name, 'Dance 5')
    assert.equal(dance.price, 4000)
    // Where it hangs belongs to the placement, and does not move.
    assert.equal(all.find(a => a.id === 'p4')!.xF, 0.2)
  })
})

describe('changeOption', () => {
  test("an option's budget note changes that option only, not its namesake on another elevation", () => {
    const after = changeOption(project(), 'e1', 'A', { consultantNote: 'The pair is £9,000 for both.' })

    const notes = after.flatMap(e => e.elevation_options.map(o => [o.id, o.consultantNote]))
    assert.deepEqual(notes, [
      ['o1', 'The pair is £9,000 for both.'],
      ['o2', ''],
      ['o3', ''],
    ])
  })
})

/**
 * Everything the studio sidebar can change on a placement, each set to a value
 * no fixture starts with. Written out by hand from the Artwork type, not from
 * the module's own list, so a field the module forgets shows up as a failure.
 */
const EDITED_WORK_FIELDS = {
  name: 'Street 1 (orange)', artist: 'Julian Opie', wCm: 71, hCm: 93, price: 4750,
  note: 'Held until Friday', noteShownToClient: false, vatApplies: false,
  discountStatus: 'confirmed', discountPercent: 10,
  subLineItems: [{ id: 's1', label: 'Framing', kind: 'framing', mode: 'fixed', amount: 400, percent: null, vatApplies: true }],
}
const EDITED_PLACEMENT_FIELDS = {
  xF: 0.31, yF: 0.62, visible: false,
  frameType: 'dark-wood', frameWidthMm: 25,
  mountColor: 'ivory', mountTopMm: 60, mountRightMm: 50, mountBottomMm: 70, mountLeftMm: 50,
  brightness: 0.9, fade: 0.2, shadowAngle: 135, shadowBlur: 12, shadowOpacity: 0.4,
}

function pick(o: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(keys.map(k => [k, o[k]]))
}

describe('bringInOpenWall', () => {
  const edited = { ...placement('p1', 'w1'), ...EDITED_WORK_FIELDS, ...EDITED_PLACEMENT_FIELDS }
  const works = [{ id: 'w1', name: 'Street 1', price: 4000 }, { id: 'w2', name: 'Dance 5', price: 4000 }]

  test('every edit made on the open wall is kept, mounts included', () => {
    const after = bringInOpenWall(project(), works, { elevationId: 'e1', optionKey: 'A', artworks: [edited], wall: null })
    const p1 = after.elevations[0].elevation_options[0].artworks.find(a => a.id === 'p1')!

    assert.deepEqual(pick(p1, Object.keys(EDITED_WORK_FIELDS)), EDITED_WORK_FIELDS)
    assert.deepEqual(pick(p1, Object.keys(EDITED_PLACEMENT_FIELDS)), EDITED_PLACEMENT_FIELDS)
  })

  test("the work's own details reach its other walls and the Index; where it hangs there does not", () => {
    const after = bringInOpenWall(project(), works, { elevationId: 'e1', optionKey: 'A', artworks: [edited], wall: null })
    const all = after.elevations.flatMap(e => e.elevation_options.flatMap(o => o.artworks))

    for (const id of ['p3', 'p4']) {
      const p = all.find(a => a.id === id)!
      assert.deepEqual(pick(p, Object.keys(EDITED_WORK_FIELDS)), EDITED_WORK_FIELDS)
    }
    assert.equal(all.find(a => a.id === 'p4')!.xF, 0.2, 'the Hallway placement stays where it hangs')
    assert.equal(all.find(a => a.id === 'p3')!.xF, 0.5)
    assert.deepEqual(pick(after.works[0], Object.keys(EDITED_WORK_FIELDS)), EDITED_WORK_FIELDS)
    assert.deepEqual(after.works[1], { id: 'w2', name: 'Dance 5', price: 4000 })
  })

  test("a wall still loading does not hand its cut-outs or perspective to the option", () => {
    // Mid-load, the editor still holds the previous option's wall.
    const masks = { shapes: ['sofa'] }
    const loading = bringInOpenWall(project(), works, { elevationId: 'e1', optionKey: 'B', artworks: [], wall: null })
    assert.equal((loading.elevations[0].elevation_options[1] as Record<string, unknown>).foreground_masks, undefined)

    const loaded = bringInOpenWall(project(), works, {
      elevationId: 'e1', optionKey: 'B', artworks: [], wall: { foreground_masks: masks, skew_active: true },
    })
    const b = loaded.elevations[0].elevation_options[1] as Record<string, unknown>
    assert.deepEqual(b.foreground_masks, masks)
    assert.equal(b.skew_active, true)
    assert.equal((loaded.elevations[0].elevation_options[0] as Record<string, unknown>).skew_active, undefined, 'option A is untouched')
  })
})

describe('shareCutOuts', () => {
  // Living room: A and B share one photo, C has its own. Hallway: its own photo.
  function walls() {
    return [
      { id: 'living', elevation_options: [
        { id: 'la', option: 'A', imagePath: 'living.jpg', foreground_masks: null as unknown, artworks: [] },
        { id: 'lb', option: 'B', imagePath: 'living.jpg', foreground_masks: null as unknown, artworks: [] },
        { id: 'lc', option: 'C', imagePath: 'living-2.jpg', foreground_masks: null as unknown, artworks: [] },
      ] },
      { id: 'hallway', elevation_options: [
        { id: 'ha', option: 'A', imagePath: 'hall.jpg', foreground_masks: 'radiator' as unknown, artworks: [] },
        { id: 'hb', option: 'B', imagePath: 'hall.jpg', foreground_masks: 'radiator' as unknown, artworks: [] },
      ] },
    ]
  }

  test("cut-outs saved on one option reach the options sharing its photo, and never another wall's", () => {
    const sofa = [{ shape: 'sofa' }]
    const { elevations, siblingIds } = shareCutOuts(walls(), 'la', sofa)

    const masks = Object.fromEntries(elevations.flatMap(e => e.elevation_options.map(o => [o.id, o.foreground_masks])))
    assert.deepEqual(masks, { la: sofa, lb: sofa, lc: null, ha: 'radiator', hb: 'radiator' })
    assert.deepEqual(siblingIds, ['lb'], 'only the Living room option sharing the photo is written to')
  })

  test('no cut-outs is saved as none', () => {
    const { elevations } = shareCutOuts(walls(), 'ha', [])
    assert.equal(elevations[1].elevation_options[0].foreground_masks, null)
    assert.equal(elevations[1].elevation_options[1].foreground_masks, null)
  })
})
