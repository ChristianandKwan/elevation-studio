'use client'

import { useState } from 'react'
import ArtworkLine from './ArtworkLine'
import { fmtGbp, getOptionTotals } from './budgetCalc'
import type { BudgetOptionData } from './budgetCalc'

interface Props {
  option: BudgetOptionData
  vatMode: boolean
  /**
   * `block`: one of up to three side-by-side blocks (the original layout).
   * `card`: one of a stack of full-width cards, used from four options up,
   * with a header that folds the artworks away. Cards start open so the
   * client can see what each option holds; print forces them open.
   */
  layout?: 'block' | 'card'
}

export default function OptionBlock({ option, vatMode, layout = 'block' }: Props) {
  const [open, setOpen] = useState(true)
  const totals = getOptionTotals(option.artworks)
  const subtotal = totals.artworks + totals.framing
  const displayTotal = vatMode ? Math.round(subtotal * 1.2) : subtotal
  const keyClass = `budget-option-key${option.name ? ' budget-option-key--named' : ''}`
  const count = option.artworks.length

  const artworks = (
    <div className={`budget-option-artworks${layout === 'card' && !open ? ' budget-option-artworks--collapsed' : ''}`}>
      {count === 0 ? (
        <p className="budget-empty-note">No artworks added</p>
      ) : (
        option.artworks.map(a => (
          <ArtworkLine key={a.id} artwork={a} vatMode={vatMode} />
        ))
      )}
    </div>
  )

  if (layout === 'card') {
    return (
      <div className="budget-option-block budget-option-card">
        <button
          type="button"
          className="budget-option-header budget-option-header--toggle"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
        >
          <span className={keyClass}>{option.title}</span>
          <span className="budget-option-count">{count} artwork{count === 1 ? '' : 's'}</span>
          <span className="budget-option-subtotal">{fmtGbp(displayTotal)}</span>
          <span className={`budget-option-chevron${open ? ' open' : ''}`} aria-hidden="true" />
        </button>
        {artworks}
      </div>
    )
  }

  return (
    <div className="budget-option-block">
      <div className="budget-option-header">
        <span className={keyClass}>{option.title}</span>
        <span className="budget-option-subtotal">{fmtGbp(displayTotal)}</span>
      </div>
      {artworks}
    </div>
  )
}
