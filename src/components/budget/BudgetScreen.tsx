'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import BudgetHeader from './BudgetHeader'
import ElevationSection from './ElevationSection'
import InstallationRow from './InstallationRow'
import ConsultantFeeRow from './ConsultantFeeRow'
import CustomLineItems from './CustomLineItems'
import TotalsPanel from './TotalsPanel'
import ChoicesSection from './ChoicesSection'
import { useBudgetState, type SavePick } from './useBudgetState'
import { rememberCurrency, rememberVatMode, storedCurrency, storedVatMode } from './vatMode'
import {
  CURRENCIES, CURRENCY_META, budgetIn, elevationsIn, fmtRate, fmtRateDate, quotedCurrencies, rateBetween,
  type FxRate,
} from './currency'
import { MoneyProvider } from './money'
import type { BudgetElevationData, BudgetArtworkPatch } from './budgetCalc'
import {
  alternativesOf, clientChoices, computeBudgetTotals, doubleFramedWorks, pickedAlternative, priceElevations,
} from './choices'
import { budgetOptionAnchor, type BudgetFocus } from './budgetFocus'
import type { Currency, ProjectBudget } from '@/types'
import { InlineSpinner } from '@/components/ui/InlineSpinner'
import { useOnline } from '@/hooks/useOnline'
import { allDecided, decisionsFor } from '@/lib/decisions'
import { loadDecisionState } from '@/lib/decisionsLoad'
import { createClient } from '@/lib/supabase/client'
import { PRACTICE_NAME } from '@/lib/utils'

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
  /**
   * Editing the money. Supplied by the consultant's studio and left out of the
   * client portal, which makes every line read-only there.
   */
  onArtworkChange?: (workId: string, patch: BudgetArtworkPatch) => void
  onOptionNoteChange?: (elevationId: string, optionKey: string, note: string, shownToClient: boolean) => void
  /**
   * Start in this VAT view instead of reading the stored one.
   *
   * Only the export's off-screen copy passes it. See src/components/budget/
   * vatMode.ts for why it exists.
   */
  initialVatMode?: boolean
  /**
   * A line to scroll to and highlight: "Edit on budget" from the Index or the
   * Notes screen. A budget note is written only here, beside its figures.
   */
  focus?: BudgetFocus | null
  /**
   * The client portal's way of saving a pick on a budget choice, through its
   * server route. The studio saves its own picks and leaves this out.
   */
  onPickChoice?: SavePick
  /**
   * Exchange rates read by the portal's server as it built the page (042).
   * Left out in the studio, which asks /api/fx when the budget needs them.
   */
  initialRates?: FxRate | null
  /** Start in this currency instead of the stored one: the export's copy only, as with VAT. */
  initialCurrency?: Currency
}

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
  onArtworkChange,
  onOptionNoteChange,
  initialVatMode,
  focus,
  onPickChoice,
  initialRates,
  initialCurrency,
}: Props) {
  // VAT toggle — persisted per project in localStorage.
  //
  // The stored value is read in an effect rather than as the initial state so
  // the server and the first client render agree. `initialVatMode` is the way
  // past that for the export, which mounts this screen off-screen purely to
  // photograph it: there is no server render to match, and waiting a frame
  // for the effect would mean photographing the ex-VAT view of a budget the
  // consultant is reading in inc-VAT.
  const [vatMode, setVatMode] = useState(initialVatMode ?? false)
  useEffect(() => {
    if (initialVatMode !== undefined) return
    setVatMode(storedVatMode(projectId))
  }, [projectId, initialVatMode])

  function handleVatToggle(v: boolean) {
    setVatMode(v)
    rememberVatMode(projectId, v)
  }

  const {
    budget,
    saveStatus,
    isLoading,
    loadFailed,
    retry,
    setInstallation,
    setConsultantFee,
    addCustomLineItem,
    updateCustomLineItem,
    removeCustomLineItem,
    addChoice,
    updateChoice,
    removeChoice,
    pickChoice,
    setClientCurrency,
  } = useBudgetState(projectId, initialBudget, onPickChoice)

  // ── Currency (042) ─────────────────────────────────────────────────────────
  // Pounds always; one other currency where the project offers it. Works can
  // be quoted in any currency, so pounds can need rates too.
  const secondCurrency = budget?.clientCurrency ?? null
  const [currencyChoice, setCurrencyChoice] = useState<Currency>(initialCurrency ?? 'GBP')
  // Read once the budget says which currency it offers. The client opens it in
  // their own currency, the consultant in pounds, unless either chose already.
  // In an effect, like the VAT view, because storage is only there after mount.
  const budgetLoaded = !!budget
  useEffect(() => {
    if (initialCurrency !== undefined || !budgetLoaded) return
    const stored = storedCurrency(projectId)
    const next: Currency = stored === 'GBP' || (secondCurrency && stored === secondCurrency)
      ? stored as Currency
      : isConsultant ? 'GBP' : secondCurrency ?? 'GBP'
    setCurrencyChoice(next) // eslint-disable-line react-hooks/set-state-in-effect
  }, [projectId, initialCurrency, budgetLoaded, secondCurrency, isConsultant])

  function handleCurrencyToggle(c: Currency) {
    setCurrencyChoice(c)
    rememberCurrency(projectId, c)
  }

  const ratesNeeded = !!secondCurrency || quotedCurrencies(elevations, 'GBP').length > 0
  const [fetchedRates, setFetchedRates] = useState<FxRate | null>(null)
  const [ratesFailed, setRatesFailed] = useState(false)
  const rates = initialRates !== undefined ? initialRates : fetchedRates
  useEffect(() => {
    if (initialRates !== undefined || !ratesNeeded || fetchedRates) return
    let cancelled = false
    fetch('/api/fx')
      .then(r => (r.ok ? r.json() as Promise<FxRate> : null))
      .then(r => { if (!cancelled) { if (r) setFetchedRates(r); else setRatesFailed(true) } })
      .catch(() => { if (!cancelled) setRatesFailed(true) })
    return () => { cancelled = true }
  }, [initialRates, ratesNeeded, fetchedRates])
  // Held back until the rates arrive, so nobody (the export's camera
  // included) sees a budget drawn without them.
  const ratesPending = ratesNeeded && !rates && initialRates === undefined && !ratesFailed

  // The currency on screen: the other one only when there is a rate for it.
  const view: Currency = secondCurrency && currencyChoice === secondCurrency
    && rateBetween('GBP', secondCurrency, rates) != null ? secondCurrency : 'GBP'
  const factor = rateBetween('GBP', view, rates) ?? 1
  // Every amount moved into that currency before any arithmetic (currency.ts).
  const viewElevations = useMemo(() => elevationsIn(elevations, view, rates), [elevations, view, rates])
  const viewBudget = useMemo(() => (budget ? budgetIn(budget, view, rates) : null), [budget, view, rates])
  // Works quoted in a currency there is no rate for count as nothing until there is.
  const unconverted = quotedCurrencies(elevations, view).filter(c => rateBetween(c, view, rates) == null)

  // Totals are always what the client would see: hidden elevations are listed
  // for the consultant below but never counted, so the consultant's figure and
  // the client's figure are the same number. Hidden choices likewise.
  const clientElevations = viewElevations.filter(e => !e.hiddenFromClient)
  const choices = viewBudget?.choices ?? []
  const picks = budget?.choicePicks ?? {}
  const countedChoices = clientChoices(choices, clientElevations, picks)

  // Totals with the choices counted; also the artwork counts for the installation tier.
  const pt = computeBudgetTotals(clientElevations, choices, picks, vatMode)

  // What the client still has to decide. Once everything is, the project is
  // approved and a pick stands, as a wall's approved option does.
  const decisions = decisionsFor(clientElevations, choices, picks)
  const locked = allDecided(clientElevations, choices, picks)
  const openDecisions = decisions.filter(d => !d.done)
  const lastDecisionId = openDecisions.length === 1 && openDecisions[0].kind === 'choice' ? openDecisions[0].id : null

  function handleExportPdf() {
    const prev = document.title
    document.title = `Budget — ${projectName}${clientName ? ` — ${clientName}` : ''}`
    window.print()
    document.title = prev
  }

  // Lands on the line once the budget has loaded and the line is drawn. A work
  // is looked for inside its option, since the same work can hang on several.
  // Looked for inside this screen only: while an export runs, an off-screen
  // copy of the budget is being photographed, and it comes first in the page.
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focus || isLoading || !root.current) return
    const block = root.current.querySelector<HTMLElement>(
      `[data-budget-option="${CSS.escape(budgetOptionAnchor(focus.elevationId, focus.optionKey))}"]`,
    )
    if (!block) return
    const target = focus.workId
      ? block.querySelector<HTMLElement>(`[data-budget-work="${CSS.escape(focus.workId)}"]`) ?? block
      : block.querySelector<HTMLElement>('.budget-note-row--option') ?? block
    target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target.classList.remove('budget-focus')
    void target.offsetWidth // restart the highlight on a second jump to the same line
    target.classList.add('budget-focus')
    const done = window.setTimeout(() => target.classList.remove('budget-focus'), 2600)
    return () => window.clearTimeout(done)
  }, [focus, isLoading])

  const online = useOnline()

  // In the client's currency the consultant sees what the client sees, and
  // edits in pounds: a converted figure must never be saved back as pounds.
  const effectiveIsConsultant = isConsultant && !isPreviewingClientView && view === 'GBP'
  // "Client view" preview drops hidden elevations entirely, as the portal does.
  // Each work carries what the choices cost it: picked, or a range until then.
  const listedElevations = priceElevations(
    effectiveIsConsultant ? viewElevations : clientElevations, countedChoices, picks,
  )
  // Edits are offered only where the budget can be edited: never in the
  // portal, the client preview, or the export's off-screen copy.
  const editable = effectiveIsConsultant && !!onArtworkChange

  /**
   * A pick on a budget choice. The client's goes through the portal's route,
   * which also marks the project approved when it was the last decision. A
   * consultant's, made on the client's behalf, is saved here and does the
   * same, from what the database holds rather than what this page last saw.
   */
  async function handlePick(choiceId: string, alternativeId: string | null) {
    const ok = await pickChoice(choiceId, alternativeId)
    if (!ok || !isConsultant) return
    const supabase = createClient()
    const choice = choices.find(c => c.id === choiceId)
    const placed = choice && alternativeId
      ? alternativesOf(choice).find(p => p.alt.id === alternativeId)
      : null
    const name = choice?.name.trim() || 'a budget choice'
    const before = choice ? pickedAlternative(choice, picks) : null
    if (placed || before) {
      const what = placed ? [placed.alt.name, placed.group.label].filter(x => x.trim()).join(', ') : ''
      await supabase.from('activity_logs').insert({
        project_id: projectId,
        type: placed ? 'pick' : 'pick_cleared',
        text: placed
          ? `${PRACTICE_NAME} chose ${what || 'an alternative'} for ${name} on the client's behalf`
          : `${PRACTICE_NAME} cleared the choice of ${name}`,
      })
    }
    if (!placed) return
    const state = await loadDecisionState(supabase, projectId)
    if (state && allDecided(state.elevations, state.choices, state.picks)) {
      await supabase.from('projects').update({ status: 'approved' }).eq('id', projectId)
    }
  }

  /** Takes a work's own framing line off, where a framing choice now prices it. */
  function removeFramingLines(workIds: string[]) {
    if (!onArtworkChange) return
    for (const workId of workIds) {
      const a = elevations.flatMap(e => e.options.flatMap(o => o.artworks)).find(x => x.workId === workId)
      if (!a) continue
      onArtworkChange(workId, { subLineItems: a.subLineItems.filter(i => i.kind !== 'framing') })
    }
  }

  // The client's checklist appears once there is a choice to make; until
  // then the walls speak for themselves, as they always have.
  const showDecisions = !effectiveIsConsultant && countedChoices.length > 0

  // The other currency can be switched to only once there is a rate for it.
  const currencies: Currency[] | null = secondCurrency && rateBetween('GBP', secondCurrency, rates) != null
    ? ['GBP', secondCurrency]
    : null

  return (
    <MoneyProvider currency={view} factor={factor}>
    <div className="budget-view" ref={root}>
      <BudgetHeader
        vatMode={vatMode}
        onVatToggle={handleVatToggle}
        saveStatus={saveStatus}
        onExportPdf={handleExportPdf}
        isConsultant={isConsultant}
        isPreviewingClientView={isPreviewingClientView}
        onPreviewToggle={onPreviewToggle}
        currencies={currencies}
        currency={view}
        onCurrencyToggle={handleCurrencyToggle}
      />

      <div className="budget-content">
        {/* Project title block */}
        <div className="budget-project-header">
          <h1 className="budget-project-name">{projectName}</h1>
          {clientName && <p className="budget-project-client">{clientName}</p>}
        </div>

        {showDecisions && !isLoading && (
          <div className={`budget-decisions${locked ? ' budget-decisions--done' : ''}`}>
            <span className="budget-decisions-title">Your decisions</span>
            {decisions.map(d => (
              <span key={`${d.kind}:${d.id}`} className={`budget-decision${d.done ? ' budget-decision--done' : ''}`}>
                <i aria-hidden="true" />
                {d.name}
                {!d.done && <span className="budget-decision-todo">to {d.todo}</span>}
              </span>
            ))}
            {locked && <span className="budget-decisions-all">All approved</span>}
          </div>
        )}

        {isLoading || ratesPending ? (
          <div className="budget-loading" style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InlineSpinner size={32} />
          </div>
        ) : !budget || !viewBudget ? (
          // Keeps `.budget-loading`: the export waits for it to go, and must
          // leave the budget picture out rather than photograph this.
          <div className="budget-loading budget-load-failed" role="alert">
            {loadFailed ? (
              <>
                <p className="budget-load-failed-title">
                  {online ? 'The budget didn\u2019t load' : 'You seem to be offline'}
                </p>
                <p className="budget-load-failed-body">
                  {online
                    ? 'Nothing has been lost. This is usually a brief interruption, and trying again generally works.'
                    : 'This device appears to have lost its internet connection. Nothing has been lost, and the budget will load by itself when you are back online.'}
                </p>
                <button type="button" className="btn btn-primary btn-sm" onClick={retry}>
                  Try again
                </button>
              </>
            ) : (
              <p className="budget-load-failed-body">Unable to load budget data.</p>
            )}
          </div>
        ) : (
          <>
            {/* ── Elevations ──────────────────────────────────────────── */}
            <section className="budget-section">
              <div className="budget-section-kicker">Elevations</div>
              {listedElevations.length === 0 ? (
                <p className="budget-empty-note">No elevations added to this project yet.</p>
              ) : (
                listedElevations.map(elev => (
                  <ElevationSection
                    key={elev.id}
                    elevation={elev}
                    vatMode={vatMode}
                    isConsultant={effectiveIsConsultant}
                    onArtworkChange={effectiveIsConsultant ? onArtworkChange : undefined}
                    onNoteChange={effectiveIsConsultant ? onOptionNoteChange : undefined}
                  />
                ))
              )}
            </section>

            {/* ── Choices ──────────────────────────────────────────────── */}
            <ChoicesSection
              choices={choices}
              picks={picks}
              clientElevations={clientElevations}
              allElevations={elevations}
              vatMode={vatMode}
              isConsultant={effectiveIsConsultant}
              locked={locked}
              lastDecisionId={lastDecisionId}
              doubleFramed={editable ? doubleFramedWorks(clientElevations, choices, picks) : []}
              onPick={isPreviewingClientView || (!editable && isConsultant) ? undefined : handlePick}
              onAdd={editable ? addChoice : undefined}
              onUpdate={editable ? updateChoice : undefined}
              onRemove={editable ? removeChoice : undefined}
              onRemoveFramingLines={editable ? removeFramingLines : undefined}
            />

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
                  installation={viewBudget.installation}
                  artCountMin={pt.min.artCount}
                  artCountMax={pt.max.artCount}
                  isConsultant={effectiveIsConsultant}
                  vatMode={vatMode}
                  onChange={setInstallation}
                />

                <ConsultantFeeRow
                  fee={viewBudget.consultantFee}
                  artMin={pt.min.artVatable + pt.min.artExempt}
                  artMax={pt.max.artVatable + pt.max.artExempt}
                  isConsultant={effectiveIsConsultant}
                  vatMode={vatMode}
                  onChange={setConsultantFee}
                />

                <CustomLineItems
                  items={viewBudget.customLineItems}
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
              totals={pt}
              installation={viewBudget.installation}
              consultantFee={viewBudget.consultantFee}
              customLineItems={viewBudget.customLineItems}
              vatMode={vatMode}
              isConsultant={effectiveIsConsultant}
              clientBudget={clientBudget}
              onClientBudgetChange={effectiveIsConsultant ? onClientBudgetChange : undefined}
            />

            <RateNote rates={rates} view={view} quoted={quotedCurrencies(elevations, view)} unconverted={unconverted} />

            {editable && (
              <div className="budget-currency-setting">
                <label>
                  <span>Also show this budget in</span>
                  <select
                    value={secondCurrency ?? ''}
                    onChange={e => setClientCurrency((e.target.value || null) as Currency | null)}
                  >
                    <option value="">Pounds only</option>
                    {CURRENCIES.filter(c => c !== 'GBP').map(c => (
                      <option key={c} value={c}>{CURRENCY_META[c].name}</option>
                    ))}
                  </select>
                </label>
                <p>
                  {secondCurrency
                    ? `The client gets a switch between pounds and ${CURRENCY_META[secondCurrency].inSentence}, and opens the budget in ${CURRENCY_META[secondCurrency].inSentence}. Figures in it are converted at the day’s rate and marked as indicative.`
                    : 'For a client who pays in another currency. A work’s own price can be in any currency without this: set it in the work’s price box.'}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </MoneyProvider>
  )
}

/**
 * Where any converted figure's rate comes from, under the totals. Converted
 * figures are indicative: the client pays at their bank's rate on the day.
 */
function RateNote({ rates, view, quoted, unconverted }: {
  rates: FxRate | null
  view: Currency
  /** Currencies works are quoted in other than the one on screen. */
  quoted: Currency[]
  unconverted: Currency[]
}) {
  const name = (c: Currency) => CURRENCY_META[c].inSentence
  const when = rates ? `${rates.source}, ${fmtRateDate(rates.date)}` : ''
  const lines: string[] = []
  if (view !== 'GBP' && rates) {
    lines.push(`Figures in ${name(view)} are indicative, converted at ${fmtRate(rates, view)} (${when}). The amount payable is set at the rate on the day of payment.`)
  }
  const others = quoted.filter(c => !unconverted.includes(c) && (view === 'GBP' || c !== 'GBP'))
  if (others.length && rates) {
    const at = others.map(c => fmtRate(rates, c)).join(', ')
    lines.push(`Works priced in ${others.map(name).join(' and ')} are shown in ${name(view)} at ${at} (${when}), so those figures are indicative${lines.length ? ' too' : ''}.`)
  }
  if (lines.length === 0 && unconverted.length === 0) return null
  return (
    <div className="budget-rate-note">
      {lines.map(l => <p key={l}>{l}</p>)}
      {unconverted.length > 0 && (
        <p className="budget-rate-note--missing">
          The exchange rate could not be fetched, so works priced in {unconverted.map(name).join(' and ')} are left out of these figures for now.
        </p>
      )}
    </div>
  )
}
