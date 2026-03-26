'use client'

import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Artwork, Scale, CalibState } from '@/types'

export interface StudioElev {
  imagePath: string
  imageUrl: string
  img: HTMLImageElement
  origW: number
  origH: number
  dispW: number
  dispH: number
}

export interface StudioState {
  elev: StudioElev | null
  scale: Scale | null
  artworks: Artwork[]
  selId: string | null
  zoom: number
  calib: CalibState
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0

interface UseStudioOptions {
  projectId: string
  optionId: string
  onStatus: (msg: string) => void
}

export function useStudio({ projectId, optionId, onStatus }: UseStudioOptions) {
  const [state, setState] = useState<StudioState>({
    elev: null,
    scale: null,
    artworks: [],
    selId: null,
    zoom: 1.0,
    calib: { active: false, drawing: false, start: null, lineDispPx: 0 },
  })

  // Refs for imperative canvas DOM (mirrors prototype)
  const elevWrapRef = useRef<HTMLDivElement>(null)
  const calibSvgRef = useRef<SVGSVGElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)

  // Pending scale modal data
  const pendingCalibPx = useRef(0)
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [showArtModal, setShowArtModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── HELPERS ──────────────────────────────────────────────────────
  function dispSize(art: Artwork, sc: Scale | null): { w: number; h: number } {
    if (!sc) return { w: 80, h: 60 }
    return { w: art.wCm * sc.dispPxPerCm, h: art.hCm * sc.dispPxPerCm }
  }

  // ─── ZOOM ──────────────────────────────────────────────────────────
  const applyZoom = useCallback((zoom: number, elev: StudioElev, scale: Scale | null, artworks: Artwork[]) => {
    const dW = Math.round(elev.origW * zoom)
    const dH = Math.round(elev.origH * zoom)
    elev.dispW = dW
    elev.dispH = dH

    const img = document.getElementById('elev-img') as HTMLImageElement | null
    const wrap = elevWrapRef.current
    if (img) { img.style.width = dW + 'px'; img.style.height = dH + 'px' }
    if (wrap) { wrap.style.width = dW + 'px'; wrap.style.height = dH + 'px' }

    const label = document.getElementById('zoom-label')
    if (label) label.textContent = Math.round(zoom * 100) + '%'

    const newScale = scale ? { ...scale, dispPxPerCm: scale.origPxPerCm * zoom } : null
    renderArtworksDOM(artworks, elev, newScale)
    return newScale
  }, [])

  function changeZoom(delta: number, currentState: StudioState) {
    if (!currentState.elev) return
    const vp = vpRef.current
    const xf = vp ? (vp.scrollLeft + vp.clientWidth / 2) / vp.scrollWidth : 0.5
    const yf = vp ? (vp.scrollTop + vp.clientHeight / 2) / vp.scrollHeight : 0.5
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((currentState.zoom + delta) * 10) / 10))
    const newElev = { ...currentState.elev }
    const newScale = applyZoom(newZoom, newElev, currentState.scale, currentState.artworks)
    setState(s => ({ ...s, zoom: newZoom, elev: newElev, scale: newScale }))
    requestAnimationFrame(() => {
      if (vp) {
        vp.scrollLeft = vp.scrollWidth * xf - vp.clientWidth / 2
        vp.scrollTop = vp.scrollHeight * yf - vp.clientHeight / 2
      }
    })
  }

  function setZoomFit(currentState: StudioState) {
    if (!currentState.elev) return
    const area = document.getElementById('canvas-area')
    if (!area) return
    const pad = 64
    const fit = Math.min(
      (area.clientWidth - pad) / currentState.elev.origW,
      (area.clientHeight - pad) / currentState.elev.origH,
      1
    )
    const newZoom = Math.round(fit * 10) / 10 || 1
    const newElev = { ...currentState.elev }
    const newScale = applyZoom(newZoom, newElev, currentState.scale, currentState.artworks)
    setState(s => ({ ...s, zoom: newZoom, elev: newElev, scale: newScale }))
    requestAnimationFrame(() => {
      const vp = vpRef.current
      if (vp) {
        vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2
        vp.scrollTop = (vp.scrollHeight - vp.clientHeight) / 2
      }
    })
  }

  // ─── RENDER ARTWORKS (imperative DOM, mirrors prototype) ──────────
  function renderArtworksDOM(artworks: Artwork[], elev: StudioElev | null, sc: Scale | null, selId?: string) {
    const wrap = elevWrapRef.current
    if (!wrap || !elev) return
    wrap.querySelectorAll('.aw-overlay').forEach(el => el.remove())

    artworks.forEach(art => {
      if (!art.visible) return
      const sz = dispSize(art, sc)
      const x = art.xF * elev.dispW
      const y = art.yF * elev.dispH

      const div = document.createElement('div')
      div.className = 'aw-overlay' + (art.id === selId ? ' selected' : '')
      div.dataset.id = art.id
      div.style.left = x + 'px'
      div.style.top = y + 'px'
      div.style.width = sz.w + 'px'
      div.style.height = sz.h + 'px'

      const img = document.createElement('img')
      img.src = art.imageUrl ?? ''
      img.draggable = false

      const tag = document.createElement('div')
      tag.className = 'aw-tag'
      tag.textContent = art.name + ' · ' + art.wCm + ' × ' + art.hCm + ' cm' + (art.price ? ' · £' + art.price.toLocaleString() : '')

      const rh = document.createElement('div')
      rh.className = 'aw-resize-hint'
      rh.title = 'Drag to resize'

      div.appendChild(img)
      div.appendChild(tag)
      div.appendChild(rh)

      // Drag to move
      div.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).classList.contains('aw-resize-hint')) return
        e.preventDefault(); e.stopPropagation()
        setState(s => {
          if (s.calib.active) return s
          const rect = wrap.getBoundingClientRect()
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top
          const sxF = art.xF, syF = art.yF

          function move(ev: MouseEvent) {
            const dx = ev.clientX - rect.left - sx, dy = ev.clientY - rect.top - sy
            const sz2 = dispSize(art, s.scale)
            art.xF = Math.max(0, Math.min(1 - sz2.w / (s.elev?.dispW ?? 1), sxF + dx / (s.elev?.dispW ?? 1)))
            art.yF = Math.max(0, Math.min(1 - sz2.h / (s.elev?.dispH ?? 1), syF + dy / (s.elev?.dispH ?? 1)))
            const el = wrap?.querySelector(`[data-id="${art.id}"]`) as HTMLElement | null
            if (el) {
              el.style.left = (art.xF * (s.elev?.dispW ?? 1)) + 'px'
              el.style.top = (art.yF * (s.elev?.dispH ?? 1)) + 'px'
            }
          }

          function up() {
            document.removeEventListener('mousemove', move)
            document.removeEventListener('mouseup', up)
            setState(st => {
              debounceSave(st)
              return { ...st, artworks: [...st.artworks] }
            })
          }

          document.addEventListener('mousemove', move)
          document.addEventListener('mouseup', up)
          return { ...s, selId: art.id }
        })
      })

      // Click to select
      div.addEventListener('click', (e) => {
        e.stopPropagation()
        setState(s => ({ ...s, selId: art.id }))
      })

      // Resize handle
      rh.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation()
        setState(s => {
          if (!s.scale) return s
          const rect = wrap.getBoundingClientRect()
          const startX = e.clientX - rect.left
          const startW = dispSize(art, s.scale).w

          function move(ev: MouseEvent) {
            const newW = Math.max(20, startW + (ev.clientX - rect.left - startX))
            const ratio = art.hCm / art.wCm
            art.wCm = Math.round((newW / (s.scale?.dispPxPerCm ?? 1)) * 2) / 2
            art.hCm = Math.round(art.wCm * ratio * 2) / 2
            setState(st => {
              renderArtworksDOM(st.artworks, st.elev, st.scale, st.selId ?? undefined)
              return { ...st, artworks: [...st.artworks] }
            })
          }

          function up() {
            document.removeEventListener('mousemove', move)
            document.removeEventListener('mouseup', up)
            setState(st => { debounceSave(st); return st })
          }

          document.addEventListener('mousemove', move)
          document.addEventListener('mouseup', up)
          return s
        })
      })

      wrap.appendChild(div)
    })
  }

  // ─── LOAD OPTION ──────────────────────────────────────────────────
  function loadOption(opts: {
    imageUrl: string | null; imagePath: string | null;
    origW: number; origH: number; scalePxPerCm: number | null;
    zoom: number; artworks: Array<Artwork & { imageUrl: string | null }>;
  }) {
    if (!opts.imageUrl) {
      setState({ elev: null, scale: null, artworks: [], selId: null, zoom: 1, calib: { active: false, drawing: false, start: null, lineDispPx: 0 } })
      return
    }

    const img = new Image()
    img.onload = () => {
      const elev: StudioElev = {
        imagePath: opts.imagePath ?? '',
        imageUrl: opts.imageUrl!,
        img,
        origW: opts.origW || img.naturalWidth,
        origH: opts.origH || img.naturalHeight,
        dispW: 0,
        dispH: 0,
      }
      const scale: Scale | null = opts.scalePxPerCm
        ? { origPxPerCm: opts.scalePxPerCm, dispPxPerCm: opts.scalePxPerCm * opts.zoom }
        : null

      const elevImg = document.getElementById('elev-img') as HTMLImageElement | null
      if (elevImg) elevImg.src = opts.imageUrl!

      const newArts = opts.artworks.map(a => ({ ...a }))

      // Load artwork images
      let loaded = 0
      function tryFinish() {
        if (++loaded >= newArts.length) {
          setState({
            elev, scale, artworks: newArts, selId: null, zoom: opts.zoom,
            calib: { active: false, drawing: false, start: null, lineDispPx: 0 },
          })
          requestAnimationFrame(() => {
            applyZoom(opts.zoom, elev, scale, newArts)
          })
        }
      }

      if (newArts.length === 0) {
        setState({
          elev, scale, artworks: [], selId: null, zoom: opts.zoom,
          calib: { active: false, drawing: false, start: null, lineDispPx: 0 },
        })
        requestAnimationFrame(() => applyZoom(opts.zoom, elev, scale, []))
        return
      }

      newArts.forEach((a, i) => {
        const ai = new Image()
        ai.onload = () => { newArts[i].img = ai; tryFinish() }
        ai.onerror = () => tryFinish()
        if (a.imageUrl) ai.src = a.imageUrl
        else tryFinish()
      })
    }
    img.src = opts.imageUrl
  }

  // ─── ELEVATION UPLOAD ────────────────────────────────────────────
  async function uploadElevation(file: File) {
    const supabase = createClient()
    const path = `${projectId}/${optionId}/elevation-${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('elevation-images').upload(path, file, { upsert: true })
    if (error) { onStatus('Upload failed: ' + error.message); return }

    const { data: signed } = await supabase.storage.from('elevation-images').createSignedUrl(path, 3600)
    const url = signed?.signedUrl
    if (!url) return

    const img = new Image()
    img.onload = () => {
      const elev: StudioElev = {
        imagePath: path, imageUrl: url, img,
        origW: img.naturalWidth, origH: img.naturalHeight, dispW: 0, dispH: 0,
      }
      setState(s => ({ ...s, elev, scale: null, artworks: [], selId: null, zoom: 1 }))

      // Persist to DB
      supabase.from('elevation_options').update({
        image_path: path, orig_w: img.naturalWidth, orig_h: img.naturalHeight,
        scale_px_per_cm: null, zoom: 1,
      }).eq('id', optionId).then(() => {})

      requestAnimationFrame(() => {
        const elevImg = document.getElementById('elev-img') as HTMLImageElement | null
        if (elevImg) elevImg.src = url
        setZoomFit({ elev, scale: null, artworks: [], selId: null, zoom: 1, calib: { active: false, drawing: false, start: null, lineDispPx: 0 } })
      })

      onStatus('Elevation loaded — draw a scale line to continue')
    }
    img.src = url
  }

  // ─── CALIBRATION ─────────────────────────────────────────────────
  function startCalibration() {
    setState(s => ({ ...s, calib: { active: true, drawing: false, start: null, lineDispPx: 0 } }))
    const svg = calibSvgRef.current
    if (svg) svg.classList.add('active')
    hideCalibLine()
    const hint = document.getElementById('calib-hint')
    if (hint) hint.classList.add('show')
  }

  function cancelCalibration() {
    setState(s => ({ ...s, calib: { active: false, drawing: false, start: null, lineDispPx: 0 } }))
    const svg = calibSvgRef.current
    if (svg) svg.classList.remove('active')
    const hint = document.getElementById('calib-hint')
    if (hint) hint.classList.remove('show')
    hideCalibLine()
    setShowScaleModal(false)
  }

  function confirmScale(cm: number) {
    const dispPxPerCm = pendingCalibPx.current / cm
    const origPxPerCm = dispPxPerCm / (state.zoom || 1)
    const scale: Scale = { origPxPerCm, dispPxPerCm }
    setState(s => {
      const newState = { ...s, scale }
      renderArtworksDOM(newState.artworks, newState.elev, scale, newState.selId ?? undefined)
      debounceSave(newState)
      return newState
    })
    setShowScaleModal(false)
    onStatus(`Scale set — 1 cm = ${origPxPerCm.toFixed(2)} px`)
    hideCalibLine()

    // Persist
    const supabase = createClient()
    supabase.from('elevation_options').update({ scale_px_per_cm: origPxPerCm }).eq('id', optionId).then(() => {})
  }

  function onCalibMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    setState(s => {
      if (!s.calib.active) return s
      const p = svgPos(e.nativeEvent)
      setCalibLine(p.x, p.y, p.x, p.y, true)
      return { ...s, calib: { ...s.calib, drawing: true, start: p } }
    })
  }

  function onCalibMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    setState(s => {
      if (!s.calib.active || !s.calib.drawing || !s.calib.start) return s
      const p = svgPos(e.nativeEvent)
      setCalibLine(s.calib.start.x, s.calib.start.y, p.x, p.y, true)
      return s
    })
  }

  function onCalibMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    setState(s => {
      if (!s.calib.active || !s.calib.drawing || !s.calib.start) return s
      const p = svgPos(e.nativeEvent)
      const dx = p.x - s.calib.start.x, dy = p.y - s.calib.start.y
      const lineDispPx = Math.sqrt(dx * dx + dy * dy)
      if (lineDispPx < 15) {
        onStatus('Line too short — try again')
        return { ...s, calib: { ...s.calib, drawing: false } }
      }
      setCalibLine(s.calib.start.x, s.calib.start.y, p.x, p.y, true)
      pendingCalibPx.current = lineDispPx
      const svg = calibSvgRef.current
      if (svg) svg.classList.remove('active')
      const hint = document.getElementById('calib-hint')
      if (hint) hint.classList.remove('show')
      setShowScaleModal(true)
      return { ...s, calib: { ...s.calib, active: false, drawing: false, lineDispPx } }
    })
  }

  function svgPos(e: MouseEvent) {
    const svg = calibSvgRef.current
    if (!svg) return { x: 0, y: 0 }
    const r = svg.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function setCalibLine(x1: number, y1: number, x2: number, y2: number, show: boolean) {
    const d = show ? '' : 'none'
    const ang = Math.atan2(y2 - y1, x2 - x1), perp = ang + Math.PI / 2, cap = 8
    sa('rl-bg', { x1, y1, x2, y2, display: d })
    sa('rl', { x1, y1, x2, y2, display: d })
    sa('rc1', { x1: x1 + Math.cos(perp) * cap, y1: y1 + Math.sin(perp) * cap, x2: x1 - Math.cos(perp) * cap, y2: y1 - Math.sin(perp) * cap, display: d })
    sa('rc2', { x1: x2 + Math.cos(perp) * cap, y1: y2 + Math.sin(perp) * cap, x2: x2 - Math.cos(perp) * cap, y2: y2 - Math.sin(perp) * cap, display: d })
    sa('rd1', { cx: x1, cy: y1, display: d })
    sa('rd2', { cx: x2, cy: y2, display: d })
  }

  function hideCalibLine() {
    ;['rl-bg', 'rl', 'rc1', 'rc2', 'rd1', 'rd2'].forEach(id => sa(id, { display: 'none' }))
  }

  function sa(id: string, attrs: Record<string, string | number>) {
    const el = document.getElementById(id)
    if (!el) return
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)))
  }

  // ─── ADD ARTWORKS ─────────────────────────────────────────────────
  async function addArtworks(files: File[], meta: {
    name: string; wCm: number; hCm: number; price: number; priceIncludes: 'artwork' | 'all'
  }) {
    const supabase = createClient()
    let placed = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const path = `${projectId}/${optionId}/art-${Date.now()}-${i}.${file.name.split('.').pop()}`
      const { error } = await supabase.storage.from('artwork-images').upload(path, file)
      if (error) { onStatus('Upload failed: ' + error.message); continue }

      const { data: signed } = await supabase.storage.from('artwork-images').createSignedUrl(path, 3600)
      const url = signed?.signedUrl
      if (!url) continue

      const name = files.length === 1 ? meta.name || file.name.replace(/\.[^.]+$/, '') : file.name.replace(/\.[^.]+$/, '')
      const off = 0.06 * i

      // Persist artwork
      const { data: artRow } = await supabase.from('artworks').insert({
        option_id: optionId,
        name,
        image_path: path,
        w_cm: meta.wCm,
        h_cm: meta.hCm,
        x_fraction: Math.min(0.08 + off, 0.6),
        y_fraction: Math.min(0.08 + off, 0.6),
        visible: true,
        price: meta.price,
        price_includes: meta.priceIncludes,
        display_order: placed,
      }).select().single()

      if (!artRow) continue

      const img = new Image()
      await new Promise<void>(resolve => {
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = url
      })

      const newArt: Artwork = {
        id: artRow.id,
        name,
        imageUrl: url,
        imagePath: path,
        wCm: meta.wCm,
        hCm: meta.hCm,
        xF: Math.min(0.08 + off, 0.6),
        yF: Math.min(0.08 + off, 0.6),
        visible: true,
        price: meta.price,
        priceIncludes: meta.priceIncludes,
        img,
      }

      setState(s => {
        const newArts = [...s.artworks, newArt]
        renderArtworksDOM(newArts, s.elev, s.scale, s.selId ?? undefined)
        return { ...s, artworks: newArts }
      })
      placed++
    }

    setShowArtModal(false)
    onStatus(placed === 1 ? `Artwork placed — drag to position` : `${placed} artworks placed`)
  }

  // ─── SAVE (debounced) ─────────────────────────────────────────────
  function debounceSave(currentState: StudioState) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => persistOption(currentState), 1500)
  }

  async function persistOption(s: StudioState) {
    const supabase = createClient()
    // Update option zoom
    await supabase.from('elevation_options').update({ zoom: s.zoom }).eq('id', optionId)
    // Update each artwork position/dims
    await Promise.all(
      s.artworks.map(art =>
        supabase.from('artworks').update({
          x_fraction: art.xF,
          y_fraction: art.yF,
          w_cm: art.wCm,
          h_cm: art.hCm,
          visible: art.visible,
          price: art.price,
          price_includes: art.priceIncludes,
        }).eq('id', art.id)
      )
    )
  }

  // ─── DELETE ARTWORK ───────────────────────────────────────────────
  async function deleteArtwork(artId: string) {
    const supabase = createClient()
    await supabase.from('artworks').delete().eq('id', artId)
    setState(s => {
      const newArts = s.artworks.filter(a => a.id !== artId)
      const newSel = s.selId === artId ? null : s.selId
      renderArtworksDOM(newArts, s.elev, s.scale, newSel ?? undefined)
      return { ...s, artworks: newArts, selId: newSel }
    })
  }

  // ─── TOGGLE VISIBILITY ────────────────────────────────────────────
  async function toggleVisibility(artId: string) {
    setState(s => {
      const newArts = s.artworks.map(a => a.id === artId ? { ...a, visible: !a.visible } : a)
      renderArtworksDOM(newArts, s.elev, s.scale, s.selId ?? undefined)
      const supabase = createClient()
      const art = newArts.find(a => a.id === artId)
      if (art) supabase.from('artworks').update({ visible: art.visible }).eq('id', artId).then(() => {})
      return { ...s, artworks: newArts }
    })
  }

  // ─── UPDATE ARTWORK DIMS ─────────────────────────────────────────
  function updateArtworkDims(artId: string, wCm: number, hCm: number) {
    setState(s => {
      const newArts = s.artworks.map(a => a.id === artId ? { ...a, wCm, hCm } : a)
      renderArtworksDOM(newArts, s.elev, s.scale, s.selId ?? undefined)
      debounceSave({ ...s, artworks: newArts })
      return { ...s, artworks: newArts }
    })
  }

  function updateArtworkPrice(artId: string, price: number) {
    setState(s => {
      const newArts = s.artworks.map(a => a.id === artId ? { ...a, price } : a)
      debounceSave({ ...s, artworks: newArts })
      return { ...s, artworks: newArts }
    })
  }

  // ─── SELECT ───────────────────────────────────────────────────────
  function selectArtwork(id: string | null) {
    setState(s => {
      renderArtworksDOM(s.artworks, s.elev, s.scale, id ?? undefined)
      return { ...s, selId: id }
    })
  }

  // ─── EXPORT PNG ──────────────────────────────────────────────────
  async function exportPng() {
    const s = state
    if (!s.elev || !s.scale) { onStatus('Please complete calibration first'); return }
    onStatus('Rendering…')
    const c = document.createElement('canvas')
    c.width = s.elev.origW; c.height = s.elev.origH
    const ctx = c.getContext('2d')!
    ctx.drawImage(s.elev.img, 0, 0)
    s.artworks.forEach(art => {
      if (!art.visible || !art.img || !s.scale) return
      ctx.drawImage(art.img, art.xF * s.elev!.origW, art.yF * s.elev!.origH,
        art.wCm * s.scale.origPxPerCm, art.hCm * s.scale.origPxPerCm)
    })
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'elevation-artwork.png'
    a.click()
    onStatus('PNG exported')
  }

  return {
    state,
    setState,
    elevWrapRef,
    calibSvgRef,
    vpRef,
    showScaleModal,
    setShowScaleModal,
    showArtModal,
    setShowArtModal,
    showShareModal,
    setShowShareModal,
    pendingCalibPx,
    loadOption,
    uploadElevation,
    startCalibration,
    cancelCalibration,
    confirmScale,
    onCalibMouseDown,
    onCalibMouseMove,
    onCalibMouseUp,
    changeZoom,
    setZoomFit,
    addArtworks,
    deleteArtwork,
    toggleVisibility,
    updateArtworkDims,
    updateArtworkPrice,
    selectArtwork,
    renderArtworksDOM,
    exportPng,
    hideCalibLine,
  }
}
