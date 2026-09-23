'use client'

import { useState } from 'react'
import WorkEditor from './WorkEditor'
import { fmtGbp, netPrice, tbcNetPrice } from '@/components/budget/budgetCalc'
import { SET_ASIDE_BADGE } from '@/lib/works'
import type { IndexElevation, Placed, WorkPatch } from '@/lib/works'
import type { Work } from '@/types'

interface Props {
  work: Work
  /** Each elevation the work hangs on, with the option labels. */
  placed: Placed[]
  elevations: IndexElevation[]
  onChange: (patch: WorkPatch) => void
  /**
   * The artist goes through its own path, not through `onChange`: naming an
   * artist may create one, and a work points at the row rather than carrying
   * the text.
   */
  onArtistChange: (name: string) => void
  onDelete: () => void
}

export default function WorkRow({ work, placed, elevations, onChange, onArtistChange, onDelete }: Props) {
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <WorkEditor
        work={work}
        elevations={elevations}
        onChange={onChange}
        onArtistChange={onArtistChange}
        onDelete={onDelete}
        onDone={() => setEditing(false)}
      />
    )
  }

  const net = netPrice(work)
  const discounted = work.discountStatus === 'confirmed' && net !== work.price
  const tbcNet = tbcNetPrice(work)
  const meta = [work.year, work.medium, work.edition].filter(Boolean).join(' · ')
  const consideredFor = placed.length === 0 && work.consideredFor
    ? elevations.find(e => e.id === work.consideredFor)?.name ?? null
    : null
  const noteHidden = !work.noteShownToClient

  return (
    <div className={`index-row${work.setAside ? ' index-row--aside' : ''}`}>
      <div className="index-thumb">
        {work.imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={work.imageUrl} crossOrigin="anonymous" alt="" />
          : <span className="index-thumb-empty">No image</span>}
      </div>
      <div className="index-main">
        <div className="index-main-row">
          <div className="index-identity">
            <span className="budget-artwork-title">{work.name}</span>
            {meta && <span className="index-meta">{meta}</span>}
            {work.source && <span className="index-meta index-meta--source">{work.source}</span>}
          </div>
          <span className="budget-artwork-dims">{work.wCm} × {work.hCm} cm</span>
          <span className="budget-artwork-price">
            {discounted && <span className="budget-price-was">{fmtGbp(work.price)}</span>}
            {fmtGbp(net)}
          </span>
          {work.setAside
            ? <span className={`index-status index-status--${work.setAside}`}>{SET_ASIDE_BADGE[work.setAside]}</span>
            // Live is the ordinary case and says nothing. Where the work
            // stands is the chip row below, worked out from the placements.
            : <span className="index-status index-status--none" aria-hidden="true" />}
          <button type="button" className="budget-line-edit" onClick={() => setEditing(true)}>Edit</button>
        </div>

        <div className="index-where">
          {placed.map(p => (
            <span key={p.elevationId} className="index-chip">{p.elevationName} · {p.labels.join(', ')}</span>
          ))}
          {placed.length === 0 && consideredFor && (
            <span className="index-chip index-chip--considered">For {consideredFor} · not hung yet</span>
          )}
          {placed.length === 0 && !consideredFor && (
            <span className="index-chip index-chip--unplaced">Not on a wall</span>
          )}
          {placed.length > 1 && (
            <span
              className="index-chip index-chip--warn"
              title="Options on one elevation are alternatives, so a work on two of them is counted once. Two elevations are both bought, so it is counted twice."
            >
              On {placed.length} walls — the budget counts it {placed.length} times
            </span>
          )}
          {!work.vatApplies && <span className="budget-badge budget-badge--novat">No VAT</span>}
          {work.discountStatus === 'confirmed' && work.discountPercent != null && (
            <span className="budget-badge budget-badge--discount">Discount {work.discountPercent}%</span>
          )}
          {work.discountStatus === 'tbc' && (
            <span className="budget-badge budget-badge--tbc">
              {work.discountPercent != null ? `Discount ${work.discountPercent}% TBC` : 'Discount TBC'}
            </span>
          )}
        </div>

        {tbcNet != null && (
          <p className="budget-tbc-note">Not yet agreed. Would bring this work to {fmtGbp(tbcNet)}.</p>
        )}

        {work.note.trim().length > 0 && (
          <div className={`budget-note-row${noteHidden ? ' budget-note-row--internal' : ''}`}>
            <span className="budget-note-text">
              {work.note}
              {noteHidden && <span className="budget-badge budget-badge--internal">Internal</span>}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
