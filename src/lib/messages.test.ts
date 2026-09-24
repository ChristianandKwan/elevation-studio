import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  MESSAGE_MAX_LENGTH, cleanMessage, messageWhen, messagesByOption, rowToMessage, unreadCount,
  type OptionMessage,
} from './messages.ts'

function message(over: Partial<OptionMessage> = {}): OptionMessage {
  return {
    id: 'm1', optionId: 'o1', author: 'client', body: 'hello',
    createdAt: '2026-09-20T10:00:00Z', readAt: null, ...over,
  }
}

describe('rows in', () => {
  test('a row becomes a message', () => {
    const m = rowToMessage({
      id: 'm9', option_id: 'o2', author: 'studio', body: 'Yes, we can.',
      created_at: '2026-09-20T10:00:00Z', read_at: null,
    })
    assert.equal(m.author, 'studio')
    assert.equal(m.optionId, 'o2')
  })

  test('an unrecognised author is the client — it came from outside', () => {
    const m = rowToMessage({
      id: 'm9', option_id: 'o2', author: '??', body: 'x',
      created_at: '2026-09-20T10:00:00Z', read_at: null,
    })
    assert.equal(m.author, 'client')
  })
})

describe('what can be sent', () => {
  test('trimmed', () => {
    assert.equal(cleanMessage('  Could it go higher?\n'), 'Could it go higher?')
  })

  test('nothing, spaces and non-text are not messages', () => {
    assert.equal(cleanMessage(''), null)
    assert.equal(cleanMessage('   \n '), null)
    assert.equal(cleanMessage(42), null)
    assert.equal(cleanMessage(undefined), null)
  })

  test('a pasted document is refused rather than cut', () => {
    assert.equal(cleanMessage('x'.repeat(MESSAGE_MAX_LENGTH)), 'x'.repeat(MESSAGE_MAX_LENGTH))
    assert.equal(cleanMessage('x'.repeat(MESSAGE_MAX_LENGTH + 1)), null)
  })
})

describe('reading a conversation', () => {
  test('grouped by option, oldest first', () => {
    const grouped = messagesByOption([
      message({ id: 'late', createdAt: '2026-09-21T10:00:00Z' }),
      message({ id: 'other', optionId: 'o2' }),
      message({ id: 'early', createdAt: '2026-09-19T10:00:00Z' }),
    ])
    assert.deepEqual(grouped.o1.map(m => m.id), ['early', 'late'])
    assert.deepEqual(grouped.o2.map(m => m.id), ['other'])
  })

  test("only the client's unopened messages are new", () => {
    assert.equal(unreadCount([
      message({ id: 'a' }),
      message({ id: 'b', readAt: '2026-09-20T11:00:00Z' }),
      message({ id: 'c', author: 'studio' }),
    ]), 1)
    assert.equal(unreadCount(undefined), 0)
  })
})

describe('when it was sent', () => {
  const now = new Date('2026-09-24T15:00:00Z')

  test('today is a time', () => {
    assert.match(messageWhen('2026-09-24T09:05:00Z', now), /^\d\d:\d\d$/)
  })

  test('this year is a day and month', () => {
    const s = messageWhen('2026-09-19T09:05:00Z', now)
    assert.match(s, /^19 /)
    assert.doesNotMatch(s, /2026/)
  })

  test('an earlier year says so', () => {
    assert.match(messageWhen('2025-09-19T09:05:00Z', now), /2025/)
  })

  test('nonsense is blank rather than "Invalid Date"', () => {
    assert.equal(messageWhen('not a date', now), '')
  })
})
