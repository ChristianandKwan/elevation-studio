'use client'

import ArtworkLine from './ArtworkLine'
import OptionBlock from './OptionBlock'
import { fmtGbp, getOptionTotals } from './budgetCalc'
import type { BudgetElevationData } from './budgetCalc'

interface Props {
  elevation: BudgetElevationData
  vatMode: boolean
}

export default function ElevationSection({ elevation, vatMode }: Props) {
  const picked = elevation.clientPickedOption

  if (picked) {
    const opt = elevation.options.find(o => o.key === picked)
    const totals = opt ? getOptionTotals(opt.artworks) : null
    const subtotal = totals ? (totals.artworks + totals.framing) : 0
    const displayTotal = vatMode ? Math.round(subtotal * 1.2) : subtotal

    return (
      <div className="budget-elev-block budget-elev-block--picked">
        <div className="budget-elev-header budget-elev-header--picked">
          <span className="budget-elev-name">{elevation.name}</span>
          <span className="budget-elev-pick-badge">✓ Option {picked}</span>
          <span className="budget-elev-total">{fmtGbp(displayTotal)}</span>
        </div>
        <div className="budget-picked-artworks">
          {!opt || opt.artworks.length === 0 ? (
            <p className="budget-empty-note">No artworks added</p>
          ) : (
            opt.artworks.map(a => (
              <ArtworkLine key={a.id} artwork={a} vatMode={vatMode} />
            ))
          )}
        </div>
      </div>
    )
  }

  // Pending: client hasn't picked yet
  return (
    <div className="budget-elev-block">
      <div className="budget-elev-header budget-elev-header--pending">
        <span className="budget-elev-name">{elevation.name}</span>
        <span className="budget-elev-pending-badge">● Selection pending</span>
      </div>
      <div className="budget-options-row">
        {elevation.options.length === 0 ? (
          <p className="budget-empty-note">No options added</p>
        ) : (
          elevation.options.map(opt => (
            <OptionBlock key={opt.key} option={opt} vatMode={vatMode} />
          ))
        )}
      </div>
    </div>
  )
}
