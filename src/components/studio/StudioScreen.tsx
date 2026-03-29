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
  clientPickedOption: string | null
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
    skew_tl_x?: number | null
    skew_tl_y?: number | null
    skew_tr_x?: number | null
    skew_tr_y?: number | null
    skew_br_x?: number | null
    skew_br_y?: number | null
    skew_bl_x?: number | null
    skew_bl_y?: number | null
    skew_active?: boolean
    artworks: Array<Artwork & { imageUrl: string | null }>
  }>
}

interface Props {
  project: { id: string; name: string; client_name: string; status: string; consultantName: string; budget: number | null }
  elevations: DbElevation[]
  existingToken: string | null
  activityLogs: ActivityLog[]
}

type SkewOptData = Pick<DbElevation['elevation_options'][number],
  'skew_tl_x' | 'skew_tl_y' | 'skew_tr_x' | 'skew_tr_y' |
  'skew_br_x' | 'skew_br_y' | 'skew_bl_x' | 'skew_bl_y'>

function buildSkewCorners(opt: SkewOptData): import('@/hooks/useStudio').SkewCorners | null {
  const { skew_tl_x: tlx, skew_tl_y: tly, skew_tr_x: trx, skew_tr_y: try_,
          skew_br_x: brx, skew_br_y: bry, skew_bl_x: blx, skew_bl_y: bly } = opt
  if (tlx == null || tly == null || trx == null || try_ == null ||
      brx == null || bry == null || blx == null || bly == null) return null
  return [[tlx, tly], [trx, try_], [brx, bry], [blx, bly]]
}

