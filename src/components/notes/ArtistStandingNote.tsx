'use client'

import { useEffect, useRef, useState } from 'react'
import { ARTIST_STANDING_PROMPT } from '@/lib/notes'

interface Props {
  name: string
  note: string
  onChange: (note: string) => void
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
  const [body, setBody] = useState(note)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Adjusted during render rather than in an effect — see the same pattern in
  // NotePanel. The standing note is shown on the Notes screen while another
  // project may be editing it.
  const [saved, setSaved] = useState(note)
  if (note !== saved) { setSaved(note); setBody(note) }

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
        onBlur={() => { if (body !== saved) { setSaved(body); onChange(body) } }}
      />
    </div>
  )
}
