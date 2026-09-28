'use client'

import { SHARE_META } from '@/lib/notes'

interface Props {
  note: string
  shownToClient: boolean
  /** Opens the budget at this note's line. Omitted when the line is not on the budget. */
  onEdit?: (() => void) | null
  /** Said instead of the link when there is nowhere on the budget to go. */
  offBudget?: string
}

/**
 * A budget note, read somewhere other than the budget: a work's in the Index,
 * an option's on the Notes screen.
 *
 * It is written and changed only on the budget page, beside the figures it
 * talks about, so here it is a quotation with a way back to its line — not a
 * second place to edit it (Tom, 2026-09-28).
 */
export default function BudgetNoteRef({ note, shownToClient, onEdit, offBudget }: Props) {
  const text = note.trim()
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
      </div>
      <p className="budget-ref-text">{text}</p>
    </div>
  )
}
