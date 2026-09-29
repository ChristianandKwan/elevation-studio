'use client'

import { useState } from 'react'
import ShareSwitch from './ShareSwitch'
import { BUDGET_SHARE_TITLES, SHARE_META, budgetNoteShare } from '@/lib/notes'

interface Props {
  note: string
  shownToClient: boolean
  /** Opens the budget at this note's line. Omitted when the line is not on the budget. */
  onEdit?: (() => void) | null
  /** Said instead of the link when there is nowhere on the budget to go. */
  offBudget?: string
  /**
   * Changes the note here. Used only when there is no line to jump to — a
   * work that hangs nowhere, or an option the client did not pick — because
   * the note would otherwise be stuck, editable nowhere (Tom, 2026-09-29).
   */
  onChange?: (note: string, shownToClient: boolean) => void
}

/**
 * A budget note, read somewhere other than the Budget page: a work's in the
 * Index, an option's on the Notes screen.
 *
 * It is written and changed on the Budget page, beside the figures it talks
 * about, so here it is a quotation with a way back to its line — not a second
 * place to edit it (Tom, 2026-09-28). The one exception is a note with no line
 * to go back to.
 */
export default function BudgetNoteRef({ note, shownToClient, onEdit, offBudget, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const text = note.trim()
  const editHere = !onEdit && onChange

  if (editing && editHere) {
    return (
      <div className="budget-ref budget-ref--editing">
        <div className="budget-ref-head">
          <span className="budget-ref-kicker">Budget</span>
          {offBudget && <span className="budget-ref-off">{offBudget}</span>}
        </div>
        <textarea
          className="ble-textarea"
          value={note}
          rows={2}
          autoFocus
          aria-label="Budget note"
          onChange={e => onChange(e.target.value, shownToClient)}
        />
        <div className="budget-note-edit-foot">
          <ShareSwitch
            value={budgetNoteShare(shownToClient)}
            onChange={share => onChange(note, share === 'client')}
            titles={BUDGET_SHARE_TITLES}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      </div>
    )
  }

  if (!text) return null

  return (
    <div className={`budget-ref${shownToClient ? '' : ' budget-ref--ck'}`}>
      <div className="budget-ref-head">
        <span className="budget-ref-kicker">Budget</span>
        {!shownToClient && (
          <span className="budget-badge budget-badge--internal" title={SHARE_META.studio.title}>
            {SHARE_META.studio.label}
          </span>
        )}
        {onEdit
          ? <button type="button" className="ble-link budget-ref-edit" onClick={onEdit}>Edit on budget</button>
          : offBudget && <span className="budget-ref-off">{offBudget}</span>}
        {editHere && (
          <button type="button" className="budget-line-edit" onClick={() => setEditing(true)}>Edit</button>
        )}
      </div>
      <p className="budget-ref-text">{text}</p>
    </div>
  )
}
