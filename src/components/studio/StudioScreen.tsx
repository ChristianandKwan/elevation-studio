'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useStudio } from '@/hooks/useStudio'
import StudioCanvas from './StudioCanvas'
import StudioSidebar from './StudioSidebar'
import TabBar from './TabBar'
import CalibrationModal from './CalibrationModal'
import AddArtworkModal from './AddArtworkModal'
import ShareModal from './ShareModal'
import StatusToast from '@/components/ui/StatusToast'
import { timeNow } from '@/lib/utils'
import type { Artwork } from '@/types'

interface DbElevation {
  id: string
  name: string
  display_order: number
  elevation_options: Array<{
    id: string
    option: string
    imageUrl: string | null
    imagePath: string | null
    orig_w: number
    orig_h: number
    scale_px_per_cm: number | null
    zoom: number
    approved: boolean
    approved_at: string | null
    artworks: Array<Artwork & { imageUrl: string | null }>
  }>
}

interface Props {
  project: { id: string; name: string; client_name: string; status: string; consultantName: string }
  elevations: DbElevation[]
  existingToken: string | null
}

type OptionKey = 'A' | 'B'

export default function StudioScreen({ project, elevations: initialElevations, existingToken }: Props) {
  const router = useRouter()
  const [toast, setToast] = useState('')
  const [elevations, setElevations] = useState(initialElevations)
  const [activeElevId, setActiveElevId] = useState(initialElevations[0]?.id ?? '')
  const [activeOption, setActiveOption] = useState<OptionKey>('A')
  const [shareToken, setShareToken] = useState(existingToken)

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const activeElev = elevations.find(e => e.id === activeElevId)
  const activeOptData = activeElev?.elevation_options.find(o => o.option === activeOption)
  const optionId = activeOptData?.id ?? ''

  const studio = useStudio({ projectId: project.id, optionId, onStatus })

  // Load option into studio when tab changes
  useEffect(() => {
    if (!activeOptData) return
    studio.loadOption({
      imageUrl: activeOptData.imageUrl,
      imagePath: activeOptData.imagePath,
      origW: activeOptData.orig_w,
      origH: activeOptData.orig_h,
      scalePxPerCm: activeOptData.scale_px_per_cm,
      zoom: activeOptData.zoom,
      artworks: activeOptData.artworks ?? [],
    })
  }, [activeElevId, activeOption]) // eslint-disable-line

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      const s = studio.state
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selId) {
        studio.deleteArtwork(s.selId)
        return
      }
      if (e.key === 'Escape') {
        if (s.calib.active) { studio.cancelCalibration(); return }
        studio.selectArtwork(null)
        return
      }
      if (s.selId && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        const art = s.artworks.find(a => a.id === s.selId)
        if (!art || !s.elev) return
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft')  art.xF = Math.max(0, art.xF - step / s.elev.dispW)
        if (e.key === 'ArrowRight') art.xF = Math.min(1, art.xF + step / s.elev.dispW)
        if (e.key === 'ArrowUp')    art.yF = Math.max(0, art.yF - step / s.elev.dispH)
        if (e.key === 'ArrowDown')  art.yF = Math.min(1, art.yF + step / s.elev.dispH)
        studio.renderArtworksDOM(s.artworks, s.elev, s.scale, s.selId ?? undefined)
        e.preventDefault()
      }
      if ((e.key === '=' || e.key === '+') && (e.metaKey || e.ctrlKey)) { studio.changeZoom(0.1, s); e.preventDefault() }
      if (e.key === '-' && (e.metaKey || e.ctrlKey)) { studio.changeZoom(-0.1, s); e.preventDefault() }
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) { studio.setZoomFit(s); e.preventDefault() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [studio])

  async function addElevation(name: string) {
    const supabase = createClient()
    const { data: elev } = await supabase.from('elevations').insert({
      project_id: project.id,
      name,
      display_order: elevations.length,
    }).select().single()
    if (!elev) return

    await supabase.from('elevation_options').insert([
      { elevation_id: elev.id, option: 'A' },
      { elevation_id: elev.id, option: 'B' },
    ])

    const newElev: DbElevation = {
      id: elev.id, name: elev.name, display_order: elev.display_order,
      elevation_options: [
        { id: '', option: 'A', imageUrl: null, imagePath: null, orig_w: 0, orig_h: 0, scale_px_per_cm: null, zoom: 1, approved: false, approved_at: null, artworks: [] },
        { id: '', option: 'B', imageUrl: null, imagePath: null, orig_w: 0, orig_h: 0, scale_px_per_cm: null, zoom: 1, approved: false, approved_at: null, artworks: [] },
      ],
    }
    setElevations(prev => [...prev, newElev])
    setActiveElevId(elev.id)
    setActiveOption('A')

    // Refresh to get real option IDs
    router.refresh()
  }

  async function generateShareToken(): Promise<string> {
    const supabase = createClient()
    if (shareToken) return shareToken

    const { data } = await supabase.from('client_tokens').insert({ project_id: project.id }).select().single()
    const token = data?.token ?? ''
    setShareToken(token)

    // Log activity + set status to sent
    await supabase.from('activity_logs').insert({ project_id: project.id, type: 'link', text: `Client link generated by ${project.consultantName}` })
    await supabase.from('projects').update({ status: 'sent' }).eq('id', project.id)

    return token
  }

  const { state } = studio

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div className="studio-header">
        <div className="studio-header-left">
          <button className="studio-back" onClick={() => router.push('/dashboard')}>
            ← Dashboard
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <div className="studio-project-name">
            <strong>{project.name}</strong>
            {project.client_name && <span> — {project.client_name}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => studio.setShowShareModal(true)}>
            Share with client
          </button>
          <button className="btn btn-sm" onClick={studio.exportPng} disabled={!state.elev || !state.scale}>
            Export PNG
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar
        elevations={elevations}
        activeElevId={activeElevId}
        activeOption={activeOption}
        onSwitch={(elevId, opt) => { setActiveElevId(elevId); setActiveOption(opt as OptionKey) }}
        onAddElevation={addElevation}
      />

      {/* Main */}
      <div className="studio-main">
        <StudioSidebar
          studio={studio}
          optionId={optionId}
          projectId={project.id}
          onStatus={onStatus}
        />
        <StudioCanvas studio={studio} onStatus={onStatus} />
      </div>

      {/* Modals */}
      {studio.showScaleModal && (
        <CalibrationModal
          lineDispPx={studio.pendingCalibPx.current}
          onConfirm={studio.confirmScale}
          onCancel={studio.cancelCalibration}
        />
      )}

      {studio.showArtModal && (
        <AddArtworkModal
          onConfirm={studio.addArtworks}
          onCancel={() => studio.setShowArtModal(false)}
        />
      )}

      {studio.showShareModal && (
        <ShareModal
          projectName={project.name}
          projectId={project.id}
          onGetToken={generateShareToken}
          onClose={() => studio.setShowShareModal(false)}
          onStatus={onStatus}
        />
      )}

      <StatusToast message={toast} />
    </div>
  )
}
