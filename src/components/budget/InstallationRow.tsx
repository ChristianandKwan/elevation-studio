'use client'

import { useState } from 'react'
import { fmtGbp, fmtRange, installCostDisplay } from './budgetCalc'
import type { BudgetInstallation } from '@/types'

interface Props {
  installation: BudgetInstallation
  artCountMin: number
  artCountMax: number
  isConsultant: boolean
  onChange: (v: BudgetInstallation) => void
}

export default function InstallationRow({
  installation,
  artCountMin,
  artCountMax,
  isConsultant,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const display = installCostDisplay(installation, artCountMin, artCountMax)

  function openEdit() {
    setDraft(installation.confirmedAmount != null ? String(installation.confirmedAmount) : '')
    setEditing(true)
  }

  function save() {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(parsed) && parsed >= 0) {
      onChange({ indicative: false, confirmedAmount: parsed })
    }
    setEditing(false)
  }

  function cancel() {
    setEditing(false)
  }

  const valueStr = display.isIndicative
    ? fmtRange(display.min, display.max)
    : fmtGbp(display.min)

  return (
    <div className="budget-cost-row">
      <div className="budget-cost-label">
        <span>Installation</span>
        <span className={display.isIndicative ? 'budget-badge budget-badge--indicative' : 'budget-badge budget-badge--confirmed'}>
          {display.isIndicative ? 'Indicative' : 'Confirmed'}
        </span>
      </div>

      {editing ? (
        <div className="budget-inline-edit">
          <span className="budget-inline-prefix">£</span>
          <input
            className="budget-inline-input"
            type="number"
            min="0"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
            autoFocus
            placeholder="0"
          />
          <button className="btn btn-sm btn-primary" onClick={save}>Save</button>
          <button className="btn btn-sm btn-ghost" onClick={cancel}>Cancel</button>
        </div>
      ) : (
        <div className="budget-cost-value-group">
          <span className="budget-cost-value">{valueStr}</span>
          {isConsultant && (
            <button className="budget-cost-edit" onClick={openEdit}>
              {display.isIndicative ? 'Confirm amount' : 'Edit'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
