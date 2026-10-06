'use client'

import type { SaveStatus } from './useBudgetState'
import { CURRENCY_META } from './currency'
import type { Currency } from '@/types'

interface Props {
  vatMode: boolean
  onVatToggle: (v: boolean) => void
  saveStatus: SaveStatus
  onExportPdf: () => void
  isConsultant?: boolean
  isPreviewingClientView?: boolean
  onPreviewToggle?: () => void
  /** Pounds and the project's other currency, when it offers one and there is a rate (042). */
  currencies?: Currency[] | null
  currency?: Currency
  onCurrencyToggle?: (c: Currency) => void
}

export default function BudgetHeader({
  vatMode,
  onVatToggle,
  saveStatus,
  onExportPdf,
  isConsultant = false,
  isPreviewingClientView = false,
  onPreviewToggle,
  currencies,
  currency = 'GBP',
  onCurrencyToggle,
}: Props) {
  return (
    // One sticky block, so the client-view band stays in sight with the bar.
    <div className="budget-sticky">
    {isConsultant && isPreviewingClientView && onPreviewToggle && (
      <div className="budget-client-band" role="status">
        <EyeIcon />
        What the client sees
        <button onClick={onPreviewToggle}>Back to editing</button>
      </div>
    )}
    {/* In the client's currency the consultant reads the client's view, and
        edits in pounds, so nothing converted is ever saved as pounds. */}
    {isConsultant && !isPreviewingClientView && currency !== 'GBP' && onCurrencyToggle && (
      <div className="budget-client-band" role="status">
        In {CURRENCY_META[currency].inSentence}, as the client sees it
        <button onClick={() => onCurrencyToggle('GBP')}>Back to pounds to edit</button>
      </div>
    )}
    <div className="budget-header">
      <div className="budget-header-left">
        {saveStatus === 'saving' && (
          <span className="save-status save-status--saving">Saving…</span>
        )}
        {saveStatus === 'saved' && (
          <span className="save-status save-status--saved">Saved ✓</span>
        )}
        {saveStatus === 'error' && (
          <span className="save-status save-status--error">Save failed</span>
        )}
      </div>

      <div className="budget-toggles">
      {currencies && onCurrencyToggle && (
        <div className="budget-vat-toggle" role="group" aria-label="Currency">
          {currencies.map(c => (
            <button
              key={c}
              className={`budget-vat-btn${currency === c ? ' active' : ''}`}
              aria-pressed={currency === c}
              title={CURRENCY_META[c].name}
              onClick={() => onCurrencyToggle(c)}
            >
              {CURRENCY_META[c].symbol.trim()}
            </button>
          ))}
        </div>
      )}
      <div className="budget-vat-toggle">
        <button
          className={`budget-vat-btn${!vatMode ? ' active' : ''}`}
          onClick={() => onVatToggle(false)}
        >
          Ex VAT
        </button>
        <button
          className={`budget-vat-btn${vatMode ? ' active' : ''}`}
          onClick={() => onVatToggle(true)}
        >
          Inc VAT
        </button>
      </div>
      </div>

      <div className="budget-header-right">
        {/* The check before anything goes to a client: the figures, and
            only the notes meant for them. The way back is in the band. */}
        {isConsultant && onPreviewToggle && !isPreviewingClientView && (
          <button className="budget-preview-btn" onClick={onPreviewToggle}>
            <EyeIcon />
            See it as the client
          </button>
        )}
        <button className="budget-export-btn" onClick={onExportPdf}>
          Export PDF
        </button>
      </div>
    </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  )
}
