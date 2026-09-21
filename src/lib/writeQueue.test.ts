/**
 * Runs under Node's own test runner with no build step.
 *
 *   npm test
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { createWriteQueue, enqueue } from './writeQueue.ts'

/** A write that takes `ms` and records the value it stored when it lands. */
function slowWrite(store: { value: string }, value: string, ms: number) {
  return () => new Promise<void>(resolve => {
    setTimeout(() => { store.value = value; resolve() }, ms)
  })
}

describe('write queue', () => {
  test('a slow early write cannot overtake a fast later one', async () => {
    // The exact shape of the bug: "Street 2" → "Street " → "Street 1", where
    // the middle request is slow enough to land last. Unqueued, the row ends
    // up holding "Street " forever.
    const row = { value: 'Street 2 (From: Street)' }
    const q = createWriteQueue()

    const a = enqueue(q, 'work-1', slowWrite(row, 'Street  (From: Street)', 40))
    const b = enqueue(q, 'work-1', slowWrite(row, 'Street 1 (From: Street)', 1))
    await Promise.all([a, b])

    assert.equal(row.value, 'Street 1 (From: Street)')
  })

  test('without the queue the same two writes land the wrong way round', async () => {
    // Pins *why* the queue is there. If this ever stops being true the race is
    // gone for some other reason and the queue can be reconsidered.
    const row = { value: 'start' }
    await Promise.all([
      slowWrite(row, 'first-but-slow', 40)(),
      slowWrite(row, 'second-but-fast', 1)(),
    ])
    assert.equal(row.value, 'first-but-slow')
  })

  test('different keys do not wait for each other', async () => {
    const order: string[] = []
    const q = createWriteQueue()
    const slow = enqueue(q, 'work-1', () => new Promise(r => setTimeout(() => { order.push('slow'); r() }, 30)))
    const fast = enqueue(q, 'work-2', () => new Promise(r => setTimeout(() => { order.push('fast'); r() }, 1)))
    await Promise.all([slow, fast])
    assert.deepEqual(order, ['fast', 'slow'], 'one row\'s save should not block another\'s')
  })

  test('a failed write does not stop the next one', async () => {
    const row = { value: 'start' }
    const q = createWriteQueue()
    const failed = enqueue(q, 'work-1', () => Promise.reject(new Error('offline')))
    // The caller still sees its own failure...
    await assert.rejects(failed, /offline/)
    // ...but the queue carries on.
    await enqueue(q, 'work-1', slowWrite(row, 'saved anyway', 1))
    assert.equal(row.value, 'saved anyway')
  })

  test('writes run in the order they were queued', async () => {
    const order: number[] = []
    const q = createWriteQueue()
    const writes = [30, 20, 10, 1].map((ms, i) =>
      enqueue(q, 'work-1', () => new Promise<void>(r => setTimeout(() => { order.push(i); r() }, ms))))
    await Promise.all(writes)
    assert.deepEqual(order, [0, 1, 2, 3])
  })
})
