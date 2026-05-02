'use client'

import { useRef, useEffect, useState } from 'react'
import { formatPrice, formatApprovalTimestamp } from '@/lib/utils'
import { wallQuadToSkewMatrix } from '@/lib/homography'
import { ArcSpinner } from '@/components/ui/Spinner'

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
  frameType?: string | null
  frameWidthMm?: number | null
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

interface Props {
  optData: ClientOption
  elevationName: string
  activeOpt: string
  projectId: string
  rerenderKey: number
  approvalActivity: Array<{ id: string; type: string; text: string; created_at: string }>
  clientBudget: number | null
  /** Whether the client has already picked an option for this elevation */
  isPicked: boolean
  /** Whether artwork dragging should be locked (approved, or already picked on a multi-option elevation) */
  artworksLocked: boolean
  onPick: (opt: string) => void
  /** When defined, a "Change selection" button is shown in Stage 2 */
  onClearPick?: () => void
  zoom: number
  onZoom: (val: number | ((prev: number) => number)) => void
  onArtworkMove: (artId: string, xF: number, yF: number) => void
  onToggleVisibility: (artId: string) => void
  onNotesChange: (notes: string) => void
  onApprove: () => void
}

export default function ClientElevation({
  optData, elevationName, activeOpt, rerenderKey,
  approvalActivity, clientBudget, isPicked, artworksLocked, onPick, onClearPick,
  zoom, onZoom,
  onArtworkMove, onToggleVisibility, onNotesChange, onApprove,
}: Props) {
  const [showApproveWarning, setShowApproveWarning] = useState(false)
  // Bumped on Fit click to re-measure the viewport and re-fit the elevation
  // (parity with consultant `setZoomFit`, which recomputes fit on every click).
  const [refitKey, setRefitKey] = useState(0)

  const visibleArts = optData.artworks.filter(a => a.visible)
  const totalCost = visibleArts.filter(a => a.price).reduce((s, a) => s + a.price, 0)
  const budgetPct = clientBudget && clientBudget > 0 && totalCost > 0
    ? (totalCost / clientBudget) * 100
    : null

  function handleApproveClick() {
    setShowApproveWarning(true)
  }

  function handleApproveConfirm() {
    setShowApproveWarning(false)
    onApprove()
  }

  return (
    <div className="client-main">
      {/* Canvas */}
      <div className="client-canvas-wrap">
        <div className="client-canvas-area">
          <ClientCanvas
            optData={optData}
            rerenderKey={rerenderKey}
            refitKey={refitKey}
            locked={artworksLocked}
            onArtworkMove={onArtworkMove}
            zoom={zoom}
          />
        </div>
        {/* Zoom controls — pinned to bottom-right of visible canvas frame */}
        <div className="client-zoom-controls">
          <button
            className="client-zoom-btn"
            onClick={() => onZoom(z => Math.max(0.1, +(z - 0.1).toFixed(2)))}
            title="Zoom out"
          >−</button>
          <span className="client-zoom-label">{Math.round(zoom * 100)}%</span>
          <button
            className="client-zoom-btn"
            onClick={() => onZoom(z => Math.min(5.0, +(z + 0.1).toFixed(2)))}
            title="Zoom in"
          >+</button>
          <button
            className="client-zoom-btn"
            style={{ fontSize: 10, width: 32, letterSpacing: 0.5 }}
            onClick={() => { setRefitKey(k => k + 1); onZoom(1.0) }}
            title="Fit to viewport"
          >Fit</button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="client-sidebar">
        <div className="client-sidebar-scroll">
          {/* Option / elevation label */}
          <div className="client-sidebar-section">
            <div className="client-sidebar-kicker">Option {activeOpt}</div>
            <div className="client-sidebar-elev-name">{elevationName}</div>
          </div>

          {/* Artwork list */}
          <div className="client-sidebar-section">
              <div className="client-sidebar-kicker">Artworks</div>
              {optData.artworks.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--mid)' }}>No artworks placed</div>
              ) : (
                <div>
                  {optData.artworks.map(art => (
                    <div key={art.id} className="client-art-row">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {art.imageUrl && <img className="client-art-thumb" src={art.imageUrl} alt={art.name} />}
                      <div className="client-art-info">
                        <div className="client-art-name">{art.name}</div>
                        <div className="client-art-dims">{art.wCm} × {art.hCm} cm</div>
                      </div>
                      <button
                        className={`client-art-eye${art.visible ? '' : ' hidden-art'}`}
                        title={art.visible ? 'Hide artwork' : 'Show artwork'}
                        onClick={() => onToggleVisibility(art.id)}
                        disabled={optData.approved}
                      >
                        {art.visible ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                    </div>
                  ))}
                </div>
              )}

          </div>

          {/* Notes */}
          <div className="client-sidebar-section">
            <div className="client-sidebar-kicker">Notes for Christian &amp; Kwan</div>
            <textarea
              className="client-notes-textarea"
              value={optData.clientNotes ?? ''}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Add any notes, questions or requests here…"
              disabled={optData.approved}
            />
            {optData.approved && (
              <div className="client-notes-hint">This elevation is approved and locked</div>
            )}
          </div>

          {/* Approval section — scrolls with the rest of the sidebar */}
          <div className="client-approval-section">
          {optData.approved ? (
            /* ── Stage 3: Approved ── */
            <div className="approval-status-bar approved" style={{ margin: '0 0 12px' }}>
              <div className="approval-status-icon">✓</div>
              <div>
                <div className="approval-status-text" style={{ color: 'var(--green)' }}>
                  Option {activeOpt} approved
                </div>
                <div className="approval-status-sub">Approved {formatApprovalTimestamp(optData.approved_at)}</div>
              </div>
            </div>
          ) : !isPicked ? (
            /* ── Stage 1: Pick ── */
            <div className="client-pick-panel">
              <div className="client-pick-title">Choose your option</div>
              <div className="client-pick-hint">
                Compare both options using the tabs above, then lock in your choice.
              </div>
              {totalCost > 0 && (
                <div className="approval-total-section" style={{ marginBottom: 12 }}>
                  {visibleArts.filter(a => a.price).map(a => (
                    <div key={a.id} className="approval-total-row">
                      <span>{a.name}</span>
                      <span className="amount">{formatPrice(a.price)}</span>
                    </div>
                  ))}
                  <div className="approval-total-row total">
                    <span>Total</span>
                    <span className="amount">{formatPrice(totalCost)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 6 }}>Prices exclude VAT.</div>
                  {budgetPct !== null && (
                    <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
                      {budgetPct.toFixed(1)}% of project budget
                    </div>
                  )}
                </div>
              )}
              <button
                className="btn btn-primary btn-sm btn-full"
                onClick={() => onPick(activeOpt)}
              >
                Pick Option {activeOpt}
              </button>
            </div>
          ) : (
            /* ── Stage 2: Picked, awaiting approval ── */
            <>
              <div className="approval-status-bar pending" style={{ margin: '0 0 12px' }}>
                <div className="approval-status-icon">◌</div>
                <div>
                  <div className="approval-status-text">Option {activeOpt} selected</div>
                  <div className="approval-status-sub">Adjust artworks, then approve when ready</div>
                </div>
              </div>

              {/* Cost total */}
              {totalCost > 0 && (
                <div className="approval-total-section" style={{ marginBottom: 12 }}>
                  {visibleArts.filter(a => a.price).map(a => (
                    <div key={a.id} className="approval-total-row">
                      <span>{a.name}</span>
                      <span className="amount">{formatPrice(a.price)}</span>
                    </div>
                  ))}
                  <div className="approval-total-row total">
                    <span>Total</span>
                    <span className="amount">{formatPrice(totalCost)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 6 }}>Prices exclude VAT.</div>
                  {budgetPct !== null && (
                    <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 2 }}>
                      {budgetPct.toFixed(1)}% of project budget
                    </div>
                  )}
                </div>
              )}

              <button className="btn btn-green btn-sm btn-full" onClick={handleApproveClick}>
                ✓ Approve Option {activeOpt}
              </button>
              {onClearPick && (
                <>
                  <p className="client-pick-hint" style={{ marginTop: 10, marginBottom: 4 }}>
                    Changed your mind? Use this to go back and compare options before making a final choice.
                  </p>
                  <button
                    className="btn btn-ghost btn-sm btn-full"
                    onClick={onClearPick}
                  >
                    Change selection
                  </button>
                </>
              )}
            </>
          )}

          {/* Cost total when approved */}
          {optData.approved && totalCost > 0 && (
            <div className="approval-total-section" style={{ marginBottom: 12 }}>
              {visibleArts.filter(a => a.price).map(a => (
                <div key={a.id} className="approval-total-row">
                  <span>{a.name}</span>
                  <span className="amount">{formatPrice(a.price)}</span>
                </div>
              ))}
              <div className="approval-total-row total">
                <span>Total</span>
                <span className="amount">{formatPrice(totalCost)}</span>
              </div>
            </div>
          )}

          {/* Approval history */}
          {approvalActivity.length > 0 && (
            <div className="activity-log" style={{ marginTop: 12 }}>
              <div className="activity-log-title">History</div>
              {approvalActivity.slice(0, 3).map(a => (
                <div key={a.id} className="activity-entry">
                  <div className={`activity-dot${a.type === 'approved' ? ' green' : ''}`} />
                  <div className="activity-text">{a.text}</div>
                  <div className="activity-time">
                    {new Date(a.created_at).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      </div>

      {/* Approve warning popup */}
      {showApproveWarning && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setShowApproveWarning(false) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-title">Approve this elevation?</div>
            <div className="modal-sub" style={{ lineHeight: 1.6, marginBottom: 20 }}>
              Approving this elevation will lock in your choice of artworks and placement.
              You&apos;ll still be able to view the elevation but it will be submitted to
              Christian &amp; Kwan for project signoff. Are you happy to proceed?
            </div>
            <div className="modal-footer">
              <button className="btn btn-sm" onClick={() => setShowApproveWarning(false)}>
                Cancel
              </button>
              <button className="btn btn-sm btn-green" onClick={handleApproveConfirm}>
                Yes, approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Canvas (imperative DOM, artwork drag, foreground masks) ───────────
function ClientCanvas({
  optData,
  rerenderKey,
  refitKey,
  locked,
  onArtworkMove,
  zoom,
}: {
  optData: ClientOption
  rerenderKey: number
  refitKey: number
  locked: boolean
  onArtworkMove: (artId: string, xF: number, yF: number) => void
  zoom: number
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const elevWrapRef = useRef<HTMLDivElement>(null)
  const elevImgRef = useRef<HTMLImageElement>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!optData.imageUrl || !canvasRef.current) return
    setIsLoading(true)
    const img = new Image()
    img.onerror = () => setIsLoading(false)
    img.onload = () => {
      // Fit to the visible canvas frame (.client-canvas-area) on both dimensions
      // with 32 px padding per side. Measuring canvas-area — not canvas-inner —
      // matters because canvas-inner grows with its own content (the wrap we size
      // below), so reading it would feed stale dimensions back on re-fit.
      // No upper cap: small elevation images are upscaled to fit, large ones are
      // downscaled. The `zoom` prop is a relative multiplier on top (1.0 = fit).
      const area = canvasRef.current?.closest('.client-canvas-area') as HTMLElement | null
      const areaW = area?.clientWidth ?? canvasRef.current?.clientWidth ?? 900
      const areaH = area?.clientHeight ?? canvasRef.current?.clientHeight ?? 600
      const availW = Math.max(1, areaW - 64)
      const availH = Math.max(1, areaH - 64)
      const s = Math.min(availW / img.naturalWidth, availH / img.naturalHeight)

      const wrap = elevWrapRef.current!
      if (!wrap) return

      // Clear existing overlays
      wrap.querySelectorAll('.client-aw-overlay').forEach(e => e.remove())

      // Ensure artwork layer div exists (inserted before fg SVG so foreground mask renders above artworks)
      let artLayer = wrap.querySelector('#client-artwork-layer') as HTMLDivElement | null
      if (!artLayer) {
        artLayer = document.createElement('div')
        artLayer.id = 'client-artwork-layer'
        artLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;transform-origin:0 0'
        const fgSvg = wrap.querySelector('#client-fg-svg')
        if (fgSvg) wrap.insertBefore(artLayer, fgSvg)
        else wrap.appendChild(artLayer)
      }
      artLayer.innerHTML = ''

      const elevImg = wrap.querySelector('.client-elev-img') as HTMLImageElement | null
      if (elevImg) {
        elevImg.style.width = img.naturalWidth * s + 'px'
        elevImg.style.height = img.naturalHeight * s + 'px'
        wrap.style.width = img.naturalWidth * s + 'px'
        wrap.style.height = img.naturalHeight * s + 'px'
      }

      // sc is px-per-cm at display scale; if not calibrated, fall back to a default
      const sc = optData.scale_px_per_cm ? optData.scale_px_per_cm * s : null

      optData.artworks.forEach(art => {
        if (!art.visible || !art.imageUrl) return
        const aw = document.createElement('div')
        aw.className = 'client-aw-overlay' + (locked ? ' locked' : '')
        aw.dataset.id = art.id
        aw.style.left = art.xF * img.naturalWidth * s + 'px'
        aw.style.top = art.yF * img.naturalHeight * s + 'px'
        aw.style.width = (sc ? art.wCm * sc : 80) + 'px'
        aw.style.height = (sc ? art.hCm * sc : 60) + 'px'

        // Frame border
        if (art.frameType && art.frameWidthMm && sc) {
          const framePx = Math.round((art.frameWidthMm / 10) * sc)
          const frameColor: Record<string, string> = {
            black: '#1a1a1a', white: '#f0ede8',
            'pale-wood': '#c4a882', 'mid-wood': '#7d5a35', 'dark-wood': '#3d2814',
          }
          aw.style.border = `${framePx}px solid ${frameColor[art.frameType] ?? '#1a1a1a'}`
          aw.style.boxSizing = 'content-box'
        }

        const ai = document.createElement('img')
        ai.src = art.imageUrl!
        ai.draggable = false

        // Build div-level CSS filter: brightness (covers image + frame) + drop-shadow
        const awFilters: string[] = []
        if (art.brightness != null && art.brightness !== 1) {
          awFilters.push(`brightness(${art.brightness})`)
        }
        if ((art as any).shadowBlur != null && (art as any).shadowBlur > 0 &&
            (art as any).shadowOpacity != null && (art as any).shadowOpacity > 0) {
          const rad = (((art as any).shadowAngle ?? 225) * Math.PI) / 180
          const dist = (art as any).shadowBlur * 0.55
          const oX = (-Math.sin(rad) * dist).toFixed(1)
          const oY = (Math.cos(rad) * dist).toFixed(1)
          awFilters.push(`drop-shadow(${oX}px ${oY}px ${(art as any).shadowBlur.toFixed(1)}px rgba(0,0,0,${(art as any).shadowOpacity.toFixed(2)}))`)
        }
        if (awFilters.length > 0) aw.style.filter = awFilters.join(' ')
        if (art.fade != null && art.fade > 0) {
          aw.style.opacity = (1 - art.fade * 0.25).toFixed(3)
        }

        aw.appendChild(ai)

        const tag = document.createElement('div')
        tag.className = 'client-aw-tag'
        tag.textContent = art.name + (art.price ? ' · ' + formatPrice(art.price) : '')
        aw.appendChild(tag)

        if (!locked) {
          aw.style.cursor = 'grab'
          const sx = { val: 0 }, sy = { val: 0 }, sl = { val: 0 }, st = { val: 0 }
          const SNAP_PX = 8

          function renderSnapGuides(xLines: number[], yLines: number[], elevW: number, elevH: number) {
            const svg = wrap.querySelector('#client-snap-svg') as SVGSVGElement | null
            if (!svg) return
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

          aw.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation()
            sx.val = e.clientX; sy.val = e.clientY
            sl.val = parseFloat(aw.style.left); st.val = parseFloat(aw.style.top)
            const eW = img.naturalWidth * s, eH = img.naturalHeight * s
            const wW = parseFloat(aw.style.width), wH = parseFloat(aw.style.height)

            function mv(ev: MouseEvent) {
              let rawLeft = Math.max(0, Math.min(eW - wW, sl.val + (ev.clientX - sx.val)))
              let rawTop = Math.max(0, Math.min(eH - wH, st.val + (ev.clientY - sy.val)))
              const snapXLines: number[] = [], snapYLines: number[] = []

              wrap.querySelectorAll('.client-aw-overlay').forEach(other => {
                if ((other as HTMLElement).dataset.id === art.id) return
                const oLeft = parseFloat((other as HTMLElement).style.left)
                const oTop = parseFloat((other as HTMLElement).style.top)
                const oW = parseFloat((other as HTMLElement).style.width)
                const oH = parseFloat((other as HTMLElement).style.height)
                if (isNaN(oLeft) || isNaN(oW)) return
                const rawRight = rawLeft + wW, rawCenterX = rawLeft + wW / 2
                const rawBottom = rawTop + wH, rawCenterY = rawTop + wH / 2
                const oRight = oLeft + oW, oCenterX = oLeft + oW / 2
                const oBottom = oTop + oH, oCenterY = oTop + oH / 2
                const xCands: Array<[number, number]> = [
                  [rawLeft, oLeft], [rawLeft, oRight], [rawLeft, oCenterX],
                  [rawRight, oLeft], [rawRight, oRight], [rawRight, oCenterX],
                  [rawCenterX, oLeft], [rawCenterX, oRight], [rawCenterX, oCenterX],
                ]
                for (const [myEdge, otherEdge] of xCands) {
                  if (Math.abs(myEdge - otherEdge) < SNAP_PX) {
                    rawLeft = otherEdge - (myEdge - rawLeft)
                    snapXLines.push(otherEdge)
                    break
                  }
                }
                const yCands: Array<[number, number]> = [
                  [rawTop, oTop], [rawTop, oBottom], [rawTop, oCenterY],
                  [rawBottom, oTop], [rawBottom, oBottom], [rawBottom, oCenterY],
                  [rawCenterY, oTop], [rawCenterY, oBottom], [rawCenterY, oCenterY],
                ]
                for (const [myEdge, otherEdge] of yCands) {
                  if (Math.abs(myEdge - otherEdge) < SNAP_PX) {
                    rawTop = otherEdge - (myEdge - rawTop)
                    snapYLines.push(otherEdge)
                    break
                  }
                }
              })

              const nl = Math.max(0, Math.min(eW - wW, rawLeft))
              const nt = Math.max(0, Math.min(eH - wH, rawTop))
              aw.style.left = nl + 'px'
              aw.style.top = nt + 'px'
              onArtworkMove(art.id, nl / eW, nt / eH)
              renderSnapGuides([...new Set(snapXLines)], [...new Set(snapYLines)], eW, eH)
            }
            function up() {
              document.removeEventListener('mousemove', mv)
              document.removeEventListener('mouseup', up)
              const svg = wrap.querySelector('#client-snap-svg') as SVGSVGElement | null
              if (svg) { svg.innerHTML = ''; svg.style.display = 'none' }
            }
            document.addEventListener('mousemove', mv)
            document.addEventListener('mouseup', up)
          })

          aw.addEventListener('touchstart', e => {
            e.stopPropagation()
            const t0 = e.touches[0]
            sx.val = t0.clientX; sy.val = t0.clientY
            sl.val = parseFloat(aw.style.left); st.val = parseFloat(aw.style.top)
            const eW = img.naturalWidth * s, eH = img.naturalHeight * s
            const wW = parseFloat(aw.style.width), wH = parseFloat(aw.style.height)

            function mv(ev: TouchEvent) {
              ev.preventDefault()
              const t = ev.touches[0]
              const nl = Math.max(0, Math.min(eW - wW, sl.val + (t.clientX - sx.val)))
              const nt = Math.max(0, Math.min(eH - wH, st.val + (t.clientY - sy.val)))
              aw.style.left = nl + 'px'
              aw.style.top = nt + 'px'
              onArtworkMove(art.id, nl / eW, nt / eH)
            }
            function up() {
              document.removeEventListener('touchmove', mv)
              document.removeEventListener('touchend', up)
            }
            document.addEventListener('touchmove', mv, { passive: false })
            document.addEventListener('touchend', up)
          }, { passive: true })
        }

        artLayer!.appendChild(aw)
      })

      // Apply perspective transform to artwork layer if skew is defined and active
      const { skew_tl_x: tlx, skew_tl_y: tly, skew_tr_x: trx, skew_tr_y: try_,
              skew_br_x: brx, skew_br_y: bry, skew_bl_x: blx, skew_bl_y: bly,
              skew_active } = optData
      const dispW = img.naturalWidth * s, dispH = img.naturalHeight * s
      if (skew_active && tlx != null && tly != null && trx != null && try_ != null &&
          brx != null && bry != null && blx != null && bly != null) {
        const matrix = wallQuadToSkewMatrix(dispW, dispH, [
          [tlx * dispW, tly * dispH],
          [trx * dispW, try_ * dispH],
          [brx * dispW, bry * dispH],
          [blx * dispW, bly * dispH],
        ])
        artLayer!.style.transform = matrix
      } else {
        artLayer!.style.transform = ''
      }

      // Foreground composite SVG
      const masks = Array.isArray(optData.foreground_masks)
        ? optData.foreground_masks as Array<Array<{ x: number; y: number }>>
        : []
      const fgSvg = wrap.querySelector('#client-fg-svg') as SVGSVGElement | null
      if (fgSvg) {
        const W = img.naturalWidth * s, H = img.naturalHeight * s
        fgSvg.setAttribute('width', String(W))
        fgSvg.setAttribute('height', String(H))
        const clipPath = fgSvg.querySelector('#client-fg-clip')
        if (clipPath) {
          clipPath.innerHTML = ''
          masks.forEach((polygon, i) => {
            if (polygon.length < 3) return
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
            poly.id = `client-fg-poly-${i}`
            poly.setAttribute('points', polygon.map(p => `${p.x * W},${p.y * H}`).join(' '))
            clipPath.appendChild(poly)
          })
        }
        const fgImg = fgSvg.querySelector('#client-fg-image') as SVGImageElement | null
        if (fgImg) {
          fgImg.setAttribute('width', String(W))
          fgImg.setAttribute('height', String(H))
          fgImg.setAttribute('href', optData.imageUrl!)
        }
        fgSvg.style.display = masks.length > 0 ? '' : 'none'
      }
      setIsLoading(false)
    }
    img.src = optData.imageUrl
  }, [optData.id, optData.imageUrl, locked, rerenderKey, refitKey]) // eslint-disable-line

  return (
    <div className="client-canvas-inner" ref={canvasRef} style={{ position: 'relative', minHeight: isLoading ? 200 : undefined }}>
      <div
        className="client-elev-wrap"
        ref={elevWrapRef}
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="client-elev-img" src={optData.imageUrl!} alt="elevation" draggable={false} ref={elevImgRef} />
        <svg
          id="client-snap-svg"
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'none', overflow: 'visible' }}
        />
        <svg id="client-fg-svg" className="fg-svg" style={{ display: 'none' }}>
          <defs><clipPath id="client-fg-clip" /></defs>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <image id="client-fg-image" href="" x="0" y="0" preserveAspectRatio="none" clipPath="url(#client-fg-clip)" style={{ pointerEvents: 'none' }} />
        </svg>
      </div>
      {isLoading && <ArcSpinner imageRef={elevImgRef} />}
    </div>
  )
}

function EyeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function EyeOffIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
}
