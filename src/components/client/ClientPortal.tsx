'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ClientElevation from './ClientElevation'
import StatusToast from '@/components/ui/StatusToast'

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
}

interface ClientOption {
  id: string
  option: string
  imageUrl: string | null
  orig_w: number
  orig_h: number
  scale_px_per_cm: number | null
  zoom: number
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
}

export default function ClientPortal({ token, project, elevations, approvalActivity }: Props) {
  const [toast, setToast] = useState('')

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

  // Zoom persisted per elevation-option tab, seeded from DB zoom value
  const [zoomMap, setZoomMap] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    elevations.forEach(elev => {
      elev.elevation_options.forEach(opt => {
        initial[`${elev.id}/${opt.option}`] = opt.zoom ?? 1.0
      })
    })
    return initial
  })
  const zoomKey = `${activeElevId}/${activeOpt}`
  const zoom = zoomMap[zoomKey] ?? 1.0
  function setZoom(val: number | ((prev: number) => number)) {
    setZoomMap(prev => ({
      ...prev,
      [zoomKey]: typeof val === 'function' ? val(prev[zoomKey] ?? 1.0) : val,
    }))
  }
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear debounce timer on unmount to prevent state updates on an unmounted component
  useEffect(() => {
    return () => { if (notesTimer.current) clearTimeout(notesTimer.current) }
  }, [])

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const activeElev = elevations.find(e => e.id === activeElevId)
  const optData = optionsState[activeElevId]?.[activeOpt]

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

  async function toggleVisibility(artId: string) {
    const art = optionsState[activeElevId]?.[activeOpt]?.artworks.find(a => a.id === artId)
    if (!art) return
    const newVis = !art.visible
    setOptionsState(prev => ({
      ...prev,
      [activeElevId]: {
        ...prev[activeElevId],
        [activeOpt]: {
          ...prev[activeElevId][activeOpt],
          artworks: prev[activeElevId][activeOpt].artworks.map(a =>
            a.id === artId ? { ...a, visible: newVis } : a
          ),
        },
      },
    }))
    setRerenderKey(k => k + 1)
    const supabase = createClient()
    await supabase.from('artworks').update({ visible: newVis }).eq('id', artId)
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
    notesTimer.current = setTimeout(async () => {
      const supabase = createClient()
      await supabase.from('elevation_options').update({ client_notes: notes }).eq('id', optionId)
    }, 800)
  }

  async function handlePick(elevId: string, opt: string) {
    const supabase = createClient()
    // Save client's artwork positions before locking them in
    const artworks = optionsState[elevId]?.[opt]?.artworks ?? []
    if (artworks.length) {
      await Promise.all(
        artworks.map(art =>
          supabase.from('artworks').update({ x_fraction: art.xF, y_fraction: art.yF }).eq('id', art.id)
        )
      )
    }
    await supabase.from('elevations').update({ client_picked_option: opt }).eq('id', elevId)
    setPickedOptions(prev => ({ ...prev, [elevId]: opt }))
    setActiveElevId(elevId)
    setActiveOpt(opt)
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'pick',
      text: `Client picked Option ${opt} for ${elevations.find(e => e.id === elevId)?.name ?? ''}`,
    })
    onStatus(`Option ${opt} selected`)
  }

  async function handleClearPick(elevId: string) {
    const supabase = createClient()
    await supabase.from('elevations').update({ client_picked_option: null }).eq('id', elevId)
    setPickedOptions(prev => ({ ...prev, [elevId]: null }))
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'pick_cleared',
      text: `Client cleared option selection for ${elevations.find(e => e.id === elevId)?.name ?? ''}`,
    })
    onStatus('Selection cleared')
  }

  async function handleApprove() {
    if (!optData) return
    const supabase = createClient()
    const now = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })

    // Save current artwork positions
    await Promise.all(
      optData.artworks.map(art =>
        supabase.from('artworks').update({ x_fraction: art.xF, y_fraction: art.yF }).eq('id', art.id)
      )
    )

    // Approve the option
    await supabase.from('elevation_options').update({ approved: true, approved_at: now }).eq('id', optData.id)

    // Update local state
    setOptionsState(prev => ({
      ...prev,
      [activeElevId]: {
        ...prev[activeElevId],
        [activeOpt]: { ...prev[activeElevId][activeOpt], approved: true, approved_at: now },
      },
    }))

    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'approved',
      text: `Client approved Option ${activeOpt} of ${activeElev?.name ?? ''}`,
    })

    // Check if ALL elevations are fully done (picked + approved)
    const allDone = elevations.every(elev => {
      const requires = needsPick(elev)
      const pickedOpt = requires ? pickedOptions[elev.id] : resolveOpt(elev)
      if (!pickedOpt) return false
      if (elev.id === activeElevId) return true  // just approved above
      return optionsState[elev.id]?.[pickedOpt]?.approved ?? false
    })

    if (allDone) {
      await supabase.from('projects').update({ status: 'approved' }).eq('id', project.id)
    }

    onStatus(`Option ${activeOpt} approved!`)
  }


  return (
    <div className="client-layout">
      {/* Header */}
      <div className="client-header">
        <img src="/ck-wordmark-white.png" alt="Christian & Kwan" className="client-logo" />
        <div className="client-header-brand">Elevation Studio</div>
        <div className="client-project-label">
          {project.name}
          <span className="client-prepared-by">Prepared by {project.consultantName} · {project.preparedAt}</span>
        </div>
      </div>

      {/* Tab bar */}
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
          onToggleVisibility={toggleVisibility}
          onNotesChange={onNotesChange}
          onApprove={handleApprove}
        />
      ) : (
        <div className="client-empty-state">No elevation uploaded for this option</div>
      )}

      <StatusToast message={toast} />
    </div>
  )
}
