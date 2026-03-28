'use client'

import { useCallback, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Artwork, Scale, CalibState, MaskPoint, ForegroundMasks, MaskDrawState } from '@/types'

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
  selId: string | null       // last selected id (for single-select compat)
  selIds: Set<string>        // all selected ids
  zoom: number
  calib: CalibState
  masks: ForegroundMasks
  maskDraw: MaskDrawState
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4.0

const DEFAULT_CALIB: CalibState = { active: false, drawing: false, start: null, lineDispPx: 0 }
const DEFAULT_MASK_DRAW: MaskDrawState = { active: false, currentPoints: [] }

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
    selIds: new Set<string>(),
    zoom: 1.0,
    calib: DEFAULT_CALIB,
    masks: [],
    maskDraw: DEFAULT_MASK_DRAW,
  })

  // Keep a ref in sync for reading state in non-React event handlers (e.g. mousemove)
  const stateRef = useRef(state)
  stateRef.current = state

  // Refs for imperative canvas DOM (mirrors prototype)
  const elevWrapRef = useRef<HTMLDivElement>(null)
  const calibSvgRef = useRef<SVGSVGElement>(null)
  const fgDrawSvgRef = useRef<SVGSVGElement>(null)
  const vpRef = useRef<HTMLDivElement>(null)

  // Mask draw: hover point tracked in ref to avoid setState on every mousemove
  const maskHoverRef = useRef<MaskPoint | null>(null)

  // Box-select: flag to suppress click-deselect after a successful drag
  const boxSelectedRef = useRef(false)

  // Pending scale modal data
  const pendingCalibPx = useRef(0)
  const [showScaleModal, setShowScaleModal] = useState(false)
  const [showArtModal, setShowArtModal] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  // ─── HELPERS ──────────────────────────────────────────────────────
  function dispSize(art: Artwork, sc: Scale | null): { w: number; h: number } {
    if (!sc) return { w: 80, h: 60 }
    return { w: art.wCm * sc.dispPxPerCm, h: art.hCm * sc.dispPxPerCm }
  }

  // ─── HIGHLIGHT MASK (sidebar hover) ──────────────────────────────
  function highlightMask(index: number | null) {
    const svg = document.getElementById('fg-highlight-svg') as SVGSVGElement | null
    if (!svg) return
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    const s = stateRef.current
    if (index === null || !s.elev) {
      svg.style.display = 'none'
      return
    }

    const polygon = s.masks[index]
    if (!polygon || polygon.length < 3) { svg.style.display = 'none'; return }

    svg.style.display = ''
    svg.setAttribute('width', String(s.elev.dispW))
    svg.setAttribute('height', String(s.elev.dispH))

    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    const pts = polygon.map(p => `${p.x * s.elev!.dispW},${p.y * s.elev!.dispH}`).join(' ')
    poly.setAttribute('points', pts)
    poly.setAttribute('class', 'fg-highlight-poly')
    svg.appendChild(poly)
  }

  // ─── FOREGROUND SVG RENDERING ─────────────────────────────────────
  function renderForegroundSVG(masks: ForegroundMasks, elev: StudioElev | null, imageUrl: string | null) {
    const svg = document.getElementById('fg-svg') as SVGSVGElement | null
    if (!svg) return

    if (!elev || !imageUrl || masks.length === 0) {
      svg.style.display = 'none'
      return
    }

    svg.style.display = ''
    svg.setAttribute('width', String(elev.dispW))
    svg.setAttribute('height', String(elev.dispH))

    const fgImg = document.getElementById('fg-image') as SVGImageElement | null
    if (fgImg) {
      fgImg.setAttribute('width', String(elev.dispW))
      fgImg.setAttribute('height', String(elev.dispH))
      if (fgImg.getAttribute('href') !== imageUrl) {
        fgImg.setAttribute('href', imageUrl)
      }
    }

    const clipPath = document.getElementById('fg-clip')
    if (clipPath) {
      clipPath.innerHTML = ''
      masks.forEach((polygon, i) => {
        if (polygon.length < 3) return
        const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
        poly.id = `fg-poly-${i}`
        const pts = polygon.map(p => `${p.x * elev.dispW},${p.y * elev.dispH}`).join(' ')
        poly.setAttribute('points', pts)
        clipPath.appendChild(poly)
      })
    }
  }

  // ─── DRAW SVG RENDERING ───────────────────────────────────────────
  function renderDrawSVG(
    masks: ForegroundMasks,
    currentPoints: MaskPoint[],
    hoverPoint: MaskPoint | null,
    elev: StudioElev | null
  ) {
    const svg = fgDrawSvgRef.current
    if (!svg || !elev) return

    const W = elev.dispW
    const H = elev.dispH

    function toSvgPt(p: MaskPoint) { return { x: p.x * W, y: p.y * H } }
    function pointsAttr(pts: MaskPoint[]) { return pts.map(p => `${p.x * W},${p.y * H}`).join(' ') }
    function svgEl(tag: string) { return document.createElementNS('http://www.w3.org/2000/svg', tag) }

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild)

    if (currentPoints.length === 0) return

    // Confirmed edges
    for (let i = 1; i < currentPoints.length; i++) {
      const a = toSvgPt(currentPoints[i - 1])
      const b = toSvgPt(currentPoints[i])
      const line = svgEl('line')
      line.setAttribute('x1', String(a.x)); line.setAttribute('y1', String(a.y))
      line.setAttribute('x2', String(b.x)); line.setAttribute('y2', String(b.y))
      line.setAttribute('class', 'fg-draw-line')
      svg.appendChild(line)
    }

    // Live preview line from last point to cursor
    if (hoverPoint && currentPoints.length > 0) {
      const last = toSvgPt(currentPoints[currentPoints.length - 1])
      const hover = toSvgPt(hoverPoint)
      const preview = svgEl('line')
      preview.setAttribute('x1', String(last.x)); preview.setAttribute('y1', String(last.y))
      preview.setAttribute('x2', String(hover.x)); preview.setAttribute('y2', String(hover.y))
      preview.setAttribute('class', 'fg-draw-line')
      svg.appendChild(preview)
    }

    // Confirmed point dots
    currentPoints.forEach((p, i) => {
      const { x, y } = toSvgPt(p)

      // Close-hint ring around first point when ≥3 points placed
      if (i === 0 && currentPoints.length >= 3) {
        const ring = svgEl('circle')
        ring.setAttribute('cx', String(x)); ring.setAttribute('cy', String(y))
        ring.setAttribute('r', '11')
        ring.setAttribute('class', 'fg-close-hint')
        svg.appendChild(ring)
      }

      const dot = svgEl('circle')
      dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y))
      dot.setAttribute('r', '5')
      dot.setAttribute('class', 'fg-draw-dot')
      svg.appendChild(dot)
    })
  }

  // ─── ZOOM ──────────────────────────────────────────────────────────
  const applyZoom = useCallback((
    zoom: number,
    elev: StudioElev,
    scale: Scale | null,
    artworks: Artwork[],
    masks?: ForegroundMasks
  ) => {
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
    renderForegroundSVG(masks ?? [], elev, elev.imageUrl)

    // Resize draw + highlight SVGs and re-render draw contents at new scale
    const drawSvg = document.getElementById('fg-draw-svg') as SVGSVGElement | null
    if (drawSvg) {
      drawSvg.setAttribute('width', String(dW))
      drawSvg.setAttribute('height', String(dH))
    }
    // Clear highlight on zoom — user can re-hover to see it again at new scale
    const highlightSvg = document.getElementById('fg-highlight-svg') as SVGSVGElement | null
    if (highlightSvg) {
      highlightSvg.style.display = 'none'
      while (highlightSvg.firstChild) highlightSvg.removeChild(highlightSvg.firstChild)
    }
    renderDrawSVG(
      masks ?? [],
      stateRef.current.maskDraw.currentPoints,
      maskHoverRef.current,
      elev
    )

    return newScale
  }, []) // eslint-disable-line

  function changeZoom(delta: number, currentState: StudioState) {
    if (!currentState.elev) return
    const vp = vpRef.current
    const xf = vp ? (vp.scrollLeft + vp.clientWidth / 2) / vp.scrollWidth : 0.5
    const yf = vp ? (vp.scrollTop + vp.clientHeight / 2) / vp.scrollHeight : 0.5
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((currentState.zoom + delta) * 10) / 10))
    const newElev = { ...currentState.elev }
    const newScale = applyZoom(newZoom, newElev, currentState.scale, currentState.artworks, currentState.masks)
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
    const newScale = applyZoom(newZoom, newElev, currentState.scale, currentState.artworks, currentState.masks)
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
  function renderArtworksDOM(artworks: Artwork[], elev: StudioElev | null, sc: Scale | null, selIds?: Set<string>) {
    const wrap = elevWrapRef.current
    if (!wrap || !elev) return
    wrap.querySelectorAll('.aw-overlay').forEach(el => el.remove())

    artworks.forEach(art => {
      if (!art.visible) return
      const sz = dispSize(art, sc)
      const x = art.xF * elev.dispW
      const y = art.yF * elev.dispH

      const div = document.createElement('div')
      div.className = 'aw-overlay' + (selIds?.has(art.id) ? ' selected' : '')
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

      // Drag to move (multi-select aware)
      div.addEventListener('mousedown', (e) => {
        if ((e.target as HTMLElement).classList.contains('aw-resize-hint')) return
        e.preventDefault(); e.stopPropagation()
        setState(s => {
          if (s.calib.active || s.maskDraw.active) return s

          // Determine new selection
          let newSelIds: Set<string>
          if (e.shiftKey) {
            // Shift+click: toggle this artwork in/out of selection
            newSelIds = new Set(s.selIds)
            if (newSelIds.has(art.id)) newSelIds.delete(art.id)
            else newSelIds.add(art.id)
          } else if (s.selIds.has(art.id) && s.selIds.size > 1) {
            // Clicking a selected artwork in a multi-selection: keep the group
            newSelIds = s.selIds
          } else {
            // Regular click: select only this artwork
            newSelIds = new Set([art.id])
          }

          const rect = wrap.getBoundingClientRect()
          const sx = e.clientX - rect.left, sy = e.clientY - rect.top

          // Store starting positions for all selected artworks
          const startPositions = new Map<string, { xF: number; yF: number }>()
          stateRef.current.artworks.forEach(a => {
            if (newSelIds.has(a.id)) startPositions.set(a.id, { xF: a.xF, yF: a.yF })
          })

          const SNAP_PX = 8

          function renderSnapGuides(xLines: number[], yLines: number[]) {
            const svg = document.getElementById('snap-svg') as SVGSVGElement | null
            if (!svg) return
            const elevW = stateRef.current.elev?.dispW ?? 1
            const elevH = stateRef.current.elev?.dispH ?? 1
            svg.innerHTML = ''
            if (xLines.length === 0 && yLines.length === 0) { svg.style.display = 'none'; return }
            svg.setAttribute('width', String(elevW))
            svg.setAttribute('height', String(elevH))
            svg.style.display = ''
            xLines.forEach(x => {
              const l = document.createElementNS('http://www.w3.org/2000/svg', 'line')
              l.setAttribute('x1', String(x)); l.setAttribute('y1', '0')
              l.setAttribute('x2', String(x)); l.setAttribute('y2', String(elevH))
              l.setAttribute('stroke', 'var(--accent)'); l.setAttribute('stroke-width', '1')
              l.setAttribute('stroke-dasharray', '4 3'); svg.appendChild(l)
            })
            yLines.forEach(y => {
              const l = document.createElementNS('http://www.w3.org/2000/svg', 'line')
              l.setAttribute('x1', '0'); l.setAttribute('y1', String(y))
              l.setAttribute('x2', String(elevW)); l.setAttribute('y2', String(y))
              l.setAttribute('stroke', 'var(--accent)'); l.setAttribute('stroke-width', '1')
              l.setAttribute('stroke-dasharray', '4 3'); svg.appendChild(l)
            })
          }

          function move(ev: MouseEvent) {
            const dx = ev.clientX - rect.left - sx, dy = ev.clientY - rect.top - sy
            const elevW = stateRef.current.elev?.dispW ?? 1
            const elevH = stateRef.current.elev?.dispH ?? 1
            const snapXLines: number[] = [], snapYLines: number[] = []

            stateRef.current.artworks.forEach(a => {
              if (!newSelIds.has(a.id)) return
              const start = startPositions.get(a.id)
              if (!start) return
              const sz2 = dispSize(a, stateRef.current.scale)
              let rawXF = Math.max(0, Math.min(1 - sz2.w / elevW, start.xF + dx / elevW))
              let rawYF = Math.max(0, Math.min(1 - sz2.h / elevH, start.yF + dy / elevH))

              // Snap: compute candidate edge/center positions for this artwork
              const rawLeft = rawXF * elevW, rawRight = rawLeft + sz2.w, rawCenterX = rawLeft + sz2.w / 2
              const rawTop = rawYF * elevH, rawBottom = rawTop + sz2.h, rawCenterY = rawTop + sz2.h / 2

              // Check against non-selected artworks
              stateRef.current.artworks.forEach(other => {
                if (newSelIds.has(other.id)) return
                const osz = dispSize(other, stateRef.current.scale)
                const oLeft = other.xF * elevW, oRight = oLeft + osz.w, oCenterX = oLeft + osz.w / 2
                const oTop = other.yF * elevH, oBottom = oTop + osz.h, oCenterY = oTop + osz.h / 2

                const xCandidates: Array<[number, number]> = [
                  [rawLeft, oLeft], [rawLeft, oRight], [rawLeft, oCenterX],
                  [rawRight, oLeft], [rawRight, oRight], [rawRight, oCenterX],
                  [rawCenterX, oLeft], [rawCenterX, oRight], [rawCenterX, oCenterX],
                ]
                for (const [myEdge, otherEdge] of xCandidates) {
                  if (Math.abs(myEdge - otherEdge) < SNAP_PX) {
                    rawXF = (otherEdge - (myEdge - rawLeft)) / elevW
                    snapXLines.push(otherEdge)
                    break
                  }
                }
                const yCandidates: Array<[number, number]> = [
                  [rawTop, oTop], [rawTop, oBottom], [rawTop, oCenterY],
                  [rawBottom, oTop], [rawBottom, oBottom], [rawBottom, oCenterY],
                  [rawCenterY, oTop], [rawCenterY, oBottom], [rawCenterY, oCenterY],
                ]
                for (const [myEdge, otherEdge] of yCandidates) {
                  if (Math.abs(myEdge - otherEdge) < SNAP_PX) {
                    rawYF = (otherEdge - (myEdge - rawTop)) / elevH
                    snapYLines.push(otherEdge)
                    break
                  }
                }
              })

              a.xF = Math.max(0, Math.min(1 - sz2.w / elevW, rawXF))
              a.yF = Math.max(0, Math.min(1 - sz2.h / elevH, rawYF))
              const el = wrap?.querySelector(`[data-id="${a.id}"]`) as HTMLElement | null
              if (el) {
                el.style.left = (a.xF * elevW) + 'px'
                el.style.top = (a.yF * elevH) + 'px'
              }
            })
            renderSnapGuides([...new Set(snapXLines)], [...new Set(snapYLines)])
          }

          function up() {
            document.removeEventListener('mousemove', move)
            document.removeEventListener('mouseup', up)
            // Clear snap guides
            const svg = document.getElementById('snap-svg') as SVGSVGElement | null
            if (svg) { svg.innerHTML = ''; svg.style.display = 'none' }
            setState(st => {
              debounceSave(st)
              return { ...st, artworks: [...st.artworks] }
            })
          }

          document.addEventListener('mousemove', move)
          document.addEventListener('mouseup', up)
          return { ...s, selId: art.id, selIds: newSelIds }
        })
      })

      // Touch drag to move — single artwork only
      div.addEventListener('touchstart', (e) => {
        if ((e.target as HTMLElement).classList.contains('aw-resize-hint')) return
        e.stopPropagation()
        const s = stateRef.current
        if (s.calib.active || s.maskDraw.active) return

        const t0 = e.touches[0]
        const rect = wrap.getBoundingClientRect()
        const sx = t0.clientX - rect.left, sy = t0.clientY - rect.top
        const startXF = art.xF, startYF = art.yF

        function move(ev: TouchEvent) {
          ev.preventDefault()
          const t = ev.touches[0]
          const dx = t.clientX - rect.left - sx, dy = t.clientY - rect.top - sy
          const elevW = stateRef.current.elev?.dispW ?? 1
          const elevH = stateRef.current.elev?.dispH ?? 1
          const sz2 = dispSize(art, stateRef.current.scale)
          art.xF = Math.max(0, Math.min(1 - sz2.w / elevW, startXF + dx / elevW))
          art.yF = Math.max(0, Math.min(1 - sz2.h / elevH, startYF + dy / elevH))
          div.style.left = (art.xF * elevW) + 'px'
          div.style.top = (art.yF * elevH) + 'px'
        }

        function up() {
          document.removeEventListener('touchmove', move)
          document.removeEventListener('touchend', up)
          setState(st => { debounceSave(st); return { ...st, artworks: [...st.artworks] } })
        }

        document.addEventListener('touchmove', move, { passive: false })
        document.addEventListener('touchend', up)
      }, { passive: true })

      // Click to select (shift for multi-select)
      div.addEventListener('click', (e) => {
        e.stopPropagation()
        setState(s => {
          if (e.shiftKey) {
            const newSelIds = new Set(s.selIds)
            if (newSelIds.has(art.id)) newSelIds.delete(art.id)
            else newSelIds.add(art.id)
            return { ...s, selId: art.id, selIds: newSelIds }
          }
          return { ...s, selId: art.id, selIds: new Set([art.id]) }
        })
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
              renderArtworksDOM(st.artworks, st.elev, st.scale, st.selIds)
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
    foregroundMasks: ForegroundMasks | null;
  }) {
    if (!opts.imageUrl) {
      setState({ elev: null, scale: null, artworks: [], selId: null, selIds: new Set(), zoom: 1, calib: DEFAULT_CALIB, masks: [], maskDraw: DEFAULT_MASK_DRAW })
      renderForegroundSVG([], null, null)
      return
    }

    const img = new Image()
    img.crossOrigin = 'anonymous'
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

      const masks = opts.foregroundMasks ?? []
      const newArts = opts.artworks.map(a => ({ ...a }))

      // Load artwork images
      let loaded = 0
      function tryFinish() {
        if (++loaded >= newArts.length) {
          setState({
            elev, scale, artworks: newArts, selId: null, selIds: new Set(), zoom: opts.zoom,
            calib: DEFAULT_CALIB, masks, maskDraw: DEFAULT_MASK_DRAW,
          })
          requestAnimationFrame(() => {
            applyZoom(opts.zoom, elev, scale, newArts, masks)
          })
        }
      }

      if (newArts.length === 0) {
        setState({
          elev, scale, artworks: [], selId: null, selIds: new Set(), zoom: opts.zoom,
          calib: DEFAULT_CALIB, masks, maskDraw: DEFAULT_MASK_DRAW,
        })
        requestAnimationFrame(() => applyZoom(opts.zoom, elev, scale, [], masks))
        return
      }

      newArts.forEach((a, i) => {
        const ai = new Image()
        ai.crossOrigin = 'anonymous'
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
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const elev: StudioElev = {
        imagePath: path, imageUrl: url, img,
        origW: img.naturalWidth, origH: img.naturalHeight, dispW: 0, dispH: 0,
      }
      setState(s => ({ ...s, elev, scale: null, artworks: [], selId: null, selIds: new Set(), zoom: 1, masks: [], maskDraw: DEFAULT_MASK_DRAW }))
      renderForegroundSVG([], null, null)

      // Persist to DB
      supabase.from('elevation_options').update({
        image_path: path, orig_w: img.naturalWidth, orig_h: img.naturalHeight,
        scale_px_per_cm: null, zoom: 1, foreground_masks: null,
      }).eq('id', optionId).then(() => {})

      requestAnimationFrame(() => {
        const elevImg = document.getElementById('elev-img') as HTMLImageElement | null
        if (elevImg) elevImg.src = url
        setZoomFit({ elev, scale: null, artworks: [], selId: null, selIds: new Set(), zoom: 1, calib: DEFAULT_CALIB, masks: [], maskDraw: DEFAULT_MASK_DRAW })
      })

      onStatus('Elevation loaded — draw a scale line to continue')
    }
    img.src = url
  }

  // ─── CALIBRATION ─────────────────────────────────────────────────
  function startCalibration() {
    if (stateRef.current.maskDraw.active) return // mutually exclusive
    setState(s => ({ ...s, calib: { active: true, drawing: false, start: null, lineDispPx: 0 } }))
    const svg = calibSvgRef.current
    if (svg) svg.classList.add('active')
    hideCalibLine()
    const hint = document.getElementById('calib-hint')
    if (hint) hint.classList.add('show')
  }

  function cancelCalibration() {
    setState(s => ({ ...s, calib: DEFAULT_CALIB }))
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
      renderArtworksDOM(newState.artworks, newState.elev, scale, newState.selIds)
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

  // ─── MASK DRAWING ─────────────────────────────────────────────────

  function getMaskSvgPoint(e: React.MouseEvent<SVGSVGElement>): MaskPoint | null {
    const svg = fgDrawSvgRef.current
    const elev = stateRef.current.elev
    if (!svg || !elev) return null
    const r = svg.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / elev.dispW)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / elev.dispH)),
    }
  }

  function startMaskDraw() {
    if (stateRef.current.calib.active) return // mutually exclusive
    setState(s => ({ ...s, maskDraw: { active: true, currentPoints: [] } }))
    const svg = fgDrawSvgRef.current
    if (svg) svg.classList.add('active')
    const hint = document.getElementById('mask-hint')
    if (hint) hint.classList.add('show')
  }

  function finishMaskDraw() {
    setState(s => {
      // If there's an in-progress polygon with ≥3 points, commit it
      let masks = s.masks
      if (s.maskDraw.currentPoints.length >= 3) {
        masks = [...s.masks, s.maskDraw.currentPoints]
        renderForegroundSVG(masks, s.elev, s.elev?.imageUrl ?? null)
      }
      debounceSave({ ...s, masks })
      renderDrawSVG(masks, [], null, s.elev)
      return { ...s, masks, maskDraw: DEFAULT_MASK_DRAW }
    })
    const svg = fgDrawSvgRef.current
    if (svg) svg.classList.remove('active')
    const hint = document.getElementById('mask-hint')
    if (hint) hint.classList.remove('show')
    maskHoverRef.current = null
  }

  function cancelMaskDraw() {
    setState(s => {
      renderDrawSVG(s.masks, [], null, s.elev)
      return { ...s, maskDraw: DEFAULT_MASK_DRAW }
    })
    const svg = fgDrawSvgRef.current
    if (svg) svg.classList.remove('active')
    const hint = document.getElementById('mask-hint')
    if (hint) hint.classList.remove('show')
    maskHoverRef.current = null
  }

  function clearCurrentPoints() {
    setState(s => {
      renderDrawSVG(s.masks, [], maskHoverRef.current, s.elev)
      return { ...s, maskDraw: { ...s.maskDraw, currentPoints: [] } }
    })
  }

  function onMaskMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const s = stateRef.current
    if (!s.maskDraw.active || !s.elev) return
    const pt = getMaskSvgPoint(e)
    if (!pt) return
    maskHoverRef.current = pt
    renderDrawSVG(s.masks, s.maskDraw.currentPoints, pt, s.elev)
  }

  function onMaskClick(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault()
    e.stopPropagation()
    setState(s => {
      if (!s.maskDraw.active || !s.elev) return s
      const svg = fgDrawSvgRef.current
      if (!svg) return s
      const r = svg.getBoundingClientRect()
      const pt: MaskPoint = {
        x: Math.max(0, Math.min(1, (e.clientX - r.left) / s.elev.dispW)),
        y: Math.max(0, Math.min(1, (e.clientY - r.top) / s.elev.dispH)),
      }
      const pts = s.maskDraw.currentPoints

      // Snap-to-close: if ≥3 points and click is within 8px of first point, commit polygon
      if (pts.length >= 3) {
        const first = pts[0]
        const dx = (pt.x - first.x) * s.elev.dispW
        const dy = (pt.y - first.y) * s.elev.dispH
        if (Math.sqrt(dx * dx + dy * dy) < 12) {
          const masks = [...s.masks, pts]
          renderForegroundSVG(masks, s.elev, s.elev.imageUrl)
          renderDrawSVG(masks, [], maskHoverRef.current, s.elev)
          debounceSave({ ...s, masks })
          return { ...s, masks, maskDraw: { ...s.maskDraw, currentPoints: [] } }
        }
      }

      const newPts = [...pts, pt]
      renderDrawSVG(s.masks, newPts, maskHoverRef.current, s.elev)
      return { ...s, maskDraw: { ...s.maskDraw, currentPoints: newPts } }
    })
  }

  function onMaskDblClick(e: React.MouseEvent<SVGSVGElement>) {
    e.preventDefault()
    e.stopPropagation()
    setState(s => {
      if (!s.maskDraw.active || !s.elev) return s
      // Remove last point (added by the second click of the dblclick)
      const pts = s.maskDraw.currentPoints.slice(0, -1)
      if (pts.length < 3) {
        onStatus('Draw at least 3 points to close a shape')
        renderDrawSVG(s.masks, pts, maskHoverRef.current, s.elev)
        return { ...s, maskDraw: { ...s.maskDraw, currentPoints: pts } }
      }
      const masks = [...s.masks, pts]
      renderForegroundSVG(masks, s.elev, s.elev.imageUrl)
      renderDrawSVG(masks, [], maskHoverRef.current, s.elev)
      debounceSave({ ...s, masks })
      return { ...s, masks, maskDraw: { ...s.maskDraw, currentPoints: [] } }
    })
  }

  function deletePolygon(index: number) {
    setState(s => {
      const masks = s.masks.filter((_, i) => i !== index)
      renderForegroundSVG(masks, s.elev, s.elev?.imageUrl ?? null)
      renderDrawSVG(masks, s.maskDraw.currentPoints, maskHoverRef.current, s.elev)
      debounceSave({ ...s, masks })
      return { ...s, masks }
    })
  }

  function clearAllMasks() {
    setState(s => {
      renderForegroundSVG([], s.elev, s.elev?.imageUrl ?? null)
      renderDrawSVG([], s.maskDraw.currentPoints, maskHoverRef.current, s.elev)
      debounceSave({ ...s, masks: [] })
      return { ...s, masks: [] }
    })
  }

  // ─── ADD ARTWORKS ─────────────────────────────────────────────────
  async function addArtworks(files: File[], metas: Array<{
    name: string; wCm: number; hCm: number; price: number; priceIncludes: 'artwork' | 'all'
  }>) {
    const supabase = createClient()
    let completed = 0
    const total = files.length

    const results = await Promise.all(files.map(async (file, i) => {
      const meta = metas[i] ?? metas[0]
      const path = `${projectId}/${optionId}/art-${crypto.randomUUID()}.${file.name.split('.').pop()}`
      const { error } = await supabase.storage.from('artwork-images').upload(path, file)
      if (error) { onStatus('Upload failed: ' + error.message); return null }

      const { data: signed } = await supabase.storage.from('artwork-images').createSignedUrl(path, 3600)
      const url = signed?.signedUrl
      if (!url) return null

      const name = meta.name || file.name.replace(/\.[^.]+$/, '')
      const off = 0.06 * i

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
        display_order: i,
      }).select().single()

      if (!artRow) return null

      const img = new Image()
      img.crossOrigin = 'anonymous'
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

      completed++
      if (total > 1) onStatus(`Uploaded ${completed} of ${total}…`)

      return newArt
    }))

    const placed = results.filter((a): a is Artwork => a !== null)
    setState(s => {
      const newArts = [...s.artworks, ...placed]
      renderArtworksDOM(newArts, s.elev, s.scale, s.selIds)
      return { ...s, artworks: newArts }
    })

    setShowArtModal(false)
    onStatus(placed.length === 1 ? `Artwork placed — drag to position` : `${placed.length} artworks placed`)
  }

  // ─── SAVE (debounced) ─────────────────────────────────────────────
  function debounceSave(currentState: StudioState) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaveStatus('saving')
    saveTimer.current = setTimeout(() => persistOption(currentState), 1500)
  }

  async function persistOption(s: StudioState) {
    const supabase = createClient()
    try {
      // Update option zoom and foreground masks
      await supabase.from('elevation_options').update({
        zoom: s.zoom,
        foreground_masks: s.masks.length > 0 ? s.masks : null,
      }).eq('id', optionId)
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
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 5000)
    }
  }

  // ─── DELETE ARTWORK ───────────────────────────────────────────────
  async function deleteArtwork(artId: string) {
    const supabase = createClient()
    await supabase.from('artworks').delete().eq('id', artId)
    setState(s => {
      const newArts = s.artworks.filter(a => a.id !== artId)
      const newSelIds = new Set(s.selIds)
      newSelIds.delete(artId)
      const newSelId = s.selId === artId ? null : s.selId
      renderArtworksDOM(newArts, s.elev, s.scale, newSelIds)
      return { ...s, artworks: newArts, selId: newSelId, selIds: newSelIds }
    })
  }

  // ─── TOGGLE VISIBILITY ────────────────────────────────────────────
  async function toggleVisibility(artId: string) {
    setState(s => {
      const newArts = s.artworks.map(a => a.id === artId ? { ...a, visible: !a.visible } : a)
      renderArtworksDOM(newArts, s.elev, s.scale, s.selIds)
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
      renderArtworksDOM(newArts, s.elev, s.scale, s.selIds)
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
      const newSelIds = id ? new Set([id]) : new Set<string>()
      renderArtworksDOM(s.artworks, s.elev, s.scale, newSelIds)
      return { ...s, selId: id, selIds: newSelIds }
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

    // 1. Draw base elevation
    ctx.drawImage(s.elev.img, 0, 0)

    // 2. Draw artworks
    s.artworks.forEach(art => {
      if (!art.visible || !art.img || !s.scale) return
      ctx.drawImage(art.img, art.xF * s.elev!.origW, art.yF * s.elev!.origH,
        art.wCm * s.scale.origPxPerCm, art.hCm * s.scale.origPxPerCm)
    })

    // 3. Composite foreground layer (elevation painted again, clipped to mask polygons)
    if (s.masks.length > 0) {
      ctx.save()
      ctx.beginPath()
      s.masks.forEach(polygon => {
        if (polygon.length < 3) return
        ctx.moveTo(polygon[0].x * s.elev!.origW, polygon[0].y * s.elev!.origH)
        polygon.slice(1).forEach(pt => ctx.lineTo(pt.x * s.elev!.origW, pt.y * s.elev!.origH))
        ctx.closePath()
      })
      ctx.clip()
      ctx.drawImage(s.elev.img, 0, 0, s.elev.origW, s.elev.origH)
      ctx.restore()
    }

    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = 'elevation-artwork.png'
    a.click()
    onStatus('PNG exported')
  }

  // ─── BOX SELECT (rubber-band drag on canvas background) ──────────
  function onWrapMouseDown(e: React.MouseEvent) {
    const s = stateRef.current
    if (s.calib.active || s.maskDraw.active) return
    const target = e.target as HTMLElement
    // Only act on clicks directly on the elevation image or the wrap background — not on artwork overlays
    if (target.id !== 'elev-img' && target !== elevWrapRef.current) return

    e.preventDefault()
    const wrap = elevWrapRef.current!
    const wrapRect = wrap.getBoundingClientRect()
    const startX = e.clientX - wrapRect.left
    const startY = e.clientY - wrapRect.top

    // Create selection rect element
    const rectEl = document.createElement('div')
    rectEl.style.cssText = 'position:absolute;border:1px dashed var(--accent);background:rgba(139,111,71,.06);pointer-events:none;z-index:200;box-sizing:border-box'
    rectEl.style.left = startX + 'px'
    rectEl.style.top = startY + 'px'
    rectEl.style.width = '0px'
    rectEl.style.height = '0px'
    wrap.appendChild(rectEl)

    let didDrag = false

    function move(ev: MouseEvent) {
      didDrag = true
      const cx = ev.clientX - wrapRect.left
      const cy = ev.clientY - wrapRect.top
      const l = Math.min(startX, cx), t = Math.min(startY, cy)
      rectEl.style.left = l + 'px'
      rectEl.style.top = t + 'px'
      rectEl.style.width = Math.abs(cx - startX) + 'px'
      rectEl.style.height = Math.abs(cy - startY) + 'px'
    }

    function up(ev: MouseEvent) {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      rectEl.remove()

      if (!didDrag) return

      const cx = ev.clientX - wrapRect.left
      const cy = ev.clientY - wrapRect.top
      const selL = Math.min(startX, cx), selT = Math.min(startY, cy)
      const selR = Math.max(startX, cx), selB = Math.max(startY, cy)
      if (selR - selL < 4 || selB - selT < 4) return

      const cur = stateRef.current
      if (!cur.elev) return

      const matched = new Set<string>()
      cur.artworks.forEach(a => {
        if (!a.visible) return
        const sz = dispSize(a, cur.scale)
        const aL = a.xF * cur.elev!.dispW
        const aT = a.yF * cur.elev!.dispH
        if (aL + sz.w > selL && aL < selR && aT + sz.h > selT && aT < selB) {
          matched.add(a.id)
        }
      })

      if (matched.size > 0) {
        boxSelectedRef.current = true
        setTimeout(() => { boxSelectedRef.current = false }, 100)
        setState(s => ({ ...s, selIds: matched }))
        renderArtworksDOM(cur.artworks, cur.elev, cur.scale, matched)
      }
    }

    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return {
    state,
    setState,
    elevWrapRef,
    calibSvgRef,
    fgDrawSvgRef,
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
    startMaskDraw,
    finishMaskDraw,
    cancelMaskDraw,
    clearCurrentPoints,
    onMaskMouseMove,
    onMaskClick,
    onMaskDblClick,
    deletePolygon,
    clearAllMasks,
    highlightMask,
    saveStatus,
    onWrapMouseDown,
    boxSelectedRef,
  }
}
