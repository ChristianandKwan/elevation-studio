'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import Image from 'next/image'
import ClientElevation, { type PanelMoney } from './ClientElevation'
import StatusToast from '@/components/ui/StatusToast'
import BudgetScreen from '@/components/budget/BudgetScreen'
import { DrawLoader } from '@/components/ui/Spinner'
import { preloadImages, clearPreloads } from '@/lib/imagePreload'
import type { BudgetElevationData } from '@/components/budget/budgetCalc'
import { fmtMoney, rateBetween, type FxRate } from '@/components/budget/currency'
import type { Currency, ProjectBudget, DiscountStatus, SubLineItem } from '@/types'
import { optionTitleFor, optionTagClass } from '@/lib/options'
import type { OptionMessage } from '@/lib/messages'
import { createPortalSaves, type PortalSaves } from '@/lib/portalSaves'

interface ClientArtwork {
  id: string
  workId: string
  name: string
  imageUrl: string | null
  wCm: number
  hCm: number
  xF: number
  yF: number
  visible: boolean
  price: number
  priceCurrency?: Currency
  artist: string
  note: string
  noteShownToClient: boolean
  vatApplies: boolean
  discountStatus: DiscountStatus
  discountPercent: number | null
  subLineItems: SubLineItem[]
  brightness?: number | null
  fade?: number | null
}

interface ClientOption {
  id: string
  /** Stored key — identity only (what a pick refers to). Never shown. */
  option: string
  /** Position letter, derived by the loader */
  letter: string
  /** Tab text: the option's name, or its letter */
  label: string
  /** Sentence form: the name, or "Option A" */
  title: string
  name?: string | null
  sort_order?: number | null
  created_at?: string | null
  imageUrl: string | null
  orig_w: number
  orig_h: number
  scale_px_per_cm: number | null
  /** Set instead of imageUrl when this wall was entered as a measurement. */
  wall_w_cm?: number | null
  wall_h_cm?: number | null
  wall_color?: string | null
  approved: boolean
  approved_at: string | null
  foreground_masks?: unknown
  artworks: ClientArtwork[]
  /** What C&K wrote about this option for the client (notes set to Client). */
  ckNotes: string[]
  /** The conversation on this option, oldest first. */
  messages: OptionMessage[]
  consultantNote: string
  consultantNoteShownToClient: boolean
  skew_tl_x?: number | null
  skew_tl_y?: number | null
  skew_tr_x?: number | null
  skew_tr_y?: number | null
  skew_br_x?: number | null
  skew_br_y?: number | null
  skew_bl_x?: number | null
  skew_bl_y?: number | null
  skew_active?: boolean
}

interface ClientElevationData {
  id: string
  name: string
  clientPickedOption: string | null
  elevation_options: ClientOption[]
}

interface Props {
  token: string
  project: {
    id: string
    name: string
    clientName: string
    status: string
    consultantName: string
    consultantInitials: string
    preparedAt: string
  }
  elevations: ClientElevationData[]
  approvalActivity: Array<{ id: string; type: string; text: string; created_at: string }>
  clientBudget: number | null
  budget: ProjectBudget | null
  /** Exchange rates the server read for this budget, or null when it needs none or none could be had (042). */
  rates: FxRate | null
}

