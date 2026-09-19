'use client'

import { newSubLineItem } from '@/lib/lineItems'
import { netPrice, tbcNetPrice, subItemAmount, fmtGbp } from '@/components/budget/budgetCalc'
import type { DiscountStatus, SubLineItem, SubLineItemKind } from '@/types'
import type { ArtworkLineItemPatch } from '@/hooks/useStudio'

interface Props {
  price: number
  vatApplies: boolean
  discountStatus: DiscountStatus
  discountPercent: number | null
  subLineItems: SubLineItem[]
  note: string
  noteShownToClient: boolean
  isLocked: boolean
  onChange: (patch: ArtworkLineItemPatch) => void
}

/** Sub items the consultant can add in one click, in the order offered. */
const QUICK_ADD: { kind: SubLineItemKind; label: string }[] = [
  { kind: 'duty', label: 'Import duty' },
  { kind: 'shipping', label: 'Shipping' },
  { kind: 'other', label: 'Something else' },
]

const DISCOUNT_HINT: Record<DiscountStatus, string> = {
  none: 'No discount on this work.',
  confirmed: 'Agreed with the gallery. The list price is struck through and every total uses the net figure.',
  tbc: 'Shown to the client, but no total moves until it is agreed. Pick None if you doubt it will happen at all.',
}

