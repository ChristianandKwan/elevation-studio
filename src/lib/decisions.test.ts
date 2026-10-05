import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { allDecided, decisionsFor, elevationApproved, resolvedOption, type DecisionElevation } from './decisions.ts'
import type { BudgetChoice, BudgetChoicePicks } from '@/types'

function wall(id: string, picked: string | null, options: Array<{ key: string; hasWall?: boolean; approved?: boolean }>): DecisionElevation {
  return {
    id, name: id, clientPickedOption: picked,
    options: options.map(o => ({ hasWall: true, approved: false, ...o, artworks: [{ workId: `${id}-${o.key}`, visible: true }] })),
  }
}

function framing(workIds: string[]): BudgetChoice {
  return {
    id: 'framing', name: 'Framing', kind: 'framing', pricing: 'per_work', shownToClient: true,
    groups: [{ id: 'g', label: 'Framer 1', internalNote: '', alternatives: [
      { id: 'a', name: 'Standard', description: '', vatApplies: true, prices: Object.fromEntries(workIds.map(w => [w, 100])), amount: null },
    ] }],
  }
}

const picked: BudgetChoicePicks = { framing: { alternativeId: 'a', by: 'client', at: '' } }

describe('a wall', () => {
  test('one option with a wall needs no pick, and stands in for it', () => {
    const e = wall('hall', null, [{ key: 'A' }, { key: 'B', hasWall: false }])
    assert.equal(resolvedOption(e), 'A')
  })

  test('a blank wall counts as a wall', () => {
    // FIXED: the server used to count photographs only, so a project of
    // blank walls could never be approved.
    const e = wall('hall', null, [{ key: 'A', hasWall: true, approved: true }])
    assert.equal(elevationApproved(e), true)
  })

  test('two options need a pick before an approval counts', () => {
    const e = wall('hall', null, [{ key: 'A', approved: true }, { key: 'B' }])
    assert.equal(elevationApproved(e), false)
  })
})

describe('the project', () => {
  const approvedWall = () => wall('hall', 'A', [{ key: 'A', approved: true }, { key: 'B' }])

  test('walls approved and no choices: approved, as before', () => {
    assert.equal(allDecided([approvedWall()], [], {}), true)
  })

  test('walls approved but a choice open: not yet', () => {
    assert.equal(allDecided([approvedWall()], [framing(['hall-A'])], {}), false)
  })

  test('walls approved and the choice picked: approved', () => {
    assert.equal(allDecided([approvedWall()], [framing(['hall-A'])], picked), true)
  })

  test('a hidden choice, or one not yet priced, holds nothing back', () => {
    assert.equal(allDecided([approvedWall()], [{ ...framing(['hall-A']), shownToClient: false }], {}), true)
    assert.equal(allDecided([approvedWall()], [framing([])], {}), true)
  })

  test('no walls is never approved', () => {
    assert.equal(allDecided([], [], {}), false)
  })

  test('the checklist names what is left, walls first', () => {
    const list = decisionsFor([wall('hall', null, [{ key: 'A' }, { key: 'B' }])], [framing(['hall-A', 'hall-B'])], {})
    assert.deepEqual(list.map(d => [d.kind, d.name, d.done, d.todo]), [
      ['elevation', 'hall', false, 'choose'],
      ['choice', 'Framing', false, 'choose'],
    ])
  })
})
