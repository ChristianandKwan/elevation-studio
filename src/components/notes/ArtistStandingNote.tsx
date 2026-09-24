'use client'

import { useEffect, useRef, useState } from 'react'
import { ARTIST_STANDING_PROMPT } from '@/lib/notes'
import { useAutosave } from '@/hooks/useAutosave'
import NoteSaveBar from './NoteSaveBar'

interface Props {
  name: string
  note: string
  /** May return a promise, which "Saved" waits on — see useAutosave. */
  onChange: (note: string) => void | Promise<unknown>
}

/**
 * What is true about an artist wherever they hang: who represents them, what
 * their lead times run to, the history with the gallery.
 *
 * Shared by every project, so it is written once and carried. The panel
 * below it is what this client's proposal says about them — the two are kept
 * visibly apart, because editing the standing note changes what other
 * projects say and that should never be a surprise.
 */
export default function ArtistStandingNote({ name, note, onChange }: Props) {
  // Saves itself, and follows the note when it changes elsewhere — it is
  // shared, so another project may be editing it. See useAutosave.
  const { draft: body, setDraft: setBody, flush, status } = useAutosave(note, onChange)
  const [focused, setFocused] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [body])

  return (
    <div className="note-card standing">
      <div className="note-card-head">
        <span className="note-standing-label">About {name}</span>
        <span className="note-standing-scope">Shared by every project</span>
      </div>
      <textarea
        ref={taRef}
        className="note-body"
        value={body}
        placeholder={ARTIST_STANDING_PROMPT}
        onChange={e => setBody(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); flush() }}
      />
      <NoteSaveBar status={status} open={focused} onDone={() => { flush(); taRef.current?.blur() }} />
    </div>
  )
}
