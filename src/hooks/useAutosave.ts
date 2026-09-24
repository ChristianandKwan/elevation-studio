'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

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

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // What a timer, a blur or the page closing should save: read at that
  // moment, not at the render that set the timer.
  const latest = useRef({ draft, saved, save })
  useEffect(() => { latest.current = { draft, saved, save } })

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const { draft: text, saved: before, save: write } = latest.current
    if (text === before) return
    latest.current.saved = text
    setSaved(text)
    setStatus('saving')
    Promise.resolve(write(text)).then(
      () => setStatus(s => (s === 'saving' ? 'saved' : s)),
      () => setStatus('unsaved'),
    )
  }, [])

  const setDraft = useCallback((text: string) => {
    setDraftState(text)
    setStatus('unsaved')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, delayMs)
  }, [flush, delayMs])

  // "Saved" is a moment's reassurance, not a permanent label on every note.
  useEffect(() => {
    if (status !== 'saved') return
    const t = setTimeout(() => setStatus(s => (s === 'saved' ? 'idle' : s)), SAVED_SHOWN_MS)
    return () => clearTimeout(t)
  }, [status])

  // Off screen (another option opened, the panel closed) or the page closing:
  // whatever is still waiting goes now.
  useEffect(() => {
    window.addEventListener('pagehide', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      flush()
    }
  }, [flush])

  return { draft, setDraft, flush, status }
}
