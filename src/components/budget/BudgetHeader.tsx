'use client'

import type { SaveStatus } from './useBudgetState'
import FeedbackButton from '@/components/feedback/FeedbackButton'

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
        {isConsultant && onPreviewToggle && (
          <button
            className={`budget-preview-btn${isPreviewingClientView ? ' active' : ''}`}
            onClick={onPreviewToggle}
          >
            {isPreviewingClientView ? 'Exit preview' : 'Preview as client'}
          </button>
        )}
        {isConsultant && <FeedbackButton variant="dark" />}
        <button className="budget-export-btn" onClick={onExportPdf}>
          Export PDF
        </button>
      </div>
    </div>
  )
}
