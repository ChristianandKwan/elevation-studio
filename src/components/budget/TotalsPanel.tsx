'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  fmtGbp,
  computeProjectTotals, installCostDisplay, consultantFeeRange,
  displayFrozenAmount, applyVat,
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
  const pt = computeProjectTotals(elevations, vatMode)
  const { min, max, isRange, hasFraming, hasOther } = pt

  // Artwork spend drives the percentage fee and nothing else. Framing, duty
  // and shipping are excluded, as framing always was.
  const artMin = min.artVatable + min.artExempt
  const artMax = max.artVatable + max.artExempt

  const artCountMin = min.artCount
  const artCountMax = max.artCount

  const install = installCostDisplay(installation, artCountMin, artCountMax)
  const installIsRange = install.isIndicative && install.min !== install.max
  const installVatApplies = installation.vatApplies ?? true
  const installShownToClient = installation.shownToClient ?? true
  const showInstallLine = isConsultant || installShownToClient

  const showFee = !!consultantFee && (isConsultant || consultantFee.shownToClient)
  const feeVatApplies = consultantFee?.vatApplies ?? true

  // Artworks and the costs hanging off them are stored ex-VAT, but each line
  // carries its own VAT treatment now: a work bought outside the UK is not
  // multiplied by 1.2 just because the toggle is on.
  const dispArtVatMin = applyVat(min.artVatable, true, vatMode)
  const dispArtVatMax = applyVat(max.artVatable, true, vatMode)
  const dispArtExMin = min.artExempt
  const dispArtExMax = max.artExempt

  const dispFramingMin = applyVat(min.framingVatable, true, vatMode) + min.framingExempt
  const dispFramingMax = applyVat(max.framingVatable, true, vatMode) + max.framingExempt

  const dispOtherMin = applyVat(min.otherVatable, true, vatMode) + min.otherExempt
  const dispOtherMax = applyVat(max.otherVatable, true, vatMode) + max.otherExempt

  // How the artwork rows are laid out depends on what is actually in them.
  const anyExempt = max.artExempt > 0
  const anyVatable = max.artVatable > 0
  const splitArtRows = anyExempt && anyVatable

  const dispArtAllMin = dispArtVatMin + dispArtExMin
  const dispArtAllMax = dispArtVatMax + dispArtExMax

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
  const totalMin = dispArtAllMin + dispFramingMin + dispOtherMin
    + totalInstallMin + dispCustomTotal + dispFeeMin
  const totalMax = dispArtAllMax + dispFramingMax + dispOtherMax
    + totalInstallMax + dispCustomTotal + dispFeeMax

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

  // Two figures per line means two scenarios, not a range. See the comment on
  // the header row below.
  const twoColumn = grandIsRange

  function summaryRow(label: ReactNode, min: number, max: number) {
    return (
      <div className={`budget-totals-row${twoColumn ? ' budget-totals-row--split' : ''}`}>
        <span className="budget-totals-label">{label}</span>
        <span className="budget-totals-value">{fmtGbp(min)}</span>
        {twoColumn && <span className="budget-totals-value">{fmtGbp(max)}</span>}
      </div>
    )
  }

  return (
    <div className="budget-totals">
      <div className="budget-section-kicker">Summary</div>

      {/* When the project is still a range, each figure below belongs to one
          of two whole options the client could pick, not to a span. Printing
          them as "min – max" read backwards wherever the cheaper option
          carried the larger cost, which framing often does. Two labelled
          columns say what they are, and each column adds up on its own. */}
      {twoColumn && (
        <div className="budget-totals-row budget-totals-row--split budget-totals-row--heads">
          <span className="budget-totals-label" />
          <span className="budget-totals-head">Best case</span>
          <span className="budget-totals-head">Worst case</span>
        </div>
      )}

      <div className="budget-totals-rows">
        {/* Artworks — split only when the project really has both kinds */}
        {splitArtRows ? (
          <>
            {summaryRow('Artworks', dispArtVatMin, dispArtVatMax)}
            {summaryRow(
              <>
                Artworks
                <span className="budget-badge budget-badge--novat budget-badge--inline">No VAT</span>
              </>,
              dispArtExMin, dispArtExMax,
            )}
          </>
        ) : (
          summaryRow(
            <>
              Artworks
              {anyExempt && !anyVatable && (
                <span className="budget-badge budget-badge--novat budget-badge--inline">No VAT</span>
              )}
            </>,
            dispArtAllMin, dispArtAllMax,
          )
        )}

        {hasFraming && summaryRow('Framing', dispFramingMin, dispFramingMax)}

        {/* Duty, shipping and anything else hanging off an artwork */}
        {hasOther && summaryRow('Other artwork costs', dispOtherMin, dispOtherMax)}

        {showInstallLine && summaryRow(
          <>
            Installation
            {install.isIndicative && (
              <span className="budget-badge budget-badge--indicative budget-badge--inline">Indicative</span>
            )}
          </>,
          dispInstallMin, dispInstallMax,
        )}

        {dispCustomTotal > 0 && summaryRow('Other', dispCustomTotal, dispCustomTotal)}

        {showFee && summaryRow('Consultant fee', dispFeeMin, dispFeeMax)}
      </div>

      {/* Grand total */}
      <div className={`budget-grand-total${twoColumn ? ' budget-grand-total--split' : ''}`}>
        <span className="budget-grand-total-label">
          {vatMode ? 'Total inc. VAT' : 'Total'}
        </span>
        {twoColumn ? (
          <>
            <span className="budget-grand-total-value">{fmtGbp(totalMin)}</span>
            <span className="budget-grand-total-value">{fmtGbp(totalMax)}</span>
          </>
        ) : (
          <span className="budget-grand-total-value">{fmtGbp(totalMin)}</span>
        )}
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
