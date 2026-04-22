'use client'

import { useState } from 'react'
import {
  fmtGbp, fmtRange,
  computeProjectTotals, installCostDisplay, consultantFeeRange,
  displayFrozenAmount,
} from './budgetCalc'
import type { BudgetElevationData } from './budgetCalc'
import type { BudgetInstallation, BudgetConsultantFee, BudgetCustomLineItem } from '@/types'

interface Props {
  elevations: BudgetElevationData[]
  installation: BudgetInstallation
  consultantFee: BudgetConsultantFee | null
  customLineItems: BudgetCustomLineItem[]
  vatMode: boolean
  isConsultant: boolean
  clientBudget: number | null
  onClientBudgetChange?: (v: number | null) => void
}

export default function TotalsPanel({
  elevations,
  installation,
  consultantFee,
  customLineItems,
  vatMode,
  isConsultant,
  clientBudget,
  onClientBudgetChange,
}: Props) {
  const [settingBudget, setSettingBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')

  // ── Compute project totals ──────────────────────────────────────────────────
  const pt = computeProjectTotals(elevations)
  const { artMin, artMax, framingMin, framingMax, artCountMin, artCountMax, isRange, hasFraming } = pt

  const install = installCostDisplay(installation, artCountMin, artCountMax)
  const installIsRange = install.isIndicative && install.min !== install.max
  const installVatApplies = installation.vatApplies ?? true
  const installShownToClient = installation.shownToClient ?? true
  const showInstallLine = isConsultant || installShownToClient

  const showFee = !!consultantFee && (isConsultant || consultantFee.shownToClient)
  const feeVatApplies = consultantFee?.vatApplies ?? true

  // Artworks and framing are stored ex-VAT; follow the toggle uniformly.
  const baseVatMult = vatMode ? 1.2 : 1
  const dispArtMin = Math.round(artMin * baseVatMult)
  const dispArtMax = Math.round(artMax * baseVatMult)
  const dispFramingMin = Math.round(framingMin * baseVatMult)
  const dispFramingMax = Math.round(framingMax * baseVatMult)

  // Installation: indicative is always VAT-applicable and stored ex-VAT;
  // confirmed uses frozen-entry semantics.
  let dispInstallMin: number
  let dispInstallMax: number
  if (install.isIndicative) {
    const mult = vatMode ? 1.2 : 1
    dispInstallMin = Math.round(install.min * mult)
    dispInstallMax = Math.round(install.max * mult)
  } else {
    dispInstallMin = displayFrozenAmount(
      install.min, installation.amountIncludesVat, installVatApplies, vatMode,
    )
    dispInstallMax = dispInstallMin
  }

  // Custom items: frozen-entry display per item.
  const dispCustomTotal = customLineItems
    .filter(item => isConsultant || item.shownToClient)
    .reduce((sum, item) => sum + displayFrozenAmount(
      item.amount, item.amountIncludesVat, item.vatApplies, vatMode,
    ), 0)

  // Consultant fee: flat uses frozen-entry; percentage follows artwork VAT.
  let dispFeeMin = 0, dispFeeMax = 0
  if (showFee && consultantFee) {
    if (consultantFee.mode === 'flat') {
      const v = displayFrozenAmount(
        consultantFee.amount, consultantFee.amountIncludesVat, feeVatApplies, vatMode,
      )
      dispFeeMin = v; dispFeeMax = v
    } else {
      const fr = consultantFeeRange(consultantFee, artMin, artMax)
      const mult = vatMode && feeVatApplies ? 1.2 : 1
      dispFeeMin = Math.round(fr.min * mult)
      dispFeeMax = Math.round(fr.max * mult)
    }
  }

  const grandIsRange = isRange || installIsRange || (dispFeeMin !== dispFeeMax)

  // Grand totals derived from display line items so the column always adds up
  const totalInstallMin = showInstallLine ? dispInstallMin : 0
  const totalInstallMax = showInstallLine ? dispInstallMax : 0
  const totalMin = dispArtMin + dispFramingMin + totalInstallMin + dispCustomTotal + dispFeeMin
  const totalMax = dispArtMax + dispFramingMax + totalInstallMax + dispCustomTotal + dispFeeMax

  // ── Client budget variance ──────────────────────────────────────────────────
  const budgetDisplay = clientBudget != null && vatMode
    ? Math.round(clientBudget * 1.2)
    : clientBudget

  function saveBudget() {
    const parsed = parseInt(budgetDraft.replace(/[^0-9]/g, ''), 10)
    if (!isNaN(parsed) && parsed > 0 && onClientBudgetChange) {
      onClientBudgetChange(parsed)
    }
    setSettingBudget(false)
  }

  function renderVariance() {
    if (budgetDisplay == null) return null
    if (grandIsRange) {
      const bestDiff = budgetDisplay - totalMin   // positive = under budget
      const worstDiff = budgetDisplay - totalMax
      const bestLabel = bestDiff >= 0
        ? `${fmtGbp(bestDiff)} under budget`
        : `${fmtGbp(-bestDiff)} over budget`
      const worstLabel = worstDiff >= 0
        ? `${fmtGbp(worstDiff)} under budget`
        : `${fmtGbp(-worstDiff)} over budget`
      const bestColor = bestDiff >= 0 ? 'var(--green)' : 'var(--red)'
      const worstColor = worstDiff >= 0 ? 'var(--green)' : 'var(--red)'
      return (
        <>
          <div className="budget-variance-row" style={{ color: bestColor }}>
            Best case: {bestLabel}
          </div>
          <div className="budget-variance-row" style={{ color: worstColor }}>
            Worst case: {worstLabel}
          </div>
        </>
      )
    }
    const diff = budgetDisplay - totalMin
    if (diff === 0) {
      return <div className="budget-variance-row" style={{ color: 'var(--mid)' }}>On budget</div>
    }
    const color = diff > 0 ? 'var(--green)' : 'var(--red)'
    const label = diff > 0 ? `${fmtGbp(diff)} under budget` : `${fmtGbp(-diff)} over budget`
    return <div className="budget-variance-row" style={{ color }}>{label}</div>
  }

  return (
    <div className="budget-totals">
      <div className="budget-section-kicker">Summary</div>

      <div className="budget-totals-rows">
        {/* Artworks */}
        <div className="budget-totals-row">
          <span className="budget-totals-label">Artworks</span>
          <span className="budget-totals-value">
            {fmtRange(dispArtMin, dispArtMax)}
          </span>
        </div>

        {/* Framing — conditional */}
        {hasFraming && (
          <div className="budget-totals-row">
            <span className="budget-totals-label">Framing</span>
            <span className="budget-totals-value">
              {fmtRange(dispFramingMin, dispFramingMax)}
            </span>
          </div>
        )}

        {/* Installation */}
        {showInstallLine && (
          <div className="budget-totals-row">
            <span className="budget-totals-label">
              Installation
              {install.isIndicative && (
                <span className="budget-badge budget-badge--indicative budget-badge--inline">Indicative</span>
              )}
            </span>
            <span className="budget-totals-value">
              {fmtRange(dispInstallMin, dispInstallMax)}
            </span>
          </div>
        )}

        {/* Custom items */}
        {dispCustomTotal > 0 && (
          <div className="budget-totals-row">
            <span className="budget-totals-label">Other</span>
            <span className="budget-totals-value">{fmtGbp(dispCustomTotal)}</span>
          </div>
        )}

        {/* Consultant fee */}
        {showFee && (
          <div className="budget-totals-row">
            <span className="budget-totals-label">Consultant fee</span>
            <span className="budget-totals-value">{fmtRange(dispFeeMin, dispFeeMax)}</span>
          </div>
        )}
      </div>

      {/* Grand total */}
      <div className="budget-grand-total">
        <span className="budget-grand-total-label">
          {vatMode ? 'Total inc. VAT' : 'Total'}
        </span>
        <span className="budget-grand-total-value">
          {grandIsRange ? fmtRange(totalMin, totalMax) : fmtGbp(totalMin)}
        </span>
      </div>

      {/* Client budget */}
      {(clientBudget != null || (isConsultant && !settingBudget)) && (
        <div className="budget-client-budget-section">
          {clientBudget != null ? (
            <>
              <div className="budget-totals-row budget-client-budget-row">
                <span className="budget-totals-label">Client budget</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="budget-totals-value">{fmtGbp(budgetDisplay!)}</span>
                  {isConsultant && onClientBudgetChange && (
                    <button
                      className="budget-cost-edit"
                      onClick={() => {
                        setBudgetDraft(String(clientBudget))
                        setSettingBudget(true)
                      }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
              {renderVariance()}
            </>
          ) : isConsultant && onClientBudgetChange ? (
            <button
              className="budget-add-item"
              onClick={() => { setBudgetDraft(''); setSettingBudget(true) }}
            >
              <span>+</span> Set a client budget
            </button>
          ) : null}
        </div>
      )}

      {/* Inline budget input */}
      {settingBudget && isConsultant && onClientBudgetChange && (
        <div className="budget-inline-edit budget-inline-edit--budget">
          <span className="budget-inline-prefix">£</span>
          <input
            className="budget-inline-input"
            type="number"
            min="0"
            value={budgetDraft}
            onChange={e => setBudgetDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveBudget(); if (e.key === 'Escape') setSettingBudget(false) }}
            autoFocus
            placeholder="Client budget (ex-VAT)"
          />
          <button className="btn btn-sm btn-primary" onClick={saveBudget}>Save</button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSettingBudget(false)}>Cancel</button>
          {clientBudget != null && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => { onClientBudgetChange(null); setSettingBudget(false) }}
            >
              Clear budget
            </button>
          )}
        </div>
      )}
    </div>
  )
}
