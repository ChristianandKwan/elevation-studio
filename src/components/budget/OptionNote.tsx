'use client'

import { useState } from 'react'

interface Props {
  note: string
  shownToClient: boolean
  isConsultant: boolean
  /** Omitted in the client portal and in the consultant's client preview. */
  onChange?: (note: string, shownToClient: boolean) => void
}

function Icon({ hidden }: { hidden: boolean }) {
  return (
    <span className="budget-note-icon" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        {hidden ? (
          <>
            <path d="M1.5 8S3.9 3.5 8 3.5 14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
            <circle cx="8" cy="8" r="1.9" />
            <path d="M2 14 14 2" />
          </>
        ) : (
          <path d="M3 2.5h10M3 6h10M3 9.5h7" />
        )}
      </svg>
    </span>
  )
}

/**
 * The consultant's note on an option, under its header.
 *
 * This is where a rate agreed for a pair gets explained, because that rate
 * belongs to the combination rather than to either work in it.
 */
export default function OptionNote({ note, shownToClient, isConsultant, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const text = note.trim()
  const hidden = !shownToClient

  if (editing && onChange) {
    return (
      <div className="budget-note-row budget-note-row--option budget-note-row--editing">
        <div className="budget-note-edit">
          <textarea
            className="ble-textarea"
            value={note}
            rows={2}
            autoFocus
            placeholder="Applies to the whole option: a rate agreed on a pair, a gallery, a lead time…"
            aria-label="Note on this option"
            onChange={e => onChange(e.target.value, shownToClient)}
          />
          <div className="budget-note-edit-foot">
            <label className="ble-toggle">
              <input
                type="checkbox"
                checked={shownToClient}
                onChange={e => onChange(note, e.target.checked)}
              />
              Show this note to the client
            </label>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(false)}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Nothing written yet: offer it to the consultant, show the client nothing.
  if (!text) {
    if (!onChange) return null
    return (
      <div className="budget-note-row budget-note-row--option budget-note-row--empty">
        <button type="button" className="ble-link" onClick={() => setEditing(true)}>
          + Note on this option
        </button>
      </div>
    )
  }

  if (hidden && !isConsultant) return null

  return (
    <div className={`budget-note-row budget-note-row--option${hidden ? ' budget-note-row--internal' : ''}`}>
      <Icon hidden={hidden} />
      <span className="budget-note-text">
        {text}
        {hidden && <span className="budget-badge budget-badge--internal">Internal</span>}
      </span>
      {onChange && (
        <button type="button" className="budget-line-edit" onClick={() => setEditing(true)}>
          Edit
        </button>
      )}
    </div>
  )
}
