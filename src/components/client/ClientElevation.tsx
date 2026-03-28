'use client'

import { useRef, useEffect } from 'react'
import { formatPrice, priceLabel } from '@/lib/utils'

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

interface Props {
  optData: ClientOption
  elevationName: string
  activeOpt: 'A' | 'B'
  projectId: string
  rerenderKey: number
  approvalActivity: Array<{ id: string; type: string; text: string; created_at: string }>
  onArtworkMove: (artId: string, xF: number, yF: number) => void
  onToggleVisibility: (artId: string) => void
  onNotesChange: (notes: string) => void
  onApprove: () => void
  onUnapprove: () => void
}

export default function ClientElevation({
  optData, elevationName, activeOpt, rerenderKey,
  approvalActivity, onArtworkMove, onToggleVisibility, onNotesChange, onApprove, onUnapprove,
}: Props) {
  const visibleArts = optData.artworks.filter(a => a.visible)
  const totalCost = visibleArts.filter(a => a.price).reduce((s, a) => s + a.price, 0)

  return (
    <div className="client-main">
      {/* Canvas */}
      <div className="client-canvas-area">
        <ClientCanvas optData={optData} rerenderKey={rerenderKey} onArtworkMove={onArtworkMove} />
      </div>

      {/* Sidebar */}
      <div className="client-sidebar">
        <div className="client-sidebar-scroll">
          {/* Option / elevation label */}
          <div className="client-sidebar-section">
            <div className="client-sidebar-kicker">Option {activeOpt}</div>
            <div className="client-sidebar-elev-name">{elevationName}</div>
          </div>

          {/* Artwork list with visibility toggles */}
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
            <div className="client-sidebar-kicker">Notes for Christian & Kwan</div>
            <textarea
              className="client-notes-textarea"
              value={optData.clientNotes ?? ''}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Add any notes, questions or requests here…"
              disabled={optData.approved}
            />
            {optData.approved && (
              <div className="client-notes-hint">Unapprove to edit notes</div>
            )}
          </div>
        </div>

        {/* Approval — pinned to bottom */}
        <div className="client-approval-section">
          {/* Status */}
          {optData.approved ? (
            <div className="approval-status-bar approved" style={{ margin: '0 0 12px' }}>
              <div className="approval-status-icon">✓</div>
              <div>
                <div className="approval-status-text" style={{ color: 'var(--green)' }}>Option {activeOpt} approved</div>
                <div className="approval-status-sub">Approved {optData.approved_at}</div>
              </div>
            </div>
          ) : (
            <div className="approval-status-bar pending" style={{ margin: '0 0 12px' }}>
              <div className="approval-status-icon">◌</div>
              <div>
                <div className="approval-status-text">Awaiting approval</div>
                <div className="approval-status-sub">Review placement, then approve</div>
              </div>
            </div>
          )}

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
            </div>
          )}

          {/* Approval button */}
          {optData.approved ? (
            <button className="btn btn-ghost btn-sm btn-full" onClick={onUnapprove}>Unapprove</button>
          ) : (
            <button className="btn btn-green btn-sm btn-full" onClick={onApprove}>
              ✓ Approve Option {activeOpt}
            </button>
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
  )
}

// ── Canvas (imperative DOM, artwork drag, foreground masks) ───────────
function ClientCanvas({
  optData,
  rerenderKey,
  onArtworkMove,
}: {
  optData: ClientOption
  rerenderKey: number
  onArtworkMove: (artId: string, xF: number, yF: number) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const elevWrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!optData.imageUrl || !canvasRef.current) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const maxW = Math.min((canvasRef.current?.clientWidth ?? 900) - 64, img.naturalWidth)
      const s = maxW / img.naturalWidth

      const wrap = elevWrapRef.current
      if (!wrap) return

      // Clear existing overlays
      wrap.querySelectorAll('.client-aw-overlay').forEach(e => e.remove())

      const elevImg = wrap.querySelector('.client-elev-img') as HTMLImageElement | null
      if (elevImg) {
        elevImg.style.width = img.naturalWidth * s + 'px'
        elevImg.style.height = img.naturalHeight * s + 'px'
        wrap.style.width = img.naturalWidth * s + 'px'
        wrap.style.height = img.naturalHeight * s + 'px'
      }

      if (!optData.scale_px_per_cm) return
      const sc = optData.scale_px_per_cm * s

      optData.artworks.forEach(art => {
        if (!art.visible || !art.imageUrl) return
        const aw = document.createElement('div')
        aw.className = 'client-aw-overlay' + (optData.approved ? ' locked' : '')
        aw.dataset.id = art.id
        aw.style.left = art.xF * img.naturalWidth * s + 'px'
        aw.style.top = art.yF * img.naturalHeight * s + 'px'
        aw.style.width = art.wCm * sc + 'px'
        aw.style.height = art.hCm * sc + 'px'

        const ai = document.createElement('img')
        ai.src = art.imageUrl!
        ai.draggable = false
        aw.appendChild(ai)

        const tag = document.createElement('div')
        tag.className = 'client-aw-tag'
        tag.textContent = art.name + (art.price ? ' · ' + formatPrice(art.price) : '')
        aw.appendChild(tag)

        if (!optData.approved) {
          aw.style.cursor = 'grab'
          const sx = { val: 0 }, sy = { val: 0 }, sl = { val: 0 }, st = { val: 0 }

          aw.addEventListener('mousedown', e => {
            e.preventDefault(); e.stopPropagation()
            sx.val = e.clientX; sy.val = e.clientY
            sl.val = parseFloat(aw.style.left); st.val = parseFloat(aw.style.top)
            const eW = img.naturalWidth * s, eH = img.naturalHeight * s
            const wW = parseFloat(aw.style.width), wH = parseFloat(aw.style.height)

            function mv(ev: MouseEvent) {
              const nl = Math.max(0, Math.min(eW - wW, sl.val + (ev.clientX - sx.val)))
              const nt = Math.max(0, Math.min(eH - wH, st.val + (ev.clientY - sy.val)))
              aw.style.left = nl + 'px'
              aw.style.top = nt + 'px'
              onArtworkMove(art.id, nl / eW, nt / eH)
            }
            function up() {
              document.removeEventListener('mousemove', mv)
              document.removeEventListener('mouseup', up)
            }
            document.addEventListener('mousemove', mv)
            document.addEventListener('mouseup', up)
          })
        }

        wrap.appendChild(aw)
      })

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
    }
    img.src = optData.imageUrl
  }, [optData.id, optData.imageUrl, optData.approved, rerenderKey]) // eslint-disable-line

  return (
    <div className="client-canvas-inner" ref={canvasRef}>
      <div className="client-elev-wrap" ref={elevWrapRef}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="client-elev-img" src={optData.imageUrl!} alt="elevation" draggable={false} />
        <svg id="client-fg-svg" className="fg-svg" style={{ display: 'none' }}>
          <defs><clipPath id="client-fg-clip" /></defs>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <image id="client-fg-image" href="" x="0" y="0" preserveAspectRatio="none" style={{ pointerEvents: 'none' }} />
        </svg>
      </div>
    </div>
  )
}

function EyeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function EyeOffIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
}
