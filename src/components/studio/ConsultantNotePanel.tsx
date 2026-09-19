'use client'

import { useState } from 'react'

interface Props {
  note: string
  shownToClient: boolean
  isLocked: boolean
  onSave: (note: string, shownToClient: boolean) => void
}

/**
 * The consultant's note on the whole option, shown under its header in the
 * budget. Useful wherever something applies to the group rather than to one
 * work: a rate agreed for a pair, a gallery that holds all of them, a caveat
 * about lead times.
 *
 * The caller keys this on the option id, so moving to another option remounts
 * it and the draft starts from that option's stored note. Resetting through an
 * effect instead would cascade a second render on every keystroke.
 */
export default function ConsultantNotePanel({
  note, shownToClient, isLocked, onSave,
}: Props) {
  const [draft, setDraft] = useState(note)
  const [shown, setShown] = useState(shownToClient)

  const dirty = draft !== note || shown !== shownToClient

  return (
    <div className="sidebar-section option-note">
      <div className="option-note-head">
        <span className="option-note-kicker">Note on this option</span>
        {dirty && <span className="option-note-dirty">Unsaved</span>}
      </div>
      <textarea
        className="aw-note-input"
        value={draft}
        rows={3}
        placeholder="Applies to the whole option: an agreed rate on a pair, a gallery, a lead time…"
        disabled={isLocked}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (dirty) onSave(draft, shown) }}
      />
      {draft.trim().length > 0 && (
        <label className="aw-toggle aw-toggle--wide option-note-toggle">
          <input
            type="checkbox"
            checked={shown}
            disabled={isLocked}
            onChange={e => {
              setShown(e.target.checked)
              onSave(draft, e.target.checked)
            }}
          />
          Show this note to the client
        </label>
      )}
    </div>
  )
}
