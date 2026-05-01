'use client'

import { fmtGbp } from './budgetCalc'
import type { BudgetArtwork } from './budgetCalc'

interface Props {
  artwork: BudgetArtwork
  vatMode: boolean
}

export default function ArtworkLine({ artwork, vatMode }: Props) {
  const price = vatMode ? Math.round(artwork.price * 1.2) : artwork.price
  const showFraming = artwork.framingStatus === 'requires_framing' && artwork.framingCost != null
  const framingCost = showFraming
    ? (vatMode ? Math.round(artwork.framingCost! * 1.2) : artwork.framingCost!)
    : null
  const dims = `${artwork.wCm} × ${artwork.hCm} cm`

  return (
    <div className="budget-artwork-line">
      <div className="budget-artwork-main-row">
        <div className="budget-artwork-identity">
          <span className="budget-artwork-title">{artwork.name}</span>
          {artwork.artist && <span className="budget-artwork-artist">{artwork.artist}</span>}
        </div>
        <span className="budget-artwork-dims">{dims}</span>
        <span className="budget-artwork-price">{fmtGbp(price)}</span>
      </div>
      {framingCost != null && (
        <div className="budget-artwork-framing-row">
          <span className="budget-artwork-framing-label">+ Framing</span>
          <span className="budget-artwork-framing-cost">{fmtGbp(framingCost)}</span>
        </div>
      )}
    </div>
  )
}
