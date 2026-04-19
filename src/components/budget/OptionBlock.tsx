'use client'

import { useState } from 'react'
import ArtworkLine from './ArtworkLine'
import { fmtGbp, getOptionTotals } from './budgetCalc'
import type { BudgetOptionData } from './budgetCalc'

interface Props {
  option: BudgetOptionData
  vatMode: boolean
}

export default function OptionBlock({ option, vatMode }: Props) {
  const [open, setOpen] = useState(true)
  const totals = getOptionTotals(option.artworks)
  const subtotal = totals.artworks + totals.framing
  const displayTotal = vatMode ? Math.round(subtotal * 1.2) : subtotal

  return (
    <div className="budget-option-block">
      <button
        className="budget-option-header"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className="budget-option-key">Option {option.key}</span>
        <span className="budget-option-subtotal">{fmtGbp(displayTotal)}</span>
        <span className={`budget-option-chevron${open ? ' open' : ''}`}>›</span>
      </button>

      {open && (
        <div className="budget-option-artworks">
          {option.artworks.length === 0 ? (
            <p className="budget-empty-note">No artworks added</p>
          ) : (
            option.artworks.map(a => (
              <ArtworkLine key={a.id} artwork={a} vatMode={vatMode} />
            ))
          )}
        </div>
      )}
    </div>
  )
}
