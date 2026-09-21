/**
 * The rule: a screen may render empty only when the database said empty.
 *
 * This is the trap migration `034` sprang. The code asked for a column that
 * had not been added yet, the select 400'd, `data` came back null, `?? []`
 * turned that into an empty list, and every project rendered with no works,
 * no index and no notes. It looked exactly like data loss. It was not — the
 * rows were untouched and the query simply never ran.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { firstLoadFailure, looksLikeSchemaDrift } from './loadGuard.ts'

const ok = { error: null }
const failed = (message: string) => ({ error: { message } })

describe('telling a failed load from an empty one', () => {
  test('all clear when every load ran', () => {
    assert.equal(firstLoadFailure([['works', ok], ['notes', ok]]), null)
  })

  test('an empty result is not a failure', () => {
    // A project really can have no works. That must still render.
    assert.equal(firstLoadFailure([['works', { error: null }]]), null)
  })

  test('a failure is reported with which load it was', () => {
    const f = firstLoadFailure([['works', ok], ['notes', failed('boom')]])
    assert.deepEqual(f, { what: 'notes', detail: 'boom' })
  })

  test('the first failure wins, so the message names a real cause', () => {
    const f = firstLoadFailure([
      ['elevations', failed('first')],
      ['works', failed('second')],
    ])
    assert.equal(f?.what, 'elevations')
  })

  test('a missing result counts as no failure, not a crash', () => {
    assert.equal(firstLoadFailure([['works', null], ['notes', undefined]]), null)
  })
})

describe('naming the deploy-order case', () => {
  test('a missing column is recognised', () => {
    // This is verbatim what PostgREST said when 034 had not been run.
    assert.ok(looksLikeSchemaDrift({
      what: 'works',
      detail: 'column works.set_aside does not exist',
    }))
  })

  test('so is a stale schema cache, which is the same thing arriving late', () => {
    assert.ok(looksLikeSchemaDrift({
      what: 'works',
      detail: "Could not find the 'set_aside' column of 'works' in the schema cache",
    }))
  })

  test('an ordinary failure is not blamed on a migration', () => {
    // Saying "run the migration" about a dropped connection sends whoever
    // reads it looking in the wrong place.
    assert.ok(!looksLikeSchemaDrift({ what: 'works', detail: 'fetch failed' }))
    assert.ok(!looksLikeSchemaDrift({ what: 'works', detail: 'JWT expired' }))
  })
})
