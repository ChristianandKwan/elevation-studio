'use client'

import type { SaveStatus } from '@/hooks/useAutosave'

const WORDS: Record<SaveStatus, string> = {
  idle: '',
  unsaved: '',
  saving: 'Saving…',
  saved: 'Saved',
}

/**
 * Under a note while it is being written: whether it has saved, and a Done
 * button for anyone whose instinct is to press something when they finish.
 *
 * Done saves and leaves the box; it is never needed, because the note saves
 * itself (useAutosave). It is there because a text box with nothing to press
 * reads as a form that has not been submitted.
 */
export default function NoteSaveBar({ status, open, onDone }: {
  status: SaveStatus
  /** The box has focus, so Done is on offer. */
  open: boolean
  onDone: () => void
}) {
  if (!open && status === 'idle') return null
  return (
    <div className="note-save-bar">
      <span className="note-save-status" aria-live="polite">{WORDS[status]}</span>
      {open && (
        <button
          type="button"
          className="note-done"
          // Keeps the box focused until the click lands. Without it the box
          // loses focus on mouse-down, this bar hides, and the click misses.
          onMouseDown={e => e.preventDefault()}
          onClick={onDone}
        >
          Done
        </button>
      )}
    </div>
  )
}
