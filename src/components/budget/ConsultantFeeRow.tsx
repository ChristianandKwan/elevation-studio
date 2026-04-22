'use client'

import { useState } from 'react'
import { fmtGbp, consultantFeeRange } from './budgetCalc'
import type { BudgetConsultantFee } from '@/types'

interface Props {
  fee: BudgetConsultantFee | null
  artMin: number
  artMax: number
  isConsultant: boolean
  onChange: (v: BudgetConsultantFee | null) => void
}

export default function ConsultantFeeRow({ fee, artMin, artMax, isConsultant, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [draftMode, setDraftMode] = useState<'flat' | 'percentage'>('flat')
  const [draftAmount, setDraftAmount] = useState('')

  function openEdit() {
    setDraftMode(fee?.mode ?? 'flat')
    setDraftAmount(fee?.amount != null ? String(fee.amount) : '')
    setEditing(true)
  }

  function save() {
    const parsed = parseFloat(draftAmount)
    if (!isNaN(parsed) && parsed >= 0) {
      const amount = draftMode === 'percentage' ? Math.min(100, parsed) : parsed
      onChange({
        mode: draftMode,
        amount,
        shownToClient: fee?.shownToClient ?? false,
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

  function removeFee() {
    onChange(null)
    setEditing(false)
  }

  // Display value
  let valueStr = '—'
  if (fee) {
    const range = consultantFeeRange(fee, artMin, artMax)
    if (fee.mode === 'flat') {
      valueStr = fmtGbp(range.min)
    } else {
      // Percentage: show both the % and the £ range
      const rangeStr = range.min === range.max
        ? fmtGbp(range.min)
        : `${fmtGbp(range.min)} – ${fmtGbp(range.max)}`
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
        <label className="budget-toggle">
          <input
            type="checkbox"
            checked={fee.shownToClient}
            onChange={toggleShownToClient}
          />
          <span>Shown to client</span>
        </label>
      )}
    </div>
  )
}
