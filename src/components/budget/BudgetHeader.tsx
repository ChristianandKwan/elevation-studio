'use client'

import type { SaveStatus } from './useBudgetState'

interface Props {
  vatMode: boolean
  onVatToggle: (v: boolean) => void
  saveStatus: SaveStatus
  onExportPdf: () => void
}

export default function BudgetHeader({ vatMode, onVatToggle, saveStatus, onExportPdf }: Props) {
  return (
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

      <button className="budget-export-btn" onClick={onExportPdf}>
        Export PDF
      </button>
    </div>
  )
}
