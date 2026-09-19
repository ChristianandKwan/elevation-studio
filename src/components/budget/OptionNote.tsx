'use client'

interface Props {
  note: string
  shownToClient: boolean
  isConsultant: boolean
}

/**
 * The consultant's note on an option, sitting under its header.
 *
 * This is where a rate agreed for a pair gets explained, because that rate
 * belongs to the combination rather than to either work in it.
 */
export default function OptionNote({ note, shownToClient, isConsultant }: Props) {
  const text = note.trim()
  if (!text) return null

  const hidden = !shownToClient
  if (hidden && !isConsultant) return null

  return (
    <div className={`budget-note-row budget-note-row--option${hidden ? ' budget-note-row--internal' : ''}`}>
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
      <span className="budget-note-text">
        {text}
        {hidden && <span className="budget-badge budget-badge--internal">Internal</span>}
      </span>
    </div>
  )
}
