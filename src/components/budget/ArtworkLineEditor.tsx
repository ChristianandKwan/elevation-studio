'use client'

import { newSubLineItem } from '@/lib/lineItems'
import { fmtGbp, netPrice, tbcNetPrice, subItemAmount, artworkLineTotal } from './budgetCalc'
import type { BudgetArtwork, BudgetArtworkPatch } from './budgetCalc'
import type { DiscountStatus, SubLineItem, SubLineItemKind } from '@/types'

interface Props {
  artwork: BudgetArtwork
  vatMode: boolean
  onChange: (patch: BudgetArtworkPatch) => void
  onDone: () => void
}

const QUICK_ADD: { kind: SubLineItemKind; label: string }[] = [
  { kind: 'framing', label: 'Framing' },
  { kind: 'duty', label: 'Import duty' },
  { kind: 'shipping', label: 'Shipping' },
  { kind: 'other', label: 'Something else' },
]

const DISCOUNT_LABEL: Record<DiscountStatus, string> = {
  none: 'None',
  confirmed: 'Confirmed',
  tbc: 'TBC',
}

const DISCOUNT_HINT: Record<DiscountStatus, string> = {
  none: 'No discount on this work.',
  confirmed: 'Agreed with the gallery. The list price is struck through and every total uses the net figure.',
  tbc: 'The client sees the rate you are chasing, but no total moves until it is agreed. Pick None if you doubt it will happen at all.',
}

