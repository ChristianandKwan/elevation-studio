'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import ClientElevation from './ClientElevation'
import StatusToast from '@/components/ui/StatusToast'
import BudgetScreen from '@/components/budget/BudgetScreen'
import { DrawLoader } from '@/components/ui/Spinner'
import type { BudgetElevationData } from '@/components/budget/budgetCalc'
import type { ProjectBudget } from '@/types'

interface ClientArtwork {
  id: string
  name: string
  imageUrl: string | null
  wCm: number
  hCm: number
  xF: number
  yF: number
  visible: boolean
  price: number
  artist: string
  framingStatus: string
  framingCost: number | null
  brightness?: number | null
  fade?: number | null
}

interface ClientOption {
  id: string
  option: string
  imageUrl: string | null
  orig_w: number
  orig_h: number
  scale_px_per_cm: number | null
  approved: boolean
  approved_at: string | null
  foreground_masks?: unknown
  artworks: ClientArtwork[]
  clientNotes: string
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
}

/** How long after the last eye-icon click before the visibility write goes out. */
const VISIBILITY_SAVE_DELAY_MS = 500
/** How long after the last drag ends before positions are written. */
const POSITION_SAVE_DELAY_MS = 600

export default function ClientPortal({ token, project, elevations, approvalActivity, clientBudget, budget }: Props) {
  const inFlightRef = useRef(new Set<string>())
  // Debounced writers — see toggleVisibility / onArtworkMoveEnd.
  const visibilityTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const serverVisibility = useRef(new Map<string, boolean>())
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // Whether an elevation needs explicit picking (>1 option has an image)
  function needsPick(elev: ClientElevationData): boolean {
    return elev.elevation_options.filter(o => o.imageUrl).length > 1
  }

  // Resolve the active option for an elevation (respecting pick state)
  function resolveOpt(elev: ClientElevationData): string | null {
    if (pickedOptions[elev.id]) return pickedOptions[elev.id]!
    return elev.elevation_options.find(o => o.imageUrl)?.option ?? null
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

  // Mirrors for the debounced writers below, which fire from timers and would
  // otherwise close over a stale snapshot.
  const optionsStateRef = useRef(optionsState)
  useEffect(() => { optionsStateRef.current = optionsState }, [optionsState])
  const activeElevIdRef = useRef(activeElevId)
  useEffect(() => { activeElevIdRef.current = activeElevId }, [activeElevId])
  const activeOptRef = useRef(activeOpt)
  useEffect(() => { activeOptRef.current = activeOpt }, [activeOpt])

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
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear debounce timer on unmount to prevent state updates on an unmounted component
  useEffect(() => {
    return () => { if (notesTimer.current) clearTimeout(notesTimer.current) }
  }, [])

  /**
   * Send anything still sitting in a debounce when the tab goes away. `pagehide`
   * rather than `beforeunload` because it also fires on mobile Safari's
   * back-forward cache. Requests go out with keepalive so the browser finishes
   * them after the page is gone.
   */
  useEffect(() => {
    function flushPending() {
      if (positionTimer.current) {
        clearTimeout(positionTimer.current)
        positionTimer.current = null
        const arts = optionsStateRef.current[activeElevIdRef.current]?.[activeOptRef.current]?.artworks ?? []
        flushPositions(arts, true).catch(() => { /* page is going away */ })
      }
      visibilityTimers.current.forEach((timer, artId) => {
        clearTimeout(timer)
        const baseline = serverVisibility.current.get(artId)
        const art = Object.values(optionsStateRef.current)
          .flatMap(byOpt => Object.values(byOpt))
          .flatMap(o => o.artworks)
          .find(a => a.id === artId)
        if (!art || baseline === art.visible) return
        callAction('toggle_visibility', { artworkId: artId, visible: art.visible }, { keepalive: true })
          .catch(() => { /* page is going away */ })
      })
      visibilityTimers.current.clear()
      serverVisibility.current.clear()
    }
    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      flushPending()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
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

  /** Flush dragged positions — batched into one call. */
  async function flushPositions(artworks: ClientArtwork[], keepalive = false) {
    // An explicit flush supersedes anything the drag debounce still has queued.
    if (positionTimer.current) {
      clearTimeout(positionTimer.current)
      positionTimer.current = null
    }
    if (!artworks.length) return
    await callAction('move_artworks', {
      artworks: artworks.map(a => ({ id: a.id, xF: a.xF, yF: a.yF })),
    }, { keepalive })
  }

  const activeElev = elevations.find(e => e.id === activeElevId)
  const optData = optionsState[activeElevId]?.[activeOpt]

  const budgetElevations: BudgetElevationData[] = elevations.map(elev => ({
    id: elev.id,
    name: elev.name,
    clientPickedOption: pickedOptions[elev.id] ?? elev.clientPickedOption,
    options: elev.elevation_options.map(opt => ({
      key: opt.option,
      artworks: opt.artworks.map(a => ({
        id: a.id,
        name: a.name,
        artist: a.artist ?? '',
        wCm: a.wCm,
        hCm: a.hCm,
        price: a.price,
        framingStatus: (a.framingStatus === 'requires_framing' ? 'requires_framing' : 'framed') as 'framed' | 'requires_framing',
        framingCost: a.framingCost ?? null,
        visible: a.visible,
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
   * `serverVisibility` holds what the server had before the current burst, so
   * a failed write rolls back to the truth rather than to the previous click,
   * and a burst that ends where it started skips the request entirely.
   */
  function toggleVisibility(artId: string) {
    const art = optionsStateRef.current[activeElevId]?.[activeOpt]?.artworks.find(a => a.id === artId)
    if (!art) return
    const newVis = !art.visible
    const elevId = activeElevId, opt = activeOpt

    if (!serverVisibility.current.has(artId)) serverVisibility.current.set(artId, art.visible)

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

    const pending = visibilityTimers.current.get(artId)
    if (pending) clearTimeout(pending)
    visibilityTimers.current.set(artId, setTimeout(() => {
      visibilityTimers.current.delete(artId)
      const baseline = serverVisibility.current.get(artId)
      serverVisibility.current.delete(artId)
      // Toggled an even number of times — the server is already correct.
      if (baseline === newVis) return

      callAction('toggle_visibility', { artworkId: artId, visible: newVis }).catch(() => {
        setOptionsState(prev => ({
          ...prev,
          [elevId]: {
            ...prev[elevId],
            [opt]: {
              ...prev[elevId][opt],
              artworks: prev[elevId][opt].artworks.map(a =>
                a.id === artId ? { ...a, visible: baseline ?? a.visible } : a
              ),
            },
          },
        }))
        setRerenderKey(k => k + 1)
        onStatus('Failed to update visibility. Please try again.')
      })
    }, VISIBILITY_SAVE_DELAY_MS))
  }

  /**
   * Drag end. Positions used to reach the database only via the flush inside
   * pick/approve, so a client who dragged and left without picking lost the
   * arrangement. Debounced so a flurry of small adjustments is one write.
   */
  function onArtworkMoveEnd() {
    const elevId = activeElevId, opt = activeOpt
    if (positionTimer.current) clearTimeout(positionTimer.current)
    positionTimer.current = setTimeout(() => {
      positionTimer.current = null
      const arts = optionsStateRef.current[elevId]?.[opt]?.artworks ?? []
      flushPositions(arts).catch(err => {
        // Low-stakes: the on-screen position is already what the client wants,
        // and pick/approve flushes again before anything locks.
        console.warn('move_artworks failed:', err)
      })
    }, POSITION_SAVE_DELAY_MS)
  }

  function onNotesChange(notes: string) {
    if (!optData) return
    const optionId = optData.id
    setOptionsState(prev => ({
      ...prev,
      [activeElevId]: {
        ...prev[activeElevId],
        [activeOpt]: { ...prev[activeElevId][activeOpt], clientNotes: notes },
      },
    }))
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => {
      // Fire-and-forget, as before: notes are low-stakes and the field keeps
      // the typed value regardless.
      callAction('save_notes', { optionId, notes }).catch(err => {
        console.warn('save_notes failed:', err)
      })
    }, 800)
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
      await flushPositions(optionsState[elevId]?.[opt]?.artworks ?? [])
      // The server writes the pick and its activity-log entry.
      await callAction('pick_option', { elevationId: elevId, option: opt })
      onStatus(`Option ${opt} selected`)
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

  async function handleApprove() {
    if (!optData) return
    const key = `handleApprove:${optData.id}`
    if (inFlightRef.current.has(key)) return
    inFlightRef.current.add(key)
    const snapshotOpt = { ...optionsState[activeElevId][activeOpt] }
    try {
      // Save current artwork positions before they lock
      await flushPositions(optData.artworks)

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

      onStatus(`Option ${activeOpt} approved!`)
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
          {project.name}
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
            const optsWithImages = elev.elevation_options.filter(o => o.imageUrl)
            const multiOption = optsWithImages.length > 1
            const picked = pickedOptions[elev.id]

            // Once picked: only show the chosen option's tab
            const visibleOpts = multiOption && picked
              ? optsWithImages.filter(o => o.option === picked)
              : optsWithImages

            return (
              <div key={elev.id} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div className="client-tab-divider" />}
                {visibleOpts.map(opt => {
                  const tagClass = opt.option === 'A' ? 'tag tag-option-a' : opt.option === 'B' ? 'tag tag-option-b' : 'tag tag-option-other'
                  return multiOption ? (
                    <button
                      key={opt.option}
                      className={`client-tab-btn${activeElevId === elev.id && activeOpt === opt.option ? ' active' : ''}`}
                      onClick={() => { setActiveElevId(elev.id); setActiveOpt(opt.option) }}
                    >
                      <span className={tagClass} style={{ marginRight: 5 }}>{opt.option}</span>
                      {elev.name}{picked === opt.option ? ' ✓' : ''}
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
            projectId={project.id}
            rerenderKey={rerenderKey}
            approvalActivity={approvalActivity}
            clientBudget={clientBudget}
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
            onNotesChange={onNotesChange}
            onApprove={handleApprove}
          />
        ) : (
          <div className="client-empty-state">No elevation uploaded for this option</div>
        )}
      </div>

      {/* Budget view — kept mounted so it updates reactively when picks change */}
      <div style={{ display: portalView === 'budget' ? '' : 'none' }}>
        <BudgetScreen
          projectId={project.id}
          projectName={project.name}
          clientName={project.clientName}
          elevations={budgetElevations}
          isConsultant={false}
          isPreviewingClientView={false}
          clientBudget={clientBudget}
          initialBudget={budget}
        />
      </div>

      <StatusToast message={toast} />
    </div>
  )
}
