/**
 * Saving while the consultant types.
 */
import { createWriteQueue, enqueue } from './writeQueue.ts'

export interface SaverOptions<P> {
  /** Writes one row's combined changes. */
  write: (key: string, patch: P) => Promise<void>
  /** How long a pause in typing is. */
  delayMs: number
  /** A write failed. The row's next save still runs. */
  onError?: (key: string, error: unknown) => void
}

export interface Saver<P> {
  /** Queue a change to one row; it is written once typing pauses. */
  save: (key: string, patch: P) => void
  /** Write everything waiting now, and resolve once every write has landed. */
  flushAll: () => Promise<void>
  /** The screen is going: write what is waiting, and stop answering flushAllSavers. */
  dispose: () => Promise<void>
}

/** Every saver still in use, so an export can reach the ones on other screens. */
const live = new Set<Saver<object>>()

/** Write everything waiting in every saver, e.g. before the pack is built from what is saved. */
export async function flushAllSavers(): Promise<void> {
  await Promise.all([...live].map(s => s.flushAll()))
}

export function createSaver<P extends object>({ write, delayMs, onError }: SaverOptions<P>): Saver<P> {
  const pending = new Map<string, P>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const queue = createWriteQueue()

  function flush(key: string): Promise<void> {
    const t = timers.get(key)
    if (t) clearTimeout(t)
    timers.delete(key)
    const patch = pending.get(key)
    pending.delete(key)
    if (!patch) return queue.get(key) ?? Promise.resolve()
    return enqueue(queue, key, () => write(key, patch)).catch(err => { onError?.(key, err) })
  }

  const saver: Saver<P> = {
    save(key, patch) {
      pending.set(key, { ...pending.get(key), ...patch })
      const t = timers.get(key)
      if (t) clearTimeout(t)
      timers.set(key, setTimeout(() => { void flush(key) }, delayMs))
    },
    async flushAll() {
      const keys = new Set([...pending.keys(), ...queue.keys()])
      await Promise.all([...keys].map(key => flush(key)))
    },
    async dispose() {
      live.delete(saver as Saver<object>)
      await saver.flushAll()
    },
  }
  live.add(saver as Saver<object>)
  return saver
}
