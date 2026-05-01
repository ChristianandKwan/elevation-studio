'use client'

import { useState } from 'react'
import { fmtGbp, consultantFeeRange, displayFrozenAmount } from './budgetCalc'
import type { BudgetConsultantFee } from '@/types'

interface Props {
  fee: BudgetConsultantFee | null
  artMin: number
  artMax: number
  isConsultant: boolean
  vatMode: boolean
  onChange: (v: BudgetConsultantFee | null) => void
}

export default function ConsultantFeeRow({ fee, artMin, artMax, isConsultant, vatMode, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draftMode, setDraftMode] = useState<'flat' | 'percentage'>('flat')
  const [draftAmount, setDraftAmount] = useState('')

  const vatApplies = fee?.vatApplies ?? true

  function openEdit() {
    setDraftMode(fee?.mode ?? 'flat')
    if (fee?.amount != null) {
      // Flat: show the stored value converted into the current VAT view.
      // Percentage: not VAT-relevant.
      const shown = fee.mode === 'flat'
        ? displayFrozenAmount(fee.amount, fee.amountIncludesVat, vatApplies, vatMode)
        : fee.amount
      setDraftAmount(String(shown))
    } else {
      setDraftAmount('')
    }
    setEditing(true)
  }

  function save() {
    const parsed = parseFloat(draftAmount)
    if (!isNaN(parsed) && parsed >= 0) {
      let storedAmount: number
      let amountIncludesVat: boolean | undefined
      if (draftMode === 'percentage') {
        storedAmount = Math.min(100, parsed)
        amountIncludesVat = undefined
      } else {
        // Freeze the entered value in the current VAT view.
        storedAmount = Math.round(parsed)
        amountIncludesVat = vatMode
      }
      onChange({
        mode: draftMode,
        amount: storedAmount,
        shownToClient: fee?.shownToClient ?? false,
        vatApplies,
        amountIncludesVat,
      })
    }
    setEditing(false)
  }

  function cancel() {
    setEditing(false)
  }

  function toggleShownToClient() {
    if (!fee) return
    onChange({ ...fee, shownToClient: !fee.shownToClient })
  }

  function toggleVatApplies() {
    if (!fee) return
    onChange({ ...fee, vatApplies: !vatApplies })
  }

  function removeFee() {
    onChange(null)
    setEditing(false)
  }

  // Display value — flat uses frozen-entry semantics; percentage applies
  // VAT to the artwork-derived range (artMin/artMax are ex-VAT).
  let valueStr = '—'
  if (fee) {
    if (fee.mode === 'flat') {
      const disp = displayFrozenAmount(fee.amount, fee.amountIncludesVat, vatApplies, vatMode)
      valueStr = fmtGbp(disp)
    } else {
      const range = consultantFeeRange(fee, artMin, artMax)
      const displayVatMult = vatMode && vatApplies ? 1.2 : 1
      const dispMin = Math.round(range.min * displayVatMult)
      const dispMax = Math.round(range.max * displayVatMult)
      const rangeStr = dispMin === dispMax
        ? fmtGbp(dispMin)
        : `${fmtGbp(dispMin)} – ${fmtGbp(dispMax)}`
      valueStr = `${fee.amount}% (${rangeStr})`
    }
  }

  if (!isConsultant) {
    if (!fee || !fee.shownToClient) return null
    return (
      <div className="budget-cost-row">
        <div className="budget-cost-label">Consultant fee</div>
        <span className="budget-cost-value">{valueStr}</span>
      </div>
    )
  }

  return (
    <div className="budget-cost-row budget-cost-row--stacked">
      <div className="budget-cost-row-main">
        <div className="budget-cost-label">Consultant fee</div>

        {editing ? (
          <div className="budget-inline-edit">
            <div className="budget-fee-mode-toggle">
              <button
                className={`budget-fee-mode-btn${draftMode === 'flat' ? ' active' : ''}`}
                onClick={() => setDraftMode('flat')}
              >
                £ Flat
              </button>
              <button
                className={`budget-fee-mode-btn${draftMode === 'percentage' ? ' active' : ''}`}
                onClick={() => setDraftMode('percentage')}
              >
                % of artworks
              </button>
            </div>
            <span className="budget-inline-prefix">{draftMode === 'flat' ? '£' : ''}</span>
            <input
              className="budget-inline-input"
              type="number"
              min="0"
              max={draftMode === 'percentage' ? '100' : undefined}
              step={draftMode === 'percentage' ? '0.5' : '1'}
              value={draftAmount}
              onChange={e => setDraftAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
              autoFocus
              placeholder={draftMode === 'flat' ? '0' : '0'}
            />
            {draftMode === 'percentage' && <span className="budget-inline-prefix">%</span>}
            <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
            <button className="btn btn-sm btn-ghost" onClick={cancel}>Cancel</button>
            {fee && (
              <button className="btn btn-sm btn-danger" onClick={removeFee}>Remove</button>
            )}
          </div>
        ) : (
          <div className="budget-cost-value-group">
            <span className="budget-cost-value">{fee ? valueStr : '—'}</span>
            <button className="budget-cost-edit" onClick={openEdit}>
              {fee ? 'Edit' : 'Add fee'}
            </button>
          </div>
        )}
      </div>

      {fee && !editing && (
        <div className="budget-custom-item-controls">
          <label className="budget-toggle">
            <input
              type="checkbox"
              checked={vatApplies}
              onChange={toggleVatApplies}
            />
            <span>VAT applies</span>
          </label>
          <label className="budget-toggle">
            <input
              type="checkbox"
              checked={fee.shownToClient}
              onChange={toggleShownToClient}
            />
            <span>Shown to client</span>
          </label>
        </div>
      )}
    </div>
  )
}
