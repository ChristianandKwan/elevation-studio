'use client'

import { fmtGbp, netPrice, tbcNetPrice, subItemAmount, applyVat } from './budgetCalc'
import type { BudgetArtwork } from './budgetCalc'

interface Props {
  artwork: BudgetArtwork
  vatMode: boolean
  /** A client never sees a note the consultant kept back. */
  isConsultant: boolean
}

function NoteIcon({ hidden }: { hidden: boolean }) {
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

export default function ArtworkLine({ artwork, vatMode, isConsultant }: Props) {
  const net = netPrice(artwork)
  const discounted = artwork.discountStatus === 'confirmed' && net !== artwork.price
  const tbcNet = tbcNetPrice(artwork)

  const displayPrice = applyVat(net, artwork.vatApplies, vatMode)
  const displayWas = applyVat(artwork.price, artwork.vatApplies, vatMode)

  const dims = `${artwork.wCm} × ${artwork.hCm} cm`

  // A note the consultant unticked is theirs alone.
  const noteHidden = !artwork.noteShownToClient
  const showNote = artwork.note.trim().length > 0 && (isConsultant || !noteHidden)

  const subs = artwork.subLineItems
    .map(item => ({ item, amount: subItemAmount(item, net) }))
    .filter(({ amount }) => amount !== 0)

  return (
    <div className="budget-artwork-line">
      <div className="budget-artwork-main-row">
        <div className="budget-artwork-identity">
          <span className="budget-artwork-title">{artwork.name}</span>
          {artwork.artist && <span className="budget-artwork-artist">{artwork.artist}</span>}
        </div>
        <span className="budget-artwork-dims">{dims}</span>
        <span className="budget-artwork-price">
          {discounted && <span className="budget-price-was">{fmtGbp(displayWas)}</span>}
          {fmtGbp(displayPrice)}
        </span>
      </div>

      {subs.map(({ item, amount }) => (
        <div key={item.id} className="budget-sub-row">
          <span className="budget-sub-label">
            {item.label || 'Untitled'}
            {item.mode === 'percent' && `, ${item.percent}%`}
            {vatMode && !item.vatApplies && <span className="budget-sub-tag">no VAT</span>}
          </span>
          <span className="budget-sub-cost">
            {fmtGbp(applyVat(amount, item.vatApplies, vatMode))}
          </span>
        </div>
      ))}

      {(!artwork.vatApplies || artwork.discountStatus !== 'none') && (
        <div className="budget-badge-row">
          {!artwork.vatApplies && (
            <span className="budget-badge budget-badge--novat">No VAT</span>
          )}
          {artwork.discountStatus === 'confirmed' && artwork.discountPercent != null && (
            <span className="budget-badge budget-badge--discount">
              Discount {artwork.discountPercent}%
            </span>
          )}
          {artwork.discountStatus === 'tbc' && (
            <span className="budget-badge budget-badge--tbc">
              {artwork.discountPercent != null
                ? `Discount ${artwork.discountPercent}% TBC`
                : 'Discount TBC'}
            </span>
          )}
        </div>
      )}

      {/* A TBC discount is shown but never counted, so say what it would save. */}
      {tbcNet != null && (
        <p className="budget-tbc-note">
          Not yet agreed. Would bring this work to{' '}
          {fmtGbp(applyVat(tbcNet, artwork.vatApplies, vatMode))}.
        </p>
      )}

      {showNote && (
        <div className={`budget-note-row${noteHidden ? ' budget-note-row--internal' : ''}`}>
          <NoteIcon hidden={noteHidden} />
          <span className="budget-note-text">
            {artwork.note}
            {noteHidden && (
              <span className="budget-badge budget-badge--internal">Internal</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
