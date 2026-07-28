'use client'

import { useState } from 'react'
import { fmtGbp, fmtRange, installCostDisplay, displayFrozenAmount } from './budgetCalc'
import type { BudgetInstallation } from '@/types'

interface Props {
  installation: BudgetInstallation
  artCountMin: number
  artCountMax: number
  isConsultant: boolean
  vatMode: boolean
  onChange: (v: BudgetInstallation) => void
}

export default function InstallationRow({
  installation,
  artCountMin,
  artCountMax,
  isConsultant,
  vatMode,
  onChange,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const vatApplies = installation.vatApplies ?? true
  const shownToClient = installation.shownToClient ?? true
  const displayRaw = installCostDisplay(installation, artCountMin, artCountMax)

  // Indicative is always treated as VAT-applicable; its raw range is ex-VAT so
  // in inc-VAT view we multiply by 1.2 regardless of any stored vatApplies flag.
  // Confirmed: freeze the entered value in its entry-mode, convert only when the
  // current view differs.
  let displayMin: number
  let displayMax: number
  if (displayRaw.isIndicative) {
    const mult = vatMode ? 1.2 : 1
    displayMin = Math.round(displayRaw.min * mult)
    displayMax = Math.round(displayRaw.max * mult)
  } else {
    displayMin = displayFrozenAmount(
      displayRaw.min, installation.amountIncludesVat, vatApplies, vatMode,
    )
    displayMax = displayMin
  }

  function openEdit() {
    const storedAmt = installation.confirmedAmount ?? null
    const shown = storedAmt != null
      ? displayFrozenAmount(storedAmt, installation.amountIncludesVat, vatApplies, vatMode)
      : null
    setDraft(shown != null ? String(shown) : '')
    setEditing(true)
  }

  function save() {
    const parsed = parseInt(draft.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(parsed) && parsed >= 0) {
      onChange({
        indicative: false,
        confirmedAmount: parsed,
        vatApplies,
        amountIncludesVat: vatMode,
        shownToClient,
      })
    }
    setEditing(false)
  }

  function cancel() {
    setEditing(false)
  }

  function toggleVatApplies() {
    onChange({ ...installation, vatApplies: !vatApplies })
  }

  function toggleShownToClient() {
    onChange({ ...installation, shownToClient: !shownToClient })
  }

  const valueStr = displayRaw.isIndicative
    ? fmtRange(displayMin, displayMax)
    : fmtGbp(displayMin)

  const showControls = isConsultant && !displayRaw.isIndicative && !editing

  // Unticking "Shown to client" has to remove the row itself, not just its
  // controls. TotalsPanel already excluded installation from the client's
  // summary when this is off, so without this the client saw a line that
  // wasn't in the total. Mirrors ConsultantFeeRow's early return.
  // `shownToClient` defaults to true, so rows saved before this flag existed
  // keep showing.
  if (!isConsultant && !shownToClient) return null

  return (
    <div className={`budget-cost-row${showControls ? ' budget-cost-row--stacked' : ''}`}>
      <div className={showControls ? 'budget-cost-row-main' : ''} style={showControls ? undefined : { display: 'contents' }}>
        <div className="budget-cost-label">
          <span>Installation</span>
          <span className={displayRaw.isIndicative ? 'budget-badge budget-badge--indicative' : 'budget-badge budget-badge--confirmed'}>
            {displayRaw.isIndicative ? 'Indicative' : 'Confirmed'}
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
                {displayRaw.isIndicative ? 'Confirm amount' : 'Edit'}
              </button>
            )}
          </div>
        )}
      </div>

      {showControls && (
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
              checked={shownToClient}
              onChange={toggleShownToClient}
            />
            <span>Shown to client</span>
          </label>
        </div>
      )}
    </div>
  )
}
