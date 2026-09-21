/**
 * One queue per key, so two writes to the same row cannot overtake each other.
 *
 * Every save in the studio is debounced and optimistic: the screen moves at
 * once and the request follows. That pairing hides a race. If two requests for
 * one row are ever in flight together, the row ends up holding whichever reply
 * arrived last rather than whatever was typed last — and because the screen is
 * optimistic, it goes on showing the value that lost. Nothing looks wrong.
 *
 * That is not hypothetical: a rename typed "Street 2" → "Street " → "Street 1"
 * was stored as "Street ", while the index showed "Street 1" until the page
 * was reloaded.
 *
 * Keeping this out of the component is what makes it testable — the component
 * needs a browser, the ordering rule does not.
 */

/** Held per key; a rejected write must not poison the queue behind it. */
export type WriteQueue = Map<string, Promise<void>>

export function createWriteQueue(): WriteQueue {
  return new Map()
}

/**
 * Run `write` after anything already queued for `key`. Returns a promise for
 * this write alone, so a caller still sees its own failure, while the queue
 * itself swallows it so the next write in line still runs.
 */
export function enqueue(queue: WriteQueue, key: string, write: () => Promise<void>): Promise<void> {
  const after = queue.get(key) ?? Promise.resolve()
  const run = after.then(write)
  queue.set(key, run.catch(() => {}))
  return run
}
