import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createSaver, flushAllSavers } from './saver.ts'

/** Lets queued promise work finish. setImmediate is not one of the mocked timers. */
const settle = () => new Promise(r => setImmediate(r))

/** A write that records what reached "the database". */
function recorder<P>() {
  const written: Array<[string, P]> = []
  return { written, write: async (key: string, patch: P) => { written.push([key, patch]) } }
}

describe('saver', () => {
  test('typing quickly makes one save after the pause, holding every change', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const db = recorder<Record<string, string>>()
    const saver = createSaver({ write: db.write, delayMs: 600 })

    saver.save('work-1', { name: 'S' })
    t.mock.timers.tick(300)
    saver.save('work-1', { name: 'St' })
    t.mock.timers.tick(300)
    saver.save('work-1', { note: 'Held until Friday' })
    await settle()
    assert.deepEqual(db.written, [], 'nothing is written while typing continues')

    t.mock.timers.tick(600)
    await settle()
    assert.deepEqual(db.written, [['work-1', { name: 'St', note: 'Held until Friday' }]])
  })

  test('a slow save to a row is never overtaken by the next one', async (t) => {
    // "Street 2" → "Street " → "Street 1": the first request is slow, and if
    // the second overtakes it the row ends up holding the half-typed name.
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const landed: string[] = []
    let releaseFirst!: () => void
    const firstIsSlow = new Promise<void>(r => { releaseFirst = r })
    let calls = 0
    const saver = createSaver<{ name: string }>({
      delayMs: 600,
      write: async (_key, patch) => {
        if (calls++ === 0) await firstIsSlow
        landed.push(patch.name)
      },
    })

    saver.save('work-1', { name: 'Street ' })
    t.mock.timers.tick(600)
    saver.save('work-1', { name: 'Street 1' })
    t.mock.timers.tick(600)
    await Promise.resolve()
    releaseFirst()
    await saver.flushAll()

    assert.deepEqual(landed, ['Street ', 'Street 1'])
  })

  test('exporting writes what is still waiting on every screen, without waiting for the pause', async (t) => {
    // The pack is built on the server from what is saved. A figure typed on
    // the budget a moment before Export used to be missing from it.
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const budgetDb = recorder<{ fee: number }>()
    const worksDb = recorder<{ price: number }>()
    const budget = createSaver({ write: budgetDb.write, delayMs: 500 })
    const works = createSaver({ write: worksDb.write, delayMs: 600 })

    budget.save('budget-1', { fee: 250 })
    works.save('work-1', { price: 4200 })
    await flushAllSavers()

    assert.deepEqual(budgetDb.written, [['budget-1', { fee: 250 }]])
    assert.deepEqual(worksDb.written, [['work-1', { price: 4200 }]])
    budget.dispose()
    works.dispose()
  })

  test('leaving a screen writes what is waiting, once, and the screen is forgotten', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const db = recorder<{ note: string }>()
    const saver = createSaver({ write: db.write, delayMs: 600 })

    saver.save('option-1', { note: 'Pair price agreed' })
    await saver.dispose()
    t.mock.timers.tick(600)
    await flushAllSavers()

    assert.deepEqual(db.written, [['option-1', { note: 'Pair price agreed' }]])
  })

  test('a failed save is reported, and the next save to the row still goes through', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const reported: Array<[string, string]> = []
    const landed: number[] = []
    let calls = 0
    const saver = createSaver<{ price: number }>({
      delayMs: 600,
      write: async (_key, patch) => {
        if (calls++ === 0) throw new Error('network down')
        landed.push(patch.price)
      },
      onError: (key, err) => { reported.push([key, (err as Error).message]) },
    })

    saver.save('work-1', { price: 4000 })
    t.mock.timers.tick(600)
    await settle()
    saver.save('work-1', { price: 4200 })
    t.mock.timers.tick(600)
    await settle()

    assert.deepEqual(reported, [['work-1', 'network down']])
    assert.deepEqual(landed, [4200])
    await saver.dispose()
  })
})
