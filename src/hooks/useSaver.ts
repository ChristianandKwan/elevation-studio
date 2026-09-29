'use client'

import { useEffect, useMemo, useRef } from 'react'
import { createSaver, type Saver } from '@/lib/saver'

/**
 * A saver for one screen (see src/lib/saver.ts): typing is written once it
 * pauses, in order, and whatever is still waiting is written when the screen
 * goes or the page closes. `flushAllSavers()` reaches it from an export.
 *
 * `write` and `onError` may change between renders; the latest is used.
 */
export function useSaver<P extends object>(
  write: (key: string, patch: P) => Promise<void>,
  { delayMs, onError }: { delayMs: number; onError?: (key: string, error: unknown) => void },
): Pick<Saver<P>, 'save' | 'flushAll'> {
  const latest = useRef({ write, onError })
  useEffect(() => { latest.current = { write, onError } })

  const saver = useRef<Saver<P> | null>(null)
  useEffect(() => {
    // Made here rather than during render so that each mount has its own,
    // and an unmount (including React's development double-mount) disposes
    // exactly the one it made.
    const s = createSaver<P>({
      delayMs,
      write: (key, patch) => latest.current.write(key, patch),
      onError: (key, error) => latest.current.onError?.(key, error),
    })
    saver.current = s
    const onHide = () => { void s.flushAll() }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      if (saver.current === s) saver.current = null
      void s.dispose()
    }
  }, [delayMs])

  return useMemo(() => ({
    save: (key: string, patch: P) => saver.current?.save(key, patch),
    flushAll: () => saver.current?.flushAll() ?? Promise.resolve(),
  }), [])
}
