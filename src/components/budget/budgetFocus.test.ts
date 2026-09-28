import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { budgetLineForWork, optionOnBudget } from './budgetFocus.ts'

function elev(id: string, picked: string | null, options: Record<string, string[]>) {
  return {
    id,
    clientPickedOption: picked,
    options: Object.entries(options).map(([key, workIds]) => ({
      key,
      artworks: workIds.map(workId => ({ workId })),
    })),
  } as unknown as Parameters<typeof budgetLineForWork>[0][number]
}

describe('optionOnBudget', () => {
  test('every option is on the budget until the client picks', () => {
    assert.equal(optionOnBudget({ clientPickedOption: null }, 'A'), true)
    assert.equal(optionOnBudget({ clientPickedOption: null }, 'B'), true)
  })

  test('after a pick, only the picked option is', () => {
    assert.equal(optionOnBudget({ clientPickedOption: 'B' }, 'B'), true)
    assert.equal(optionOnBudget({ clientPickedOption: 'B' }, 'A'), false)
  })
})

describe('budgetLineForWork', () => {
  test('finds the first line carrying the work, in budget order', () => {
    const elevations = [
      elev('e1', null, { A: ['w1'], B: ['w2'] }),
      elev('e2', null, { A: ['w2'] }),
    ]
    assert.deepEqual(budgetLineForWork(elevations, 'w2'), { elevationId: 'e1', optionKey: 'B', workId: 'w2' })
  })

  test('skips an option the client did not pick, and lands on one they can see', () => {
    const elevations = [
      elev('e1', 'A', { A: ['w1'], B: ['w2'] }),
      elev('e2', null, { A: ['w2'] }),
    ]
    assert.deepEqual(budgetLineForWork(elevations, 'w2'), { elevationId: 'e2', optionKey: 'A', workId: 'w2' })
  })

  test('null when the work hangs only on options that were not picked', () => {
    const elevations = [elev('e1', 'A', { A: ['w1'], B: ['w2'] })]
    assert.equal(budgetLineForWork(elevations, 'w2'), null)
  })

  test('null when the work hangs nowhere', () => {
    assert.equal(budgetLineForWork([elev('e1', null, { A: ['w1'] })], 'w9'), null)
  })
})