export default function ClientPortal({ token, project, elevations, approvalActivity, clientBudget, budget, rates }: Props) {
  const inFlightRef = useRef(new Set<string>())
  // Show/hide and moves, saved once the client pauses — see src/lib/portalSaves.ts.
  const portalSaves = useRef<PortalSaves | null>(null)
  const [toast, setToast] = useState('')
  const [portalView, setPortalView] = useState<'elevations' | 'budget'>('elevations')
  const [showIntroLoader, setShowIntroLoader] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowIntroLoader(false), 2200)
    return () => clearTimeout(t)
  }, [])

  // Track which option the client has picked per elevation (persisted to DB)
  const [pickedOptions, setPickedOptions] = useState<Record<string, string | null>>(() => {
    const s: Record<string, string | null> = {}
    elevations.forEach(e => { s[e.id] = e.clientPickedOption ?? null })
    return s
  })

  // An option is ready to show once it has a wall — a photograph the
  // consultant uploaded, or a wall they entered as a measurement and a
  // colour. These used to test for the photograph alone, which would have
  // hidden every plain-wall option from the client.
  function hasWall(o: ClientOption): boolean {
    return !!o.imageUrl || !!o.wall_color
  }

  // Whether an elevation needs explicit picking (>1 option has a wall)
  function needsPick(elev: ClientElevationData): boolean {
    return elev.elevation_options.filter(hasWall).length > 1
  }

  // The options an elevation offers as tabs. Once the client has picked, only
  // the chosen one — the others come back if the pick is cleared. The tab bar
  // and the background preload both read this, so the portal never downloads
  // an option there is no way to click to.
  function tabOptions(elev: ClientElevationData): ClientOption[] {
    const withWalls = elev.elevation_options.filter(hasWall)
    const picked = pickedOptions[elev.id]
    return withWalls.length > 1 && picked
      ? withWalls.filter(o => o.option === picked)
      : withWalls
  }

  // Resolve the active option for an elevation (respecting pick state)
  function resolveOpt(elev: ClientElevationData): string | null {
    if (pickedOptions[elev.id]) return pickedOptions[elev.id]!
    return elev.elevation_options.find(hasWall)?.option ?? null
  }

  // Initial active tab: prefer picked, then first with image
  const firstTab = (() => {
    for (const elev of elevations) {
      const opt = resolveOpt(elev)
      if (opt) return { elevId: elev.id, opt }
    }
    return null
  })()

  const [activeElevId, setActiveElevId] = useState(firstTab?.elevId ?? elevations[0]?.id ?? '')
  const [activeOpt, setActiveOpt] = useState<string>(firstTab?.opt ?? 'A')

  // Central state: artwork positions/visibility persist across tab switches
  const [optionsState, setOptionsState] = useState<Record<string, Record<string, ClientOption>>>(() => {
    const s: Record<string, Record<string, ClientOption>> = {}
    elevations.forEach(elev => {
      s[elev.id] = {}
      elev.elevation_options.forEach(opt => {
        s[elev.id][opt.option] = { ...opt, artworks: opt.artworks.map(a => ({ ...a })) }
      })
    })
    return s
  })

  const [rerenderKey, setRerenderKey] = useState(0)

  // Every other picture the client can reach, fetched in the background so
  // they can flick between options without waiting: the rest of this
  // elevation first, then the others in order. Only the tabs on offer — a
  // picked elevation contributes its pick alone, because on a phone the whole
  // proposal can run to tens of megabytes of options nobody will open.
  // ClientCanvas holds these back while the option on screen is still
  // arriving. See imagePreload.ts.
  useEffect(() => {
    const optionUrls = (o: ClientOption) => [o.imageUrl, ...o.artworks.map(a => a.imageUrl)]
    const here = elevations.find(e => e.id === activeElevId)
    preloadImages([
      ...(here ? tabOptions(here) : []).filter(o => o.option !== activeOpt).flatMap(optionUrls),
      ...elevations.filter(e => e.id !== activeElevId).flatMap(e => tabOptions(e).flatMap(optionUrls)),
    ])
  }, [activeElevId, activeOpt, pickedOptions]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearPreloads(), [])

  // The screen as it is now, for saves that go out after a pause and would
  // otherwise read a stale snapshot.
  const optionsStateRef = useRef(optionsState)
  useEffect(() => { optionsStateRef.current = optionsState }, [optionsState])

  // Relative zoom (1.0 = fit) persisted to localStorage per option.id.
  // Hydrates lazily after mount so SSR stays stable.
  const activeOptId = optionsState[activeElevId]?.[activeOpt]?.id ?? ''
  const [zoomMap, setZoomMap] = useState<Record<string, number>>({})
  useEffect(() => {
    if (!activeOptId || zoomMap[activeOptId] !== undefined) return
    let stored = 1
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem(`elevZoom:${activeOptId}`) : null
      if (raw) {
        const n = parseFloat(raw)
        if (Number.isFinite(n) && n > 0) stored = Math.max(0.1, Math.min(5.0, n))
      }
    } catch { /* ignore */ }
    setZoomMap(prev => ({ ...prev, [activeOptId]: stored }))
  }, [activeOptId]) // eslint-disable-line react-hooks/exhaustive-deps
  const zoom = zoomMap[activeOptId] ?? 1.0
  function setZoom(val: number | ((prev: number) => number)) {
    setZoomMap(prev => {
      const current = prev[activeOptId] ?? 1.0
      const next = typeof val === 'function' ? val(current) : val
      try {
        if (typeof window !== 'undefined' && activeOptId) {
          window.localStorage.setItem(`elevZoom:${activeOptId}`, String(next))
        }
      } catch { /* ignore */ }
      return { ...prev, [activeOptId]: next }
    })
  }
  /**
   * The client's show/hide clicks and moves are saved once they pause (see
   * src/lib/portalSaves.ts), and anything still waiting is sent when the tab
   * goes away. `pagehide` rather than `beforeunload` because it also fires on
   * mobile Safari's back-forward cache. Requests go out with keepalive so the
   * browser finishes them after the page is gone.
   */
  useEffect(() => {
    const saves = createPortalSaves({
      send: async (action, payload) => { await callAction(action, payload, { keepalive: true }) },
      artworksOn: (elevId, opt) => optionsStateRef.current[elevId]?.[opt]?.artworks ?? [],
      showAgain: (elevId, opt, artId, visible) => {
        setOptionsState(prev => ({
          ...prev,
          [elevId]: {
            ...prev[elevId],
            [opt]: {
              ...prev[elevId][opt],
              artworks: prev[elevId][opt].artworks.map(a => (a.id === artId ? { ...a, visible } : a)),
            },
          },
        }))
        setRerenderKey(k => k + 1)
      },
      tell: onStatus,
    })
    portalSaves.current = saves
    const onHide = () => { void saves.flushAll() }
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      if (portalSaves.current === saves) portalSaves.current = null
      saves.dispose()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  /** How to refer to an option in a message to the client: its name, or "Option A". */
  function titleFor(elevId: string, key: string) {
    return optionTitleFor(elevations.find(e => e.id === elevId)?.elevation_options ?? [], key)
  }

  /**
   * Every portal write goes through the server, which re-verifies the magic
   * link and that the IDs belong to this project. The browser holds no
   * database credentials. Throws on failure so the existing optimistic-update
   * rollbacks fire exactly as they did with the direct Supabase calls.
   */
  async function callAction<T = unknown>(
    action: string,
    payload: Record<string, unknown>,
    opts: { keepalive?: boolean } = {},
  ): Promise<T> {
    const res = await fetch(`/api/client/${encodeURIComponent(token)}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
      // keepalive lets a debounced write still go out when the tab is closing.
      keepalive: opts.keepalive,
    })
    if (!res.ok) throw new Error(`${action} failed: ${res.status}`)
    return res.json() as Promise<T>
  }

  const activeElev = elevations.find(e => e.id === activeElevId)
  const optData = optionsState[activeElevId]?.[activeOpt]

  // Prices beside the walls, in the client's currency where the project has
  // one and there is a rate for it, else pounds; a work quoted in anything
  // else is converted either way (042). The Budget tab has its own switch.
  const panelMoney = useMemo<PanelMoney>(() => {
    const shown: Currency = budget?.clientCurrency && rateBetween('GBP', budget.clientCurrency, rates) != null
      ? budget.clientCurrency : 'GBP'
    return {
      amountOf: a => a.price * (rateBetween(a.priceCurrency ?? 'GBP', shown, rates) ?? 0),
      fmt: n => fmtMoney(n, shown),
      poundFactor: rateBetween('GBP', shown, rates) ?? 1,
    }
  }, [budget?.clientCurrency, rates])

  const budgetElevations: BudgetElevationData[] = elevations.map(elev => ({
    id: elev.id,
    name: elev.name,
    clientPickedOption: pickedOptions[elev.id] ?? elev.clientPickedOption,
    options: elev.elevation_options.map(opt => ({
      key: opt.option,
      label: opt.label,
      title: opt.title,
      name: opt.name?.trim() || null,
      consultantNote: opt.consultantNote ?? '',
      consultantNoteShownToClient: opt.consultantNoteShownToClient ?? true,
      // For the checklist of decisions on the Budget tab: an approval made
      // here shows there at once.
      hasWall: hasWall(opt),
      approved: optionsState[elev.id]?.[opt.option]?.approved ?? opt.approved,
      artworks: opt.artworks.map(a => ({
        id: a.id,
        workId: a.workId,
        name: a.name,
        artist: a.artist ?? '',
        wCm: a.wCm,
        hCm: a.hCm,
        price: a.price,
        priceCurrency: a.priceCurrency ?? 'GBP',
        visible: a.visible,
        note: a.note ?? '',
        noteShownToClient: a.noteShownToClient ?? true,
        vatApplies: a.vatApplies ?? true,
        discountStatus: a.discountStatus ?? 'none',
        discountPercent: a.discountPercent ?? null,
        subLineItems: a.subLineItems ?? [],
      })),
    })),
  }))

  function onArtworkMove(artId: string, xF: number, yF: number) {
    setOptionsState(prev => ({
      ...prev,
      [activeElevId]: {
        ...prev[activeElevId],
        [activeOpt]: {
          ...prev[activeElevId][activeOpt],
          artworks: prev[activeElevId][activeOpt].artworks.map(a =>
            a.id === artId ? { ...a, xF, yF } : a
          ),
        },
      },
    }))
  }

  /**
   * Eye icon. The canvas updates on the click; the write follows once the
   * client stops clicking.
   *
   * Previously each toggle awaited the server behind an in-flight lock, so a
   * second click on the same artwork was swallowed until the first round trip
   * finished — which is what made it feel stuck. Only the final state matters
   * to the server, so a burst of clicks now collapses into one write.
   *
   * What the server had before the burst is kept by portalSaves, so a failed
   * write rolls back to the truth rather than to the previous click, and a
   * burst that ends where it started skips the request entirely.
   */
  function toggleVisibility(artId: string) {
    const art = optionsStateRef.current[activeElevId]?.[activeOpt]?.artworks.find(a => a.id === artId)
    if (!art) return
    const newVis = !art.visible
    const elevId = activeElevId, opt = activeOpt

    setOptionsState(prev => ({
      ...prev,
      [elevId]: {
        ...prev[elevId],
        [opt]: {
          ...prev[elevId][opt],
          artworks: prev[elevId][opt].artworks.map(a =>
            a.id === artId ? { ...a, visible: newVis } : a
          ),
        },
      },
    }))
    setRerenderKey(k => k + 1)

    portalSaves.current?.toggled(elevId, opt, artId, art.visible)
  }

  /**
   * Drag end. Positions used to reach the database only via the flush inside
   * pick/approve, so a client who dragged and left without picking lost the
   * arrangement. Debounced so a flurry of small adjustments is one write.
   */
  function onArtworkMoveEnd() {
    portalSaves.current?.moved(activeElevId, activeOpt)
  }

  /**
   * Send a message on the option on screen. Not optimistic: the message
   * appears once the server has kept it, and until then the text stays in
   * the box — a message that seemed sent and was not is worse than a second
   * of waiting.
   */
  async function sendMessage(body: string): Promise<boolean> {
    if (!optData) return false
    const elevId = activeElevId, opt = activeOpt
    try {
      const { message } = await callAction<{ message: OptionMessage }>('send_message', {
        optionId: optData.id, body,
      })
      setOptionsState(prev => ({
        ...prev,
        [elevId]: {
          ...prev[elevId],
          [opt]: { ...prev[elevId][opt], messages: [...prev[elevId][opt].messages, message] },
        },
      }))
      return true
    } catch {
      onStatus('Your message was not sent. Please try again.')
      return false
    }
  }

  async function handlePick(elevId: string, opt: string) {
    const key = `handlePick:${elevId}`
    if (inFlightRef.current.has(key)) return
    const snapshotPicked = pickedOptions[elevId]
    inFlightRef.current.add(key)
    // Optimistic update
    setPickedOptions(prev => ({ ...prev, [elevId]: opt }))
    setActiveElevId(elevId)
    setActiveOpt(opt)
    try {
      // Save client's artwork positions before locking them in
      await portalSaves.current?.sendPositionsNow(elevId, opt)
      // The server writes the pick and its activity-log entry.
      await callAction('pick_option', { elevationId: elevId, option: opt })
      onStatus(`${titleFor(elevId, opt)} selected`)
    } catch {
      // Revert optimistic update
      setPickedOptions(prev => ({ ...prev, [elevId]: snapshotPicked }))
      onStatus('Failed to save selection. Please try again.')
    } finally {
      inFlightRef.current.delete(key)
    }
  }

  async function handleClearPick(elevId: string) {
    const key = `handleClearPick:${elevId}`
    if (inFlightRef.current.has(key)) return
    const snapshotPicked = pickedOptions[elevId]
    inFlightRef.current.add(key)
    // Optimistic update
    setPickedOptions(prev => ({ ...prev, [elevId]: null }))
    try {
      // The server clears the pick and writes its activity-log entry.
      await callAction('unpick_option', { elevationId: elevId })
      onStatus('Selection cleared')
    } catch {
      // Revert optimistic update
      setPickedOptions(prev => ({ ...prev, [elevId]: snapshotPicked }))
      onStatus('Failed to clear selection. Please try again.')
    } finally {
      inFlightRef.current.delete(key)
    }
  }

  /**
   * Saves a pick on a budget choice through the server, which checks it is
   * one the portal offers and marks the project approved if it was the last
   * decision. The budget shows the pick at once and puts it back on failure.
   */
  async function saveChoicePick(choiceId: string, alternativeId: string | null): Promise<boolean> {
    try {
      const res = await callAction<{ projectApproved?: boolean }>(
        alternativeId ? 'pick_choice' : 'unpick_choice',
        { choiceId, alternativeId },
      )
      onStatus(alternativeId
        ? res.projectApproved ? 'Choice saved. Everything is now approved.' : 'Choice saved'
        : 'Choice cleared')
      return true
    } catch {
      onStatus('Your choice was not saved. Please try again.')
      return false
    }
  }

  async function handleApprove() {
    if (!optData) return
    const key = `handleApprove:${optData.id}`
    if (inFlightRef.current.has(key)) return
    inFlightRef.current.add(key)
    const snapshotOpt = { ...optionsState[activeElevId][activeOpt] }
    try {
      // Save current artwork positions before they lock
      await portalSaves.current?.sendPositionsNow(activeElevId, activeOpt)

      // Primary write: approve the option. The server also writes the
      // activity-log entry and flips the project to 'approved' once every
      // elevation's chosen option is approved.
      const { approvedAt } = await callAction<{ approvedAt: string }>('approve', {
        optionId: optData.id,
      })

      // Primary write succeeded — update local state
      setOptionsState(prev => ({
        ...prev,
        [activeElevId]: {
          ...prev[activeElevId],
          [activeOpt]: { ...prev[activeElevId][activeOpt], approved: true, approved_at: approvedAt },
        },
      }))

      onStatus(`${titleFor(activeElevId, activeOpt)} approved!`)
    } catch {
      // Revert local state to snapshot
      setOptionsState(prev => ({
        ...prev,
        [activeElevId]: {
          ...prev[activeElevId],
          [activeOpt]: snapshotOpt,
        },
      }))
      onStatus('Failed to save approval. Please try again.')
    } finally {
      inFlightRef.current.delete(key)
    }
  }


  return (
    <div className="client-layout">
      {showIntroLoader && <DrawLoader variant="dark" />}
      {/* Header */}
      <div className="client-header">
        <Image
          src="/ck-wordmark-white.png"
          alt="Christian & Kwan"
          className="client-logo"
          width={176}
          height={88}
          preload
        />
        <div className="client-header-brand">Elevation Studio</div>
        <div className="client-project-label">
          <span className="client-project-name">{project.name}</span>
          {/* The consultants share one login (info@), so the profile name read
              "Prepared by info". The studio is single-tenant, so the practice
              name is both accurate and what the client should see. */}
          <span className="client-prepared-by">Prepared by C&amp;K · {project.preparedAt}</span>
        </div>
      </div>

      {/* Top-level view toggle: Elevations / Budget */}
      <div className="client-view-toggle">
        <button
          className={`client-view-tab${portalView === 'elevations' ? ' active' : ''}`}
          onClick={() => setPortalView('elevations')}
        >
          Elevations
        </button>
        <button
          className={`client-view-tab${portalView === 'budget' ? ' active' : ''}`}
          onClick={() => setPortalView('budget')}
        >
          Budget
        </button>
      </div>

      {/* Elevations view — kept mounted so pick state is always in sync */}
      <div
        style={
          portalView === 'elevations'
            ? { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }
            : { display: 'none' }
        }
      >
        {/* Elevation tab bar */}
        <div className="client-tab-bar">
          {elevations.map((elev, i) => {
            const multiOption = elev.elevation_options.filter(hasWall).length > 1
            const picked = pickedOptions[elev.id]

            // Once picked: only show the chosen option's tab
            const visibleOpts = tabOptions(elev)

            return (
              <div key={elev.id} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div className="client-tab-divider" />}
                {visibleOpts.map(opt => {
                  const tagClass = optionTagClass(opt.letter)
                  return multiOption ? (
                    <button
                      key={opt.option}
                      className={`client-tab-btn${activeElevId === elev.id && activeOpt === opt.option ? ' active' : ''}`}
                      onClick={() => { setActiveElevId(elev.id); setActiveOpt(opt.option) }}
                    >
                      {opt.name
                        ? opt.name
                        : <><span className={tagClass} style={{ marginRight: 5 }}>{opt.letter}</span>{elev.name}</>}
                      {picked === opt.option ? ' ✓' : ''}
                    </button>
                  ) : (
                    <button
                      key={opt.option}
                      className={`client-tab-btn${activeElevId === elev.id ? ' active' : ''}`}
                      onClick={() => { setActiveElevId(elev.id); setActiveOpt(opt.option) }}
                    >
                      {elev.name}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Main content */}
        {optData ? (
          <ClientElevation
            optData={optData}
            elevationName={activeElev?.name ?? ''}
            activeOpt={activeOpt}
            optionTitle={optData.title}
            projectId={project.id}
            rerenderKey={rerenderKey}
            approvalActivity={approvalActivity}
            clientBudget={clientBudget}
            money={panelMoney}
            isPicked={!activeElev ? true : !needsPick(activeElev) || pickedOptions[activeElevId] != null}
            artworksLocked={optData.approved || (!!activeElev && needsPick(activeElev) && pickedOptions[activeElevId] != null)}
            onPick={(opt) => handlePick(activeElevId, opt)}
            onClearPick={
              activeElev && needsPick(activeElev) && pickedOptions[activeElevId] != null && !optData?.approved
                ? () => handleClearPick(activeElevId)
                : undefined
            }
            zoom={zoom}
            onZoom={setZoom}
            onArtworkMove={onArtworkMove}
            onArtworkMoveEnd={onArtworkMoveEnd}
            onToggleVisibility={toggleVisibility}
            onSendMessage={sendMessage}
            onApprove={handleApprove}
          />
        ) : (
          <div className="client-empty-state">No elevation uploaded for this option</div>
        )}
      </div>

      {/* Budget view — kept mounted so it updates reactively when picks change */}
      <div className="client-budget-wrap" style={{ display: portalView === 'budget' ? '' : 'none' }}>
        <BudgetScreen
          projectId={project.id}
          projectName={project.name}
          clientName={project.clientName}
          elevations={budgetElevations}
          isConsultant={false}
          isPreviewingClientView={false}
          clientBudget={clientBudget}
          initialBudget={budget}
          onPickChoice={saveChoicePick}
          initialRates={rates}
        />
      </div>

      <StatusToast message={toast} />
    </div>
  )
}
