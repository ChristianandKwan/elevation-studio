'use client'

import type { SaveStatus } from './useBudgetState'

interface Props {
  vatMode: boolean
  onVatToggle: (v: boolean) => void
  saveStatus: SaveStatus
  onExportPdf: () => void
  isConsultant?: boolean
  isPreviewingClientView?: boolean
  onPreviewToggle?: () => void
}

export default function BudgetHeader({
  vatMode,
  onVatToggle,
  saveStatus,
  onExportPdf,
  isConsultant = false,
  isPreviewingClientView = false,
  onPreviewToggle,
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
