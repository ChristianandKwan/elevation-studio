import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createWallSaves } from './wallSave.ts'
import type { Artwork } from '@/types'

/** A stand-in database that records every write, in order. */
function fakeDb() {
  const writes: string[] = []
  return {
    writes,
    db: {
      saveMasks: async (optionId: string, masks: unknown) => { writes.push(`masks ${optionId} ${JSON.stringify(masks)}`) },
      savePlacement: async (id: string, row: { x_fraction: number }) => { writes.push(`placement ${id} x=${row.x_fraction}`) },
      saveWork: async (id: string, row: { name: string }) => { writes.push(`work ${id} ${row.name}`) },
    },
  }
}

function art(id: string, workId: string, xF: number, name = 'Street 1'): Artwork {
  return {
    id, workId, name, imageUrl: null, imagePath: null, wCm: 60, hCm: 80, xF, yF: 0.5,
    visible: true, price: 4000, artist: 'Julian Opie', note: '', noteShownToClient: true,
    vatApplies: true, discountStatus: 'none', discountPercent: null, subLineItems: [],
  }
}

describe('wall saves', () => {
  test('an edit still waiting when you switch walls is saved to the wall it was made on', async () => {
    const { db, writes } = fakeDb()
    const sharedFrom: Array<[string, unknown]> = []
    const saves = createWallSaves({ db, onMasksSaved: (optionId, masks) => sharedFrom.push([optionId, masks]) })

    // The Living room is open; its cut-out around the sofa is redrawn and a work moved.
    saves.remember('living-A', { masks: [], artworks: [art('p1', 'w1', 0.5)] })
    const livingEdited = { masks: [{ shape: 'sofa' }], artworks: [art('p1', 'w1', 0.3)] }
    // The consultant clicks the Hallway before the pause is up.
    saves.remember('hallway-A', { masks: [{ shape: 'radiator' }], artworks: [art('p9', 'w9', 0.5)] })
    await saves.write('living-A', livingEdited)

    assert.deepEqual(writes, [
      'masks living-A [{"shape":"sofa"}]',
      'placement p1 x=0.3',
    ])
    assert.deepEqual(sharedFrom, [['living-A', [{ shape: 'sofa' }]]], 'the cut-outs are shared from the Living room, not the Hallway')

    // The Hallway's own record is untouched: saving it as loaded writes nothing.
    writes.length = 0
    await saves.write('hallway-A', { masks: [{ shape: 'radiator' }], artworks: [art('p9', 'w9', 0.5)] })
    assert.deepEqual(writes, [])
  })

  test('moving one work saves just that work: not the others, not the cut-outs, not the work itself', async () => {
    const { db, writes } = fakeDb()
    const saves = createWallSaves({ db })
    const loaded = { masks: [{ shape: 'sofa' }], artworks: [art('p1', 'w1', 0.2), art('p2', 'w2', 0.5, 'Dance 5'), art('p3', 'w3', 0.8, 'Walk')] }
    saves.remember('living-A', loaded)

    const wrote = await saves.write('living-A', { ...loaded, artworks: [loaded.artworks[0], art('p2', 'w2', 0.55, 'Dance 5'), loaded.artworks[2]] })

    assert.equal(wrote, true)
    assert.deepEqual(writes, ['placement p2 x=0.55'])

    // And once saved, saving the same wall again writes nothing.
    writes.length = 0
    assert.equal(await saves.write('living-A', { ...loaded, artworks: [loaded.artworks[0], art('p2', 'w2', 0.55, 'Dance 5'), loaded.artworks[2]] }), false)
    assert.deepEqual(writes, [])
  })

  test("renaming a work on the wall saves the work, not where it hangs", async () => {
    const { db, writes } = fakeDb()
    const saves = createWallSaves({ db })
    saves.remember('living-A', { masks: [], artworks: [art('p1', 'w1', 0.2)] })

    await saves.write('living-A', { masks: [], artworks: [art('p1', 'w1', 0.2, 'Street 1 (orange)')] })

    assert.deepEqual(writes, ['work w1 Street 1 (orange)'])
  })

  test('a work already saved from the budget is not written again, and a neighbour still being dragged is kept', async () => {
    const { db, writes } = fakeDb()
    const saves = createWallSaves({ db })
    saves.remember('living-A', { masks: [], artworks: [art('p1', 'w1', 0.2), art('p2', 'w2', 0.5, 'Dance 5')] })

    // Dance 5 is dragged; before the pause is up, Street 1 is renamed on the budget and saved there.
    const renamed = art('p1', 'w1', 0.2, 'Street 1 (orange)')
    saves.markSaved('living-A', renamed)
    await saves.write('living-A', { masks: [], artworks: [renamed, art('p2', 'w2', 0.7, 'Dance 5')] })

    assert.deepEqual(writes, ['placement p2 x=0.7'])
  })
})
