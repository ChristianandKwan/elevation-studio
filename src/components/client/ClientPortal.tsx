'use client'

import { useState, useRef } from 'react'
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

  // Default to first elevation+option that has an image
  const firstWithImage = elevations.flatMap(e =>
    e.elevation_options.filter(o => o.imageUrl).map(o => ({ elevId: e.id, opt: o.option as 'A' | 'B' }))
  )[0]

  const [activeElevId, setActiveElevId] = useState(firstWithImage?.elevId ?? elevations[0]?.id ?? '')
  const [activeOpt, setActiveOpt] = useState<'A' | 'B'>(firstWithImage?.opt ?? 'A')

  // Central state for all options — artwork positions/visibility persist across tab switches
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

  // Increment to force canvas DOM re-render when artwork visibility changes
  const [rerenderKey, setRerenderKey] = useState(0)

  // Debounce timer for notes auto-save
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    // Debounced save
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      const supabase = createClient()
      await supabase.from('elevation_options').update({ client_notes: notes }).eq('id', optionId)
    }, 800)
  }

  async function handleApprove() {
    if (!optData) return
    const supabase = createClient()
    const now = new Date().toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    await Promise.all(
      optData.artworks.map(art =>
        supabase.from('artworks').update({ x_fraction: art.xF, y_fraction: art.yF }).eq('id', art.id)
      )
    )
    await supabase.from('elevation_options').update({ approved: true, approved_at: now }).eq('id', optData.id)
    await supabase.from('projects').update({ status: 'approved' }).eq('id', project.id)
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'approved',
      text: `Client approved Option ${activeOpt} of ${activeElev?.name ?? ''}`,
    })
    setOptionsState(prev => ({
      ...prev,
      [activeElevId]: {
        ...prev[activeElevId],
        [activeOpt]: { ...prev[activeElevId][activeOpt], approved: true, approved_at: now },
      },
    }))
    onStatus(`Option ${activeOpt} approved!`)
  }

  async function handleUnapprove() {
    if (!optData) return
    const supabase = createClient()
    await supabase.from('elevation_options').update({ approved: false, approved_at: null }).eq('id', optData.id)
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'unapprove',
      text: `Client unapproved Option ${activeOpt} of ${activeElev?.name ?? ''}`,
    })
    setOptionsState(prev => ({
      ...prev,
      [activeElevId]: {
        ...prev[activeElevId],
        [activeOpt]: { ...prev[activeElevId][activeOpt], approved: false, approved_at: null },
      },
    }))
    onStatus('Approval removed')
  }

  return (
    <div className="client-layout">
      {/* Header */}
      <div className="client-header">
        <img src="/ck-wordmark-white.png" alt="Christian & Kwan" className="client-logo" />
        <div className="client-header-brand">Elevation Studio</div>
        <div className="client-project-label">{project.name}</div>
      </div>

      {/* Tab bar */}
      <div className="client-tab-bar">
        {elevations.map((elev, i) => {
          const hasA = elev.elevation_options.some(o => o.option === 'A' && o.imageUrl)
          const hasB = elev.elevation_options.some(o => o.option === 'B' && o.imageUrl)
          return (
            <div key={elev.id} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && <div className="client-tab-divider" />}
              {hasA && (
                <button
                  className={`client-tab-btn${activeElevId === elev.id && activeOpt === 'A' ? ' active' : ''}`}
                  onClick={() => { setActiveElevId(elev.id); setActiveOpt('A') }}
                >
                  <span className="tag tag-option-a" style={{ marginRight: 5 }}>A</span>
                  {elev.name}
                </button>
              )}
              {hasB && (
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
          onArtworkMove={onArtworkMove}
          onToggleVisibility={toggleVisibility}
          onNotesChange={onNotesChange}
          onApprove={handleApprove}
          onUnapprove={handleUnapprove}
        />
      ) : (
        <div className="client-empty-state">No elevation uploaded for this option</div>
      )}

      <StatusToast message={toast} />
    </div>
  )
}