export default function StudioScreen({ project, elevations: initialElevations, existingToken, activityLogs }: Props) {
  const router = useRouter()
  const [toast, setToast] = useState('')
  const [elevations, setElevations] = useState(initialElevations)
  const [activeElevId, setActiveElevId] = useState(initialElevations[0]?.id ?? '')
  const [activeOption, setActiveOption] = useState<string>(() => {
    const firstElev = initialElevations[0]
    return firstElev?.elevation_options[0]?.option ?? 'A'
  })
  const [shareToken, setShareToken] = useState(existingToken)
  const [projectStatus, setProjectStatus] = useState(project.status)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string> | null>(null)
  const [budget, setBudget] = useState<number | null>(project.budget)

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const activeElev = elevations.find(e => e.id === activeElevId)
  const activeOptData = activeElev?.elevation_options.find(o => o.option === activeOption)
  const optionId = activeOptData?.id ?? ''
  // "other option" = first option that isn't the active one (for client notes display)
  const otherOptData = activeElev?.elevation_options.find(o => o.option !== activeOption)
  const otherOptionKey = otherOptData?.option ?? ''
  const otherOptionNotes = otherOptData?.clientNotes ?? ''

  const studio = useStudio({
    projectId: project.id,
    optionId,
    onStatus,
    projectName: project.name,
    elevationName: activeElev?.name ?? '',
    optionKey: activeOption,
    onElevationUploaded: ({ imagePath, imageUrl, origW, origH, zoom }) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return { ...o, imagePath, imageUrl, orig_w: origW, orig_h: origH, zoom }
          }),
        }
      }))
    },
    onScaleSet: (scalePxPerCm) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return { ...o, scale_px_per_cm: scalePxPerCm }
          }),
        }
      }))
    },
    onArtworksAdded: (newArtworks) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return { ...o, artworks: [...o.artworks, ...newArtworks] }
          }),
        }
      }))
    },
    onArtworkDeleted: (id) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return { ...o, artworks: o.artworks.filter(a => a.id !== id) }
          }),
        }
      }))
    },
    onForegroundSaved: (masks) => {
      // If sibling options share the same elevation image, mirror the foreground masks to them
      setElevations(prev => {
        const elev = prev.find(e => e.id === activeElevId)
        if (!elev) return prev
        const currentOpt = elev.elevation_options.find(o => o.option === activeOption)
        if (!currentOpt?.imagePath) return prev
        const siblingIds = elev.elevation_options
          .filter(o => o.option !== activeOption && o.imagePath === currentOpt.imagePath)
          .map(o => o.id)
        if (siblingIds.length === 0) return prev
        // Persist to DB
        const supabase = createClient()
        supabase.from('elevation_options')
          .update({ foreground_masks: masks.length > 0 ? masks : null })
          .in('id', siblingIds)
          .then(() => {})
        // Update local state
        return prev.map(e => {
          if (e.id !== activeElevId) return e
          return {
            ...e,
            elevation_options: e.elevation_options.map(o => {
              if (!siblingIds.includes(o.id)) return o
              return { ...o, foreground_masks: masks.length > 0 ? masks : null }
            }),
          }
        })
      })
    },
  })

  // When we call loadOption directly in handleSwitch we skip the effect for that one render
  const skipNextLoadRef = useRef(false)

  // Ref to track whether the active option is client-picked (used in keydown handler to avoid stale closure)
  const artworkMoveLocked = useRef(false)
  useEffect(() => {
    artworkMoveLocked.current = !!(activeElev?.clientPickedOption && activeElev.clientPickedOption === activeOption)
  }, [activeElev?.clientPickedOption, activeOption])

  // Load option into studio when tab changes
  useEffect(() => {
    if (!activeOptData) return
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return }
    const skewCorners = buildSkewCorners(activeOptData)
    studio.loadOption({
      imageUrl: activeOptData.imageUrl,
      imagePath: activeOptData.imagePath,
      origW: activeOptData.orig_w,
      origH: activeOptData.orig_h,
      scalePxPerCm: activeOptData.scale_px_per_cm,
      zoom: activeOptData.zoom,
      artworks: activeOptData.artworks ?? [],
      foregroundMasks: (activeOptData.foreground_masks as import('@/types').ForegroundMasks | null) ?? null,
      skewCorners,
      skewActive: activeOptData.skew_active ?? false,
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
      if (e.key === 'Enter' && s.skewAdjustMode) {
        e.preventDefault()
        studio.finaliseSkewAdjust()
        return
      }
      if (e.key === 'Escape') {
        if (s.skewAdjustMode) { studio.cancelSkewAdjust(); return }
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
        if (artworkMoveLocked.current) return
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
    // Before switching: sync current artwork positions and zoom from studio state back into elevations
    const currentArts = studio.state.artworks
    const currentZoom = studio.state.zoom
    if (activeElevId && activeOption) {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return {
              ...o,
              zoom: currentZoom,
              artworks: o.artworks.map(a => {
                const cur = currentArts.find(ca => ca.id === a.id)
                if (!cur) return a
                return {
                  ...a,
                  xF: cur.xF, yF: cur.yF,
                  name: cur.name,
                  wCm: cur.wCm, hCm: cur.hCm,
                  price: cur.price, priceIncludes: cur.priceIncludes,
                  frameType: cur.frameType, frameWidthMm: cur.frameWidthMm,
                  brightness: cur.brightness,
                  visible: cur.visible,
                }
              }),
            }
          }),
        }
      }))
    }

    // If target option has no image but another option does, copy from the first with an image
    const elev = elevations.find(e => e.id === elevId)
    const targetOpt = elev?.elevation_options.find(o => o.option === opt)
    const sourceOpt = elev?.elevation_options.find(o => o.option !== opt && o.imagePath)
    if (targetOpt && !targetOpt.imagePath && sourceOpt) {
      const supabase = createClient()
      await supabase.from('elevation_options').update({
        image_path: sourceOpt.imagePath,
        orig_w: sourceOpt.orig_w,
        orig_h: sourceOpt.orig_h,
        scale_px_per_cm: sourceOpt.scale_px_per_cm,
        zoom: sourceOpt.zoom,
      }).eq('id', targetOpt.id)
      setElevations(prev => prev.map(e => {
        if (e.id !== elevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== opt) return o
            return { ...o, imagePath: sourceOpt.imagePath, imageUrl: sourceOpt.imageUrl, orig_w: sourceOpt.orig_w, orig_h: sourceOpt.orig_h, scale_px_per_cm: sourceOpt.scale_px_per_cm, zoom: sourceOpt.zoom }
          }),
        }
      }))
      skipNextLoadRef.current = true
      studio.loadOption({
        imageUrl: sourceOpt.imageUrl,
        imagePath: sourceOpt.imagePath,
        origW: sourceOpt.orig_w,
        origH: sourceOpt.orig_h,
        scalePxPerCm: sourceOpt.scale_px_per_cm,
        zoom: sourceOpt.zoom,
        artworks: targetOpt.artworks ?? [],
        foregroundMasks: (targetOpt.foreground_masks as import('@/types').ForegroundMasks | null) ?? null,
        skewCorners: buildSkewCorners(targetOpt),
        skewActive: targetOpt.skew_active ?? false,
      })
      setActiveElevId(elevId)
      setActiveOption(opt)
      return
    }
    setActiveElevId(elevId)
    setActiveOption(opt)
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
        setActiveOption(remaining[0].elevation_options[0]?.option ?? 'A')
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

    const { data: optRow } = await supabase.from('elevation_options')
      .insert({ elevation_id: elev.id, option: 'A' })
      .select().single()

    const newElev: DbElevation = {
      id: elev.id, name: elev.name, display_order: elev.display_order, clientPickedOption: null,
      elevation_options: [
        { id: optRow?.id ?? '', option: 'A', imageUrl: null, imagePath: null, orig_w: 0, orig_h: 0, scale_px_per_cm: null, zoom: 1, approved: false, approved_at: null, foreground_masks: null, clientNotes: '', artworks: [] },
      ],
    }
    setElevations(prev => [...prev, newElev])
    setActiveElevId(elev.id)
    setActiveOption('A')
  }

  async function addOption(elevId: string) {
    const elev = elevations.find(e => e.id === elevId)
    if (!elev) return
    const usedKeys = new Set(elev.elevation_options.map(o => o.option))
    const nextKey = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find(l => !usedKeys.has(l)) ?? 'X'
    // Inherit image + foreground from the currently active option (same room = same base photo)
    const srcOpt = elev.elevation_options.find(o => o.option === activeOption) ?? elev.elevation_options[0] ?? null
    const inheritedImagePath = srcOpt?.imagePath ?? null
    const inheritedMasks = (srcOpt?.foreground_masks as any[] | null) ?? null
    const inheritedOrigW = srcOpt?.orig_w ?? 0
    const inheritedOrigH = srcOpt?.orig_h ?? 0
    const inheritedScale = srcOpt?.scale_px_per_cm ?? null
    const inheritedZoom = srcOpt?.zoom ?? 1
    const supabase = createClient()
    const insertPayload: Record<string, unknown> = { elevation_id: elevId, option: nextKey }
    if (inheritedImagePath) {
      insertPayload.image_path = inheritedImagePath
      insertPayload.orig_w = inheritedOrigW
      insertPayload.orig_h = inheritedOrigH
      insertPayload.scale_px_per_cm = inheritedScale
      insertPayload.zoom = inheritedZoom
    }
    if (inheritedMasks && inheritedMasks.length > 0) {
      insertPayload.foreground_masks = inheritedMasks
    }
    const { data: optRow, error: insertError } = await supabase.from('elevation_options')
      .insert(insertPayload)
      .select().single()
    if (insertError) { console.error('addOption insert failed:', insertError); onStatus('Failed to add option'); return }
    if (!optRow) return
    setElevations(prev => prev.map(e => {
      if (e.id !== elevId) return e
      return {
        ...e,
        elevation_options: [...e.elevation_options, {
          id: optRow.id, option: nextKey,
          imageUrl: srcOpt?.imageUrl ?? null,
          imagePath: inheritedImagePath,
          orig_w: inheritedOrigW, orig_h: inheritedOrigH,
          scale_px_per_cm: inheritedScale, zoom: inheritedZoom,
          approved: false, approved_at: null,
          foreground_masks: inheritedMasks,
          clientNotes: '', artworks: [],
        }],
      }
    }))
    setActiveElevId(elevId)
    setActiveOption(nextKey)
    onStatus(`Option ${nextKey} added`)
  }

  async function deleteOption(elevId: string, optKey: string) {
    const elev = elevations.find(e => e.id === elevId)
    const opt = elev?.elevation_options.find(o => o.option === optKey)
    if (!opt || !elev) return
    const supabase = createClient()
    // Delete artwork images
    const artPaths = opt.artworks.map(a => (a as any).imagePath).filter(Boolean) as string[]
    if (artPaths.length) await supabase.storage.from('artwork-images').remove(artPaths)
    // Delete elevation image
    if (opt.imagePath) await supabase.storage.from('elevation-images').remove([opt.imagePath])
    // Delete option row (DB cascades to artworks)
    await supabase.from('elevation_options').delete().eq('id', opt.id)
    const remaining = elev.elevation_options.filter(o => o.option !== optKey)
    setElevations(prev => prev.map(e => {
      if (e.id !== elevId) return e
      return { ...e, elevation_options: remaining }
    }))
    // Switch away if deleting the active option
    if (activeElevId === elevId && activeOption === optKey && remaining.length > 0) {
      setActiveOption(remaining[0].option)
    }
    onStatus(`Option ${optKey} removed`)
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

  async function updateBudget(newBudget: number | null) {
    const supabase = createClient()
    await supabase.from('projects').update({ budget: newBudget }).eq('id', project.id)
    setBudget(newBudget)
    onStatus(newBudget ? 'Budget saved' : 'Budget cleared')
  }

  async function handleConsultantUnapprove() {
    if (!activeOptData?.id) return
    const supabase = createClient()
    await supabase
      .from('elevation_options')
      .update({ approved: false, approved_at: null })
      .eq('id', activeOptData.id)
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
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'unapprove',
      text: `C&K unapproved Option ${activeOption} of ${activeElev?.name ?? ''}`,
    })
    onStatus('Approval removed — client can make changes again')
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
        elevations={elevations.map(e => ({
          id: e.id,
          name: e.name,
          options: e.elevation_options.map(o => ({ key: o.option, hasArtworks: o.artworks.length > 0 })),
        }))}
        activeElevId={activeElevId}
        activeOption={activeOption}
        onSwitch={handleSwitch}
        onAddElevation={addElevation}
        onRenameElevation={renameElevation}
        onDeleteElevation={deleteElevation}
        onAddOption={addOption}
        onDeleteOption={deleteOption}
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
          approvalStatus={{
            pickedOption: activeElev?.clientPickedOption ?? null,
            approved: activeOptData?.approved ?? false,
            approvedAt: activeOptData?.approved_at ?? null,
          }}
          onUnapprove={handleConsultantUnapprove}
          budget={budget}
          onBudgetChange={updateBudget}
        />
        <StudioCanvas
          studio={studio}
          onStatus={onStatus}
          clientPickedOption={activeElev?.clientPickedOption ?? null}
          activeOption={activeOption}
        />
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
