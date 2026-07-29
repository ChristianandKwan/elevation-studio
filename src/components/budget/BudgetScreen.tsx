'use client'

import { useState, useEffect } from 'react'
import BudgetHeader from './BudgetHeader'
import ElevationSection from './ElevationSection'
import InstallationRow from './InstallationRow'
import ConsultantFeeRow from './ConsultantFeeRow'
import CustomLineItems from './CustomLineItems'
import TotalsPanel from './TotalsPanel'
import { useBudgetState } from './useBudgetState'
import { computeProjectTotals } from './budgetCalc'
import type { BudgetElevationData } from './budgetCalc'
import type { ProjectBudget } from '@/types'
import { ArcSpinner } from '@/components/ui/Spinner'

interface Props {
  projectId: string
  projectName: string
  clientName: string
  elevations: BudgetElevationData[]
  isConsultant: boolean
  isPreviewingClientView: boolean
  onPreviewToggle?: () => void
  clientBudget: number | null
  onClientBudgetChange?: (v: number | null) => void
  /**
   * Pre-fetched budget row. Supplied by the client portal, where the browser
   * has no database access — passing it (even as `null`) makes the screen
   * read-only and skips the Supabase load. Omit on the consultant side.
   */
  initialBudget?: ProjectBudget | null
}

const VAT_STORAGE_KEY = (pid: string) => `elevation_budget_vat_mode_${pid}`

/**
 * Whether the Additional Costs section would show the client anything.
 *
 * Mirrors the per-row rules exactly: InstallationRow and TotalsPanel both treat
 * a missing `shownToClient` as true, so installation shows unless explicitly
 * unticked; the consultant fee needs a fee that is flagged; custom items need
 * at least one flagged. Keep these in step with those components.
 */
function hasClientVisibleCosts(budget: ProjectBudget): boolean {
  if (budget.installation?.shownToClient ?? true) return true
  if (budget.consultantFee?.shownToClient) return true
  return budget.customLineItems.some(item => item.shownToClient)
}

export default function BudgetScreen({
  projectId,
  projectName,
  clientName,
  elevations,
  isConsultant,
  isPreviewingClientView,
  onPreviewToggle,
  clientBudget,
  onClientBudgetChange,
  initialBudget,
}: Props) {
  // VAT toggle — persisted per project in localStorage
  const [vatMode, setVatMode] = useState(false)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(VAT_STORAGE_KEY(projectId))
      if (stored === 'incvat') setVatMode(true)
    } catch { /* SSR guard */ }
  }, [projectId])

  function handleVatToggle(v: boolean) {
    setVatMode(v)
    try {
      localStorage.setItem(VAT_STORAGE_KEY(projectId), v ? 'incvat' : 'exvat')
    } catch { /* storage unavailable */ }
  }

  const {
    budget,
    saveStatus,
    isLoading,
    setInstallation,
    setConsultantFee,
    addCustomLineItem,
    updateCustomLineItem,
    removeCustomLineItem,
  } = useBudgetState(projectId, initialBudget)

  // Compute artwork counts for installation tier
  const pt = computeProjectTotals(elevations)

  function handleExportPdf() {
    const prev = document.title
    document.title = `Budget — ${projectName}${clientName ? ` — ${clientName}` : ''}`
    window.print()
    document.title = prev
  }

  const effectiveIsConsultant = isConsultant && !isPreviewingClientView

  return (
    <div className="budget-view">
      <BudgetHeader
        vatMode={vatMode}
        onVatToggle={handleVatToggle}
        saveStatus={saveStatus}
        onExportPdf={handleExportPdf}
        isConsultant={isConsultant}
        isPreviewingClientView={isPreviewingClientView}
        onPreviewToggle={onPreviewToggle}
      />

      <div className="budget-content">
        {/* Project title block */}
        <div className="budget-project-header">
          <h1 className="budget-project-name">{projectName}</h1>
          {clientName && <p className="budget-project-client">{clientName}</p>}
          {isPreviewingClientView && (
            <span className="budget-client-view-badge">Client view</span>
          )}
        </div>

        {isLoading ? (
          <div className="budget-loading" style={{ position: 'relative', minHeight: 160 }}>
            <ArcSpinner />
          </div>
        ) : !budget ? (
          <div className="budget-loading">Unable to load budget data.</div>
        ) : (
          <>
            {/* ── Elevations ──────────────────────────────────────────── */}
            <section className="budget-section">
              <div className="budget-section-kicker">Elevations</div>
              {elevations.length === 0 ? (
                <p className="budget-empty-note">No elevations added to this project yet.</p>
              ) : (
                elevations.map(elev => (
                  <ElevationSection
                    key={elev.id}
                    elevation={elev}
                    vatMode={vatMode}
                  />
                ))
              )}
            </section>

            {/* ── Additional costs ─────────────────────────────────────── */}
            {/* Every row here can be hidden from the client individually, so
                they can all be off at once — leaving a heading above an empty
                panel. The consultant always sees the section: it holds the
                controls for adding to it. */}
            {(effectiveIsConsultant || hasClientVisibleCosts(budget)) && (
            <section className="budget-section">
              <div className="budget-section-kicker">Additional Costs</div>
              <div className="budget-costs-panel">
                <InstallationRow
                  installation={budget.installation}
                  artCountMin={pt.artCountMin}
                  artCountMax={pt.artCountMax}
                  isConsultant={effectiveIsConsultant}
                  vatMode={vatMode}
                  onChange={setInstallation}
                />

                <ConsultantFeeRow
                  fee={budget.consultantFee}
                  artMin={pt.artMin}
                  artMax={pt.artMax}
                  isConsultant={effectiveIsConsultant}
                  vatMode={vatMode}
                  onChange={setConsultantFee}
                />

                <CustomLineItems
                  items={budget.customLineItems}
                  isConsultant={effectiveIsConsultant}
                  vatMode={vatMode}
                  onAdd={addCustomLineItem}
                  onUpdate={updateCustomLineItem}
                  onRemove={removeCustomLineItem}
                />
              </div>
            </section>
            )}

            {/* ── Totals ───────────────────────────────────────────────── */}
            <TotalsPanel
              elevations={elevations}
              installation={budget.installation}
              consultantFee={budget.consultantFee}
              customLineItems={budget.customLineItems}
              vatMode={vatMode}
              isConsultant={effectiveIsConsultant}
              clientBudget={clientBudget}
              onClientBudgetChange={effectiveIsConsultant ? onClientBudgetChange : undefined}
            />
          </>
        )}
      </div>
    </div>
  )
}
