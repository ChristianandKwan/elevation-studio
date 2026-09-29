'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSaver } from '@/hooks/useSaver'

/**
 * Where a piece of text is on its way to the database.
 *
 *   idle     nothing to say
 *   unsaved  typed, and waiting for a pause
 *   saving   on its way
 *   saved    arrived; said for a moment, then back to idle
 */
export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved'

/** How long a pause in typing is before the text is saved. */
export const AUTOSAVE_DELAY_MS = 800

/** How long "Saved" stays before it goes quiet again. */
const SAVED_SHOWN_MS = 2000

/**
 * A text box that saves itself: after a pause in typing, when it loses
 * focus, when it goes off screen, and when the page is closed.
 *
 * Notes used to save only when the box lost focus. A note typed and then
 * left by closing the tab never lost focus, and its last words went with it;
 * and with nothing on screen saying it had saved, the box read as a form
 * waiting for a Save button (Tom). This is the one place that knows how.
 *
 * `value` is what the parent holds. When it changes from outside — the same
 * note edited in another panel — the box follows it. The parent's echo of
 * this box's own save is recognised and ignored, so it never snaps back.
 *
 * `save` may return a promise; "Saved" waits for it. A save that fails is
 * the parent's to report, and the box shows it as unsaved again.
 */
export function useAutosave(
  value: string,
  save: (text: string) => unknown,
  delayMs: number = AUTOSAVE_DELAY_MS,
) {
  const [draft, setDraftState] = useState(value)
  const [saved, setSaved] = useState(value)
  const [status, setStatus] = useState<SaveStatus>('idle')

  // Changed from outside. Adjusted during render rather than in an effect, so
  // the box never flashes the old text.
  if (value !== saved) {
    setSaved(value)
    setDraftState(value)
  }

  // What a save should compare against and call: read when it runs, not at
  // the render that queued it.
  const latest = useRef({ saved, save })
  useEffect(() => { latest.current = { saved, save } })

  // The pause, the order and the flush on leaving or closing the page are the
  // shared saver's (src/lib/saver.ts). Keeping them in order matters on a slow
  // connection: two saves of one note in flight together used to be able to
  // land the wrong way round, leaving the earlier text stored.
  const saver = useSaver<{ text: string }>(async (_key, { text }) => {
    const { saved: before, save: write } = latest.current
    if (text === before) {
      setStatus(s => (s === 'unsaved' ? 'idle' : s))
      return
    }
    latest.current.saved = text
    setSaved(text)
    setStatus('saving')
    try {
      await write(text)
      setStatus(s => (s === 'saving' ? 'saved' : s))
    } catch {
      setStatus('unsaved')
    }
  }, { delayMs })

  /** Save now: the box lost focus. */
  const flush = useCallback(() => { void saver.flushAll() }, [saver])

  const setDraft = useCallback((text: string) => {
    setDraftState(text)
    setStatus('unsaved')
    saver.save('text', { text })
  }, [saver])

  // "Saved" is a moment's reassurance, not a permanent label on every note.
  useEffect(() => {
    if (status !== 'saved') return
    const t = setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), SAVED_SHOWN_MS)
    return () => clearTimeout(t)
  }, [status])

  return { draft, setDraft, flush, status }
}