export default function ArtworkBudgetFields({
  price, vatApplies, discountStatus, discountPercent, subLineItems,
  note, noteShownToClient, isLocked, onChange,
}: Props) {
  const stop = (e: React.MouseEvent) => e.stopPropagation()

  const artLike = { price, discountStatus, discountPercent }
  const net = netPrice(artLike)
  const tbcNet = tbcNetPrice(artLike)

  // Framing keeps its own control further up the panel; this list holds the rest.
  const others = subLineItems.filter(i => i.kind !== 'framing')

  function patchSub(id: string, patch: Partial<SubLineItem>) {
    onChange({
      subLineItems: subLineItems.map(i => (i.id === id ? { ...i, ...patch } : i)),
    })
  }

  function addSub(kind: SubLineItemKind) {
    onChange({ subLineItems: [...subLineItems, newSubLineItem(kind)] })
  }

  function removeSub(id: string) {
    onChange({ subLineItems: subLineItems.filter(i => i.id !== id) })
  }

  return (
    <>
      {/* ── VAT ───────────────────────────────────────────────────────── */}
      <div className="aw-field-row">
        <label className="aw-f-label">VAT</label>
        <div className="aw-framing-toggle">
          <button
            type="button"
            className={`btn btn-sm${vatApplies ? ' btn-primary' : ''}`}
            disabled={isLocked}
            onClick={e => { stop(e); onChange({ vatApplies: true }) }}
          >
            Standard
          </button>
          <button
            type="button"
            className={`btn btn-sm${!vatApplies ? ' btn-primary' : ''}`}
            disabled={isLocked}
            onClick={e => { stop(e); onChange({ vatApplies: false }) }}
          >
            No VAT
          </button>
        </div>
      </div>
      {!vatApplies && (
        <p className="aw-hint">
          Bought outside the UK. Any import duty goes on as a sub item below.
        </p>
      )}

      {/* ── Discount ──────────────────────────────────────────────────── */}
      <div className="aw-field-row">
        <label className="aw-f-label">Discount</label>
        <div className="aw-seg">
          {(['none', 'confirmed', 'tbc'] as DiscountStatus[]).map(s => (
            <button
              key={s}
              type="button"
              className={`aw-seg-btn${discountStatus === s ? ' active' : ''}`}
              disabled={isLocked}
              onClick={e => {
                stop(e)
                onChange({
                  discountStatus: s,
                  // Offer a starting figure rather than an empty box.
                  discountPercent: s === 'none' ? null : (discountPercent ?? 10),
                })
              }}
            >
              {s === 'none' ? 'None' : s === 'confirmed' ? 'Confirmed' : 'TBC'}
            </button>
          ))}
        </div>
      </div>

      {discountStatus !== 'none' && (
        <>
          <div className="aw-field-row">
            <label className="aw-f-label">Rate</label>
            <div className="aw-price-wrap">
              <input
                type="number"
                className="aw-price-input aw-price-input--pct"
                value={discountPercent ?? ''}
                min={0}
                max={100}
                placeholder="0"
                disabled={isLocked}
                onClick={stop}
                onChange={e => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  onChange({ discountPercent: v == null || isNaN(v) ? null : v })
                }}
              />
              <span className="aw-price-suffix">%</span>
              <span className="aw-inline-result">
                {discountStatus === 'confirmed'
                  ? `= ${fmtGbp(net)}`
                  : tbcNet != null ? `would be ${fmtGbp(tbcNet)}` : ''}
              </span>
            </div>
          </div>
          <p className="aw-hint">{DISCOUNT_HINT[discountStatus]}</p>
        </>
      )}

      {/* ── Sub line items ────────────────────────────────────────────── */}
      <div className="aw-field-row aw-field-row--stack">
        <label className="aw-f-label">Other costs</label>
        <div className="aw-subs">
          {others.length === 0 && (
            <p className="aw-hint aw-hint--flush">Nothing beyond framing on this work.</p>
          )}
          {others.map(item => (
            <div key={item.id} className="aw-sub-row">
              <input
                type="text"
                className="aw-sub-label-input"
                value={item.label}
                placeholder="Label"
                disabled={isLocked}
                onClick={stop}
                onChange={e => patchSub(item.id, { label: e.target.value })}
              />
              <div className="aw-sub-amount">
                {item.mode === 'percent' ? (
                  <>
                    <input
                      type="number"
                      className="aw-price-input aw-price-input--pct"
                      value={item.percent || ''}
                      min={0}
                      max={100}
                      placeholder="0"
                      disabled={isLocked}
                      onClick={stop}
                      onChange={e => patchSub(item.id, { percent: Number(e.target.value) || 0 })}
                    />
                    <span className="aw-price-suffix">%</span>
                    <span className="aw-inline-result">
                      {fmtGbp(subItemAmount(item, net))}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="aw-price-prefix">£</span>
                    <input
                      type="number"
                      className="aw-price-input"
                      value={item.amount || ''}
                      min={0}
                      step={50}
                      placeholder="0"
                      disabled={isLocked}
                      onClick={stop}
                      onChange={e => patchSub(item.id, { amount: Number(e.target.value) || 0 })}
                    />
                  </>
                )}
              </div>
              <div className="aw-sub-controls">
                <button
                  type="button"
                  className="aw-sub-mode"
                  disabled={isLocked}
                  onClick={e => {
                    stop(e)
                    patchSub(item.id, { mode: item.mode === 'percent' ? 'fixed' : 'percent' })
                  }}
                  title={item.mode === 'percent' ? 'Switch to a fixed amount' : 'Switch to a percentage'}
                >
                  {item.mode === 'percent' ? 'to £' : 'to %'}
                </button>
                <label className="aw-toggle" onClick={stop}>
                  <input
                    type="checkbox"
                    checked={item.vatApplies}
                    disabled={isLocked}
                    onChange={e => patchSub(item.id, { vatApplies: e.target.checked })}
                  />
                  VAT
                </label>
                <button
                  type="button"
                  className="aw-sub-remove"
                  disabled={isLocked}
                  aria-label={`Remove ${item.label || 'item'}`}
                  onClick={e => { stop(e); removeSub(item.id) }}
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          <div className="aw-sub-add">
            {QUICK_ADD.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                className="aw-link-btn"
                disabled={isLocked}
                onClick={e => { stop(e); addSub(kind) }}
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Note ──────────────────────────────────────────────────────── */}
      <div className="aw-field-row aw-field-row--stack">
        <label className="aw-f-label">Note</label>
        <textarea
          className="aw-note-input"
          value={note}
          rows={3}
          placeholder="Gallery, availability, what is still to be confirmed…"
          disabled={isLocked}
          onClick={stop}
          onChange={e => onChange({ note: e.target.value })}
        />
      </div>
      {note.trim().length > 0 && (
        <div className="aw-field-row">
          <label className="aw-toggle aw-toggle--wide" onClick={stop}>
            <input
              type="checkbox"
              checked={noteShownToClient}
              disabled={isLocked}
              onChange={e => onChange({ noteShownToClient: e.target.checked })}
            />
            Show this note to the client
          </label>
        </div>
      )}
    </>
  )
}
