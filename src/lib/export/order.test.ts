import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hangingOrder } from './order.ts'

test('works are listed left to right, whatever order they were placed in', () => {
  // Nepean's third Scher option: dragged on London first, hung Berlin, World
  // Trade Routes, London.
  const placed = [
    { id: 'london', x_fraction: 0.7, y_fraction: 0.3 },
    { id: 'berlin', x_fraction: 0.05, y_fraction: 0.3 },
    { id: 'wtr', x_fraction: 0.35, y_fraction: 0.32 },
  ]
  assert.deepEqual(hangingOrder(placed).map(p => p.id), ['berlin', 'wtr', 'london'])
})

test('two works sharing a left edge read top first', () => {
  const placed = [
    { id: 'lower', x_fraction: 0.2, y_fraction: 0.6 },
    { id: 'upper', x_fraction: 0.2, y_fraction: 0.1 },
  ]
  assert.deepEqual(hangingOrder(placed).map(p => p.id), ['upper', 'lower'])
})

test('the input is left as it was', () => {
  const placed = [{ id: 'b', x_fraction: 0.9, y_fraction: 0 }, { id: 'a', x_fraction: 0.1, y_fraction: 0 }]
  hangingOrder(placed)
  assert.deepEqual(placed.map(p => p.id), ['b', 'a'])
})