export default function ArtworkLineEditor({ artwork, vatMode, onChange, onDone }: Props) {
  const net = netPrice(artwork)
  const tbcNet = tbcNetPrice(artwork)

  function patchSub(id: string, patch: Partial<SubLineItem>) {
    onChange({ subLineItems: artwork.subLineItems.map(i => (i.id === id ? { ...i, ...patch } : i)) })
  }

  function addSub(kind: SubLineItemKind) {
    onChange({ subLineItems: [...artwork.subLineItems, newSubLineItem(kind)] })
  }

  function removeSub(id: string) {
    onChange({ subLineItems: artwork.subLineItems.filter(i => i.id !== id) })
  }

  return (
    <div className="ble">
      <div className="ble-head">
        <div>
          <span className="ble-title">{artwork.name}</span>
          {artwork.artist && <span className="ble-artist">{artwork.artist}</span>}
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={onDone}>Done</button>
      </div>

      <div className="ble-grid">
        {/* ── Price ─────────────────────────────────────────────────── */}
        <div className="ble-field">
          <span className="ble-label">Price</span>
          <div className="ble-input-wrap">
            <span className="ble-prefix">£</span>
            <input
              type="number"
              className="ble-input"
              value={artwork.price || ''}
              min={0}
              step={50}
              placeholder="0"
              aria-label="Price excluding VAT"
              onChange={e => onChange({ price: Number(e.target.value) || 0 })}
            />
            <span className="ble-suffix">ex-VAT</span>
          </div>
        </div>

        {/* ── VAT ───────────────────────────────────────────────────── */}
        <div className="ble-field">
          <span className="ble-label">VAT</span>
          <div className="ble-seg">
            <button
              type="button"
              className={`ble-seg-btn${artwork.vatApplies ? ' active' : ''}`}
              onClick={() => onChange({ vatApplies: true })}
            >
              Standard 20%
            </button>
            <button
              type="button"
              className={`ble-seg-btn${!artwork.vatApplies ? ' active' : ''}`}
              onClick={() => onChange({ vatApplies: false })}
            >
              No VAT
            </button>
          </div>
          {!artwork.vatApplies && (
            <p className="ble-hint">
              Bought outside the UK. Import duty goes on below as its own cost.
            </p>
          )}
        </div>

        {/* ── Discount ──────────────────────────────────────────────── */}
        <div className="ble-field ble-field--wide">
          <span className="ble-label">Discount</span>
          <div className="ble-discount-row">
            <div className="ble-seg">
              {(['none', 'confirmed', 'tbc'] as DiscountStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  className={`ble-seg-btn${artwork.discountStatus === s ? ' active' : ''}`}
                  onClick={() => onChange({
                    discountStatus: s,
                    // Offer a figure rather than an empty box.
                    discountPercent: s === 'none' ? null : (artwork.discountPercent ?? 10),
                  })}
                >
                  {DISCOUNT_LABEL[s]}
                </button>
              ))}
            </div>
            {artwork.discountStatus !== 'none' && (
              <div className="ble-input-wrap ble-input-wrap--pct">
                <input
                  type="number"
                  className="ble-input"
                  value={artwork.discountPercent ?? ''}
                  min={0}
                  max={100}
                  placeholder="0"
                  aria-label="Discount percentage"
                  onChange={e => {
                    const v = e.target.value === '' ? null : Number(e.target.value)
                    onChange({ discountPercent: v == null || isNaN(v) ? null : v })
                  }}
                />
                <span className="ble-suffix">%</span>
              </div>
            )}
            {artwork.discountStatus === 'confirmed' && (
              <span className="ble-result">nets to <strong>{fmtGbp(net)}</strong></span>
            )}
            {tbcNet != null && (
              <span className="ble-result">would be <strong>{fmtGbp(tbcNet)}</strong></span>
            )}
          </div>
          <p className="ble-hint">{DISCOUNT_HINT[artwork.discountStatus]}</p>
        </div>

        {/* ── Sub line items ────────────────────────────────────────── */}
        <div className="ble-field ble-field--wide">
          <span className="ble-label">Other costs on this work</span>
          {artwork.subLineItems.length === 0 && (
            <p className="ble-hint">Framing, duty, crating. None on this work yet.</p>
          )}
          {artwork.subLineItems.map(item => (
            <div key={item.id} className="ble-sub">
              <input
                type="text"
                className="ble-input ble-input--label"
                value={item.label}
                placeholder="Label"
                aria-label="Cost label"
                onChange={e => patchSub(item.id, { label: e.target.value })}
              />
              <div className="ble-input-wrap ble-input-wrap--amount">
                {item.mode === 'percent' ? (
                  <>
                    <input
                      type="number"
                      className="ble-input"
                      value={item.percent || ''}
                      min={0}
                      max={100}
                      placeholder="0"
                      aria-label="Percentage of the work"
                      onChange={e => patchSub(item.id, { percent: Number(e.target.value) || 0 })}
                    />
                    <span className="ble-suffix">% = {fmtGbp(subItemAmount(item, net))}</span>
                  </>
                ) : (
                  <>
                    <span className="ble-prefix">£</span>
                    <input
                      type="number"
                      className="ble-input"
                      value={item.amount || ''}
                      min={0}
                      step={50}
                      placeholder="0"
                      aria-label="Amount"
                      onChange={e => patchSub(item.id, { amount: Number(e.target.value) || 0 })}
                    />
                  </>
                )}
              </div>
              <button
                type="button"
                className="ble-mode"
                onClick={() => patchSub(item.id, { mode: item.mode === 'percent' ? 'fixed' : 'percent' })}
                title={item.mode === 'percent' ? 'Switch to a fixed amount' : 'Switch to a percentage of the price'}
              >
                {item.mode === 'percent' ? 'to £' : 'to %'}
              </button>
              <label className="ble-toggle">
                <input
                  type="checkbox"
                  checked={item.vatApplies}
                  onChange={e => patchSub(item.id, { vatApplies: e.target.checked })}
                />
                VAT
              </label>
              <button
                type="button"
                className="ble-remove"
                aria-label={`Remove ${item.label || 'cost'}`}
                onClick={() => removeSub(item.id)}
              >
                ×
              </button>
            </div>
          ))}
          <div className="ble-add">
            {QUICK_ADD.map(({ kind, label }) => (
              <button key={kind} type="button" className="ble-link" onClick={() => addSub(kind)}>
                + {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Note ──────────────────────────────────────────────────── */}
        <div className="ble-field ble-field--wide">
          <span className="ble-label">Note</span>
          <textarea
            className="ble-textarea"
            value={artwork.note}
            rows={2}
            placeholder="Gallery, availability, what is still to be confirmed…"
            aria-label="Note"
            onChange={e => onChange({ note: e.target.value })}
          />
          {artwork.note.trim().length > 0 && (
            <label className="ble-toggle ble-toggle--block">
              <input
                type="checkbox"
                checked={artwork.noteShownToClient}
                onChange={e => onChange({ noteShownToClient: e.target.checked })}
              />
              Show this note to the client
            </label>
          )}
        </div>
      </div>

      <div className="ble-foot">
        <span>This work in the budget</span>
        <strong>{fmtGbp(artworkLineTotal(artwork, vatMode))}</strong>
      </div>
    </div>
  )
}
