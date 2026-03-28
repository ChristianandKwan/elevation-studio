'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import type { Artwork, ActivityLog } from '@/types'

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
    foreground_masks: unknown
    clientNotes: string
    artworks: Array<Artwork & { imageUrl: string | null }>
  }>
}

interface Props {
  project: { id: string; name: string; client_name: string; status: string; consultantName: string }
  elevations: DbElevation[]
  existingToken: string | null
  activityLogs: ActivityLog[]
}

type OptionKey = 'A' | 'B'

export default function StudioScreen({ project, elevations: initialElevations, existingToken, activityLogs }: Props) {
  const router = useRouter()
  const [toast, setToast] = useState('')
  const [elevations, setElevations] = useState(initialElevations)
  const [activeElevId, setActiveElevId] = useState(initialElevations[0]?.id ?? '')
  const [activeOption, setActiveOption] = useState<OptionKey>('A')
  const [shareToken, setShareToken] = useState(existingToken)
  const [projectStatus, setProjectStatus] = useState(project.status)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string> | null>(null)

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const activeElev = elevations.find(e => e.id === activeElevId)
  const activeOptData = activeElev?.elevation_options.find(o => o.option === activeOption)
  const optionId = activeOptData?.id ?? ''
  const otherOptionKey = activeOption === 'A' ? 'B' : 'A'
  const otherOptData = activeElev?.elevation_options.find(o => o.option === otherOptionKey)
  const otherOptionNotes = otherOptData?.clientNotes ?? ''

  const studio = useStudio({ projectId: project.id, optionId, onStatus, projectName: project.name, elevationName: activeElev?.name ?? '', optionKey: activeOption })

  // When we call loadOption directly in handleSwitch we skip the effect for that one render
  const skipNextLoadRef = useRef(false)

  // Load option into studio when tab changes
  useEffect(() => {
    if (!activeOptData) return
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return }
    studio.loadOption({
      imageUrl: activeOptData.imageUrl,
      imagePath: activeOptData.imagePath,
      origW: activeOptData.orig_w,
      origH: activeOptData.orig_h,
      scalePxPerCm: activeOptData.scale_px_per_cm,
      zoom: activeOptData.zoom,
      artworks: activeOptData.artworks ?? [],
      foregroundMasks: (activeOptData.foreground_masks as import('@/types').ForegroundMasks | null) ?? null,
    })
  }, [activeElevId, activeOption]) // eslint-disable-line

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      const s = studio.state
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selIds.size > 0) {
        requestDeleteArtworks(new Set(s.selIds))
        return
      }
      if (e.key === 'Escape') {
        if (s.maskDraw.active) {
          if (s.maskDraw.currentPoints.length > 0) { studio.clearCurrentPoints(); return }
          studio.cancelMaskDraw(); return
        }
        if (s.calib.active) { studio.cancelCalibration(); return }
        studio.selectArtwork(null)
        return
      }
      if (s.selIds.size > 0 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        if (!s.elev) return
        const step = e.shiftKey ? 10 : 1
        s.artworks.forEach(art => {
          if (!s.selIds.has(art.id) || !s.elev) return
          if (e.key === 'ArrowLeft')  art.xF = Math.max(0, art.xF - step / s.elev.dispW)
          if (e.key === 'ArrowRight') art.xF = Math.min(1, art.xF + step / s.elev.dispW)
          if (e.key === 'ArrowUp')    art.yF = Math.max(0, art.yF - step / s.elev.dispH)
          if (e.key === 'ArrowDown')  art.yF = Math.min(1, art.yF + step / s.elev.dispH)
        })
        studio.renderArtworksDOM(s.artworks, s.elev, s.scale, s.selIds)
        e.preventDefault()
      }
      if ((e.key === '=' || e.key === '+') && (e.metaKey || e.ctrlKey)) { studio.changeZoom(0.1, s); e.preventDefault() }
      if (e.key === '-' && (e.metaKey || e.ctrlKey)) { studio.changeZoom(-0.1, s); e.preventDefault() }
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) { studio.setZoomFit(s); e.preventDefault() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [studio])

  async function handleSwitch(elevId: string, opt: string) {
    // Before switching: sync current artwork positions from studio state back into elevations,
    // so if the user returns to this option the positions are up to date.
    const currentArts = studio.state.artworks
    if (currentArts.length > 0 && activeElevId && activeOption) {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return {
              ...o,
              artworks: o.artworks.map(a => {
                const cur = currentArts.find(ca => ca.id === a.id)
                return cur ? { ...a, xF: cur.xF, yF: cur.yF } : a
              }),
            }
          }),
        }
      }))
    }

    // If switching to Option B and B has no image but A does, copy A's image data
    if (opt === 'B') {
      const elev = elevations.find(e => e.id === elevId)
      const optA = elev?.elevation_options.find(o => o.option === 'A')
      const optB = elev?.elevation_options.find(o => o.option === 'B')
      if (optA?.imagePath && !optB?.imagePath && optB?.id) {
        const supabase = createClient()
        await supabase.from('elevation_options').update({
          image_path: optA.imagePath,
          orig_w: optA.orig_w,
          orig_h: optA.orig_h,
          scale_px_per_cm: optA.scale_px_per_cm,
          zoom: optA.zoom,
        }).eq('id', optB.id)
        // Update local state
        setElevations(prev => prev.map(e => {
          if (e.id !== elevId) return e
          return {
            ...e,
            elevation_options: e.elevation_options.map(o => {
              if (o.option !== 'B') return o
              return { ...o, imagePath: optA.imagePath, imageUrl: optA.imageUrl, orig_w: optA.orig_w, orig_h: optA.orig_h, scale_px_per_cm: optA.scale_px_per_cm, zoom: optA.zoom }
            }),
          }
        }))
        // Load directly — don't rely on the effect, which may fire before setElevations has taken effect
        skipNextLoadRef.current = true
        studio.loadOption({
          imageUrl: optA.imageUrl,
          imagePath: optA.imagePath,
          origW: optA.orig_w,
          origH: optA.orig_h,
          scalePxPerCm: optA.scale_px_per_cm,
          zoom: optA.zoom,
          artworks: optB.artworks ?? [],
          foregroundMasks: (optB.foreground_masks as import('@/types').ForegroundMasks | null) ?? null,
        })
        setActiveElevId(elevId)
        setActiveOption(opt as OptionKey)
        return
      }
    }
    setActiveElevId(elevId)
    setActiveOption(opt as OptionKey)
  }

  function requestDeleteArtworks(ids: Set<string>) {
    setPendingDeleteIds(ids)
  }

  function confirmDeleteArtworks() {
    if (!pendingDeleteIds) return
    pendingDeleteIds.forEach(id => studio.deleteArtwork(id))
    setPendingDeleteIds(null)
  }

  async function deleteElevation(elevId: string) {
    const supabase = createClient()

    // Fetch all elevation_options for this elevation
    const { data: opts } = await supabase
      .from('elevation_options')
      .select('id, image_path')
      .eq('elevation_id', elevId)

    if (opts) {
      // Fetch artwork image paths for all options
      const optIds = opts.map(o => o.id)
      const { data: arts } = await supabase
        .from('artworks')
        .select('image_path')
        .in('option_id', optIds)

      // Delete artwork images from storage
      const artPaths = (arts ?? []).map((a: { image_path: string | null }) => a.image_path).filter(Boolean) as string[]
      if (artPaths.length) {
        await supabase.storage.from('artwork-images').remove(artPaths)
      }

      // Delete elevation images from storage
      const elevPaths = opts.map(o => o.image_path).filter(Boolean) as string[]
      if (elevPaths.length) {
        await supabase.storage.from('elevation-images').remove(elevPaths)
      }
    }

    // Delete the elevation row (DB cascades to options + artworks)
    await supabase.from('elevations').delete().eq('id', elevId)

    // Update local state and switch away if needed
    setElevations(prev => {
      const remaining = prev.filter(e => e.id !== elevId)
      if (activeElevId === elevId && remaining.length > 0) {
        setActiveElevId(remaining[0].id)
        setActiveOption('A')
      }
      return remaining
    })
    onStatus('Elevation deleted')
  }

  async function renameElevation(elevId: string, newName: string) {
    const supabase = createClient()
    await supabase.from('elevations').update({ name: newName }).eq('id', elevId)
    setElevations(prev => prev.map(e => e.id === elevId ? { ...e, name: newName } : e))
    onStatus('Elevation renamed')
  }

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

    // Fetch real option IDs immediately so artwork uploads work right away
    const { data: opts } = await supabase
      .from('elevation_options')
      .select('id, option')
      .eq('elevation_id', elev.id)

    const optA = opts?.find(o => o.option === 'A')
    const optB = opts?.find(o => o.option === 'B')

    const newElev: DbElevation = {
      id: elev.id, name: elev.name, display_order: elev.display_order,
      elevation_options: [
        { id: optA?.id ?? '', option: 'A', imageUrl: null, imagePath: null, orig_w: 0, orig_h: 0, scale_px_per_cm: null, zoom: 1, approved: false, approved_at: null, foreground_masks: null, clientNotes: '', artworks: [] },
        { id: optB?.id ?? '', option: 'B', imageUrl: null, imagePath: null, orig_w: 0, orig_h: 0, scale_px_per_cm: null, zoom: 1, approved: false, approved_at: null, foreground_masks: null, clientNotes: '', artworks: [] },
      ],
    }
    setElevations(prev => [...prev, newElev])
    setActiveElevId(elev.id)
    setActiveOption('A')
  }

  async function handleUnapprove() {
    if (!activeOptData) return
    const supabase = createClient()
    await supabase.from('elevation_options').update({ approved: false, approved_at: null }).eq('id', activeOptData.id)
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'unapprove',
      text: `${project.consultantName} unapproved Option ${activeOption} of ${activeElev?.name ?? ''}`,
    })
    setElevations(prev => prev.map(e => {
      if (e.id !== activeElevId) return e
      return {
        ...e,
        elevation_options: e.elevation_options.map(o => {
          if (o.option !== activeOption) return o
          return { ...o, approved: false, approved_at: null }
        }),
      }
    }))
    onStatus('Approval removed')
  }

  async function generateShareToken(): Promise<string> {
    const supabase = createClient()
    if (shareToken) return shareToken

    const { data } = await supabase.from('client_tokens').insert({ project_id: project.id }).select().single()
    const token = data?.token ?? ''
    setShareToken(token)

    // Log activity + set status to sent (only if not already approved)
    await supabase.from('activity_logs').insert({ project_id: project.id, type: 'link', text: `Client link generated by ${project.consultantName}` })
    if (projectStatus !== 'approved') {
      await supabase.from('projects').update({ status: 'sent' }).eq('id', project.id)
      setProjectStatus('sent')
    }

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
          {studio.saveStatus === 'saving' && (
            <span className="save-status save-status--saving">Saving…</span>
          )}
          {studio.saveStatus === 'saved' && (
            <span className="save-status save-status--saved">Saved ✓</span>
          )}
          {studio.saveStatus === 'error' && (
            <span className="save-status save-status--error">Save failed</span>
          )}
        </div>
        <div className="header-app-title">Elevation Studio</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {activeOptData?.approved && (
            <>
              <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>✓ Approved</span>
              <button className="btn btn-sm btn-ghost" onClick={handleUnapprove}>
                Unapprove
              </button>
            </>
          )}
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
        onSwitch={handleSwitch}
        onAddElevation={addElevation}
        onRenameElevation={renameElevation}
        onDeleteElevation={deleteElevation}
      />

      {/* Main */}
      <div className="studio-main">
        <StudioSidebar
          studio={studio}
          optionId={optionId}
          projectId={project.id}
          onStatus={onStatus}
          clientNotes={activeOptData?.clientNotes ?? ''}
          otherOptionNotes={otherOptionNotes}
          otherOptionKey={otherOptionKey}
          activityLogs={activityLogs}
          onRequestDeleteArtworks={requestDeleteArtworks}
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

      {/* Artwork delete confirmation modal */}
      {pendingDeleteIds && (
        <div className="modal-bg open" onClick={() => setPendingDeleteIds(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Remove {pendingDeleteIds.size} artwork{pendingDeleteIds.size !== 1 ? 's' : ''}?
            </div>
            <div className="modal-sub" style={{ color: 'var(--red)' }}>
              This cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPendingDeleteIds(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteArtworks}>Remove</button>
            </div>
          </div>
        </div>
      )}

      <StatusToast message={toast} />
    </div>
  )
}
