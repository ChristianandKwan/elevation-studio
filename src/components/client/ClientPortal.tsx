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
  priceIncludes: string
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
  const [pickedOptions, setPickedOptions] = useState<Record<string, 'A' | 'B' | null>>(() => {
    const s: Record<string, 'A' | 'B' | null> = {}
    elevations.forEach(e => { s[e.id] = (e.clientPickedOption as 'A' | 'B' | null) ?? null })
    return s
  })

  // Whether an elevation needs explicit picking (both A and B have images)
  function needsPick(elev: ClientElevationData): boolean {
    const hasA = elev.elevation_options.some(o => o.option === 'A' && o.imageUrl)
    const hasB = elev.elevation_options.some(o => o.option === 'B' && o.imageUrl)
    return hasA && hasB
  }

  // Resolve the active option for an elevation (respecting pick state)
  function resolveOpt(elev: ClientElevationData): 'A' | 'B' | null {
    if (pickedOptions[elev.id]) return pickedOptions[elev.id]!
    const hasA = elev.elevation_options.some(o => o.option === 'A' && o.imageUrl)
    const hasB = elev.elevation_options.some(o => o.option === 'B' && o.imageUrl)
    if (hasA) return 'A'
    if (hasB) return 'B'
    return null
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
  const [activeOpt, setActiveOpt] = useState<'A' | 'B'>(firstTab?.opt ?? 'A')

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

  async function handlePick(elevId: string, opt: 'A' | 'B') {
    const supabase = createClient()
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
          const hasA = elev.elevation_options.some(o => o.option === 'A' && o.imageUrl)
          const hasB = elev.elevation_options.some(o => o.option === 'B' && o.imageUrl)
          const bothExist = hasA && hasB
          const picked = pickedOptions[elev.id]

          // Once picked: only show the chosen option's tab
          const showA = hasA && (!bothExist || !picked || picked === 'A')
          const showB = hasB && (!bothExist || !picked || picked === 'B')

          return (
            <div key={elev.id} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div className="client-tab-divider" />}
              {showA && (
                <button
                  className={`client-tab-btn${activeElevId === elev.id && activeOpt === 'A' ? ' active' : ''}`}
                  onClick={() => { setActiveElevId(elev.id); setActiveOpt('A') }}
                >
                  <span className="tag tag-option-a" style={{ marginRight: 5 }}>A</span>
                  {elev.name}
                </button>
              )}
              {showB && (
                <button
                  className={`client-tab-btn${activeElevId === elev.id && activeOpt === 'B' ? ' active' : ''}`}
                  onClick={() => { setActiveElevId(elev.id); setActiveOpt('B') }}
                >
                  <span className="tag tag-option-b" style={{ marginRight: 5 }}>B</span>
                  {elev.name}
                </button>
              )}
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
          onPick={(opt) => handlePick(activeElevId, opt)}
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
