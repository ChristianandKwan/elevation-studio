'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { priceLabel, formatPrice } from '@/lib/utils'

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
  foreground_masks?: any[] | null
  artworks: ClientArtwork[]
}

interface Props {
  elevation: {
    id: string
    name: string
    elevation_options: ClientOption[]
  }
  token: string
  projectId: string
  approvalActivity: Array<{ id: string; type: string; text: string; created_at: string }>
  onStatus: (msg: string) => void
}

export default function ClientElevation({ elevation, token, projectId, approvalActivity, onStatus }: Props) {
  const options = elevation.elevation_options
  const hasA = options.some(o => o.option === 'A' && o.imageUrl)
  const hasB = options.some(o => o.option === 'B' && o.imageUrl)

  const defaultOpt = hasA ? 'A' : hasB ? 'B' : 'A'
  const [activeOpt, setActiveOpt] = useState(defaultOpt)
  const [optionsState, setOptionsState] = useState<Record<string, ClientOption>>(
    Object.fromEntries(options.map(o => [o.option, { ...o, artworks: o.artworks.map(a => ({ ...a })) }]))
  )

  const optData = optionsState[activeOpt]

  async function handleApprove() {
    const supabase = createClient()
    const now = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

    // Save current artwork positions
    await Promise.all(
      (optData.artworks ?? []).map(art =>
        supabase.from('artworks').update({ x_fraction: art.xF, y_fraction: art.yF }).eq('id', art.id)
      )
    )

    await supabase.from('elevation_options').update({ approved: true, approved_at: now }).eq('id', optData.id)
    await supabase.from('projects').update({ status: 'approved' }).eq('id', projectId)
    await supabase.from('activity_logs').insert({
      project_id: projectId,
      type: 'approved',
      text: `Client approved Option ${activeOpt} of ${elevation.name}`,
    })

    setOptionsState(prev => ({
      ...prev,
      [activeOpt]: { ...prev[activeOpt], approved: true, approved_at: now },
    }))
    onStatus(`Option ${activeOpt} approved!`)
  }

  async function handleUnapprove() {
    const supabase = createClient()
    await supabase.from('elevation_options').update({ approved: false, approved_at: null }).eq('id', optData.id)
    await supabase.from('activity_logs').insert({
      project_id: projectId,
      type: 'unapprove',
      text: `Client unapproved Option ${activeOpt} of ${elevation.name}`,
    })

    setOptionsState(prev => ({
      ...prev,
      [activeOpt]: { ...prev[activeOpt], approved: false, approved_at: null },
    }))
    onStatus('Approval removed')
  }

  const totalCost = (optData?.artworks ?? []).filter(a => a.visible && a.price).reduce((s, a) => s + a.price, 0)

  if (!hasA && !hasB) return null

  return (
    <div className="client-elevation-wrap">
      {/* Header */}
      <div className="client-elevation-header">
        <div className="elevation-name">{elevation.name}</div>
        <div className="client-elevation-tabs">
          {hasA && (
            <button className={`client-tab${activeOpt === 'A' ? ' active' : ''}`} onClick={() => setActiveOpt('A')}>
              Option A
            </button>
          )}
          {hasB && (
            <button className={`client-tab${activeOpt === 'B' ? ' active' : ''}`} onClick={() => setActiveOpt('B')}>
              Option B
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <ClientCanvas optData={optData} onArtworkMove={(artId, xF, yF) => {
        setOptionsState(prev => ({
          ...prev,
          [activeOpt]: {
            ...prev[activeOpt],
            artworks: prev[activeOpt].artworks.map(a => a.id === artId ? { ...a, xF, yF } : a),
          },
        }))
      }} />

      {/* Artwork list */}
      <div style={{ marginTop: 24 }}>
        <div className="client-section-kicker">Artworks in this option</div>
        <div className="client-aw-list">
          {(optData?.artworks ?? []).filter(a => a.visible).map(art => (
            <div key={art.id} className="client-aw-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {art.imageUrl && <img className="client-aw-card-img" src={art.imageUrl} alt={art.name} />}
              <div className="client-aw-card-info">
                <div className="client-aw-card-name">{art.name}</div>
                <div className="client-aw-card-dims">{art.wCm} × {art.hCm} cm</div>
                {art.price > 0 && (
                  <div className="client-aw-card-price">
                    <strong>{formatPrice(art.price)}</strong>
                    <div className="client-aw-card-incl">{priceLabel(art.priceIncludes)}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approval section */}
      <div className="approval-box">
        {/* Status */}
        {optData?.approved ? (
          <div className="approval-status-bar approved">
            <div className="approval-status-icon">✓</div>
            <div>
              <div className="approval-status-text" style={{ color: 'var(--green)' }}>Option {activeOpt} approved</div>
              <div className="approval-status-sub">Approved {optData.approved_at}</div>
            </div>
          </div>
        ) : (
          <div className="approval-status-bar pending">
            <div className="approval-status-icon">◌</div>
            <div>
              <div className="approval-status-text">Awaiting approval</div>
              <div className="approval-status-sub">Review the artwork placement above, then approve</div>
            </div>
          </div>
        )}

        {/* Cost total */}
        {totalCost > 0 && (
          <div className="approval-total-section">
            {(optData?.artworks ?? []).filter(a => a.visible && a.price).map(a => (
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
        <div className="approval-actions" style={{ marginTop: 16 }}>
          {optData?.approved ? (
            <button className="btn btn-ghost btn-sm" onClick={handleUnapprove}>Unapprove</button>
          ) : (
            <button className="btn btn-green btn-sm" onClick={handleApprove}>
              ✓ Approve Option {activeOpt}
            </button>
          )}
        </div>

        {/* Approval history */}
        {approvalActivity.length > 0 && (
          <div className="activity-log">
            <div className="activity-log-title">Approval History</div>
            {approvalActivity.slice(0, 3).map(a => (
              <div key={a.id} className="activity-entry">
                <div className={`activity-dot${a.type === 'approved' ? ' green' : ''}`} />
                <div className="activity-text">{a.text}</div>
                <div className="activity-time">{new Date(a.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Client canvas (read + drag before approval) ──────────────────────
function ClientCanvas({
  optData,
  onArtworkMove,
}: {
  optData: ClientOption | undefined
  onArtworkMove: (artId: string, xF: number, yF: number) => void
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const elevWrapRef = useRef<HTMLDivElement>(null)
  const [scale2, setScale2] = useState(1)

  useEffect(() => {
    if (!optData?.imageUrl || !canvasRef.current) return
    const img = new Image()
    img.onload = () => {
      const maxW = Math.min((canvasRef.current?.clientWidth ?? 800) - 48, img.naturalWidth)
      const s = maxW / img.naturalWidth
      setScale2(s)

      const wrap = elevWrapRef.current
      if (!wrap) return
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

      ;(optData.artworks ?? []).forEach(art => {
        if (!art.visible || !art.imageUrl) return
        const aw = document.createElement('div')
        aw.className = 'client-aw-overlay' + (optData.approved ? ' locked' : '')
        aw.style.left = art.xF * img.naturalWidth * s + 'px'
        aw.style.top = art.yF * img.naturalHeight * s + 'px'
        aw.style.width = art.wCm * sc + 'px'
        aw.style.height = art.hCm * sc + 'px'

        const ai = document.createElement('img')
        ai.src = art.imageUrl!
        ai.draggable = false

        const tag = document.createElement('div')
        tag.className = 'client-aw-tag'
        tag.textContent = art.name + (art.price ? ' · ' + formatPrice(art.price) : '')

        aw.appendChild(ai)
        aw.appendChild(tag)

        if (!optData.approved) {
          aw.style.cursor = 'grab'
          const sx_ref = { val: 0 }, sy_ref = { val: 0 }
          const sl_ref = { val: 0 }, st_ref = { val: 0 }

          aw.addEventListener('mousedown', (e) => {
            e.preventDefault(); e.stopPropagation()
            sx_ref.val = e.clientX; sy_ref.val = e.clientY
            sl_ref.val = parseFloat(aw.style.left); st_ref.val = parseFloat(aw.style.top)
            const eW = img.naturalWidth * s, eH = img.naturalHeight * s
            const wW = parseFloat(aw.style.width), wH = parseFloat(aw.style.height)

            function mv(ev: MouseEvent) {
              const nl = Math.max(0, Math.min(eW - wW, sl_ref.val + (ev.clientX - sx_ref.val)))
              const nt = Math.max(0, Math.min(eH - wH, st_ref.val + (ev.clientY - sy_ref.val)))
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

      // Foreground composite SVG — renders elevation clipped to mask polygons, above artworks
      const masks = Array.isArray(optData.foreground_masks) ? optData.foreground_masks as Array<Array<{ x: number; y: number }>> : []
      const fgSvg = wrap.querySelector('#client-fg-svg') as SVGSVGElement | null
      if (fgSvg) {
        const W = img.naturalWidth * s
        const H = img.naturalHeight * s
        fgSvg.setAttribute('width', String(W))
        fgSvg.setAttribute('height', String(H))

        const clipPath = fgSvg.querySelector('#client-fg-clip')
        if (clipPath) {
          clipPath.innerHTML = ''
          masks.forEach((polygon, i) => {
            if (polygon.length < 3) return
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
            poly.id = `client-fg-poly-${i}`
            const pts = polygon.map(p => `${p.x * W},${p.y * H}`).join(' ')
            poly.setAttribute('points', pts)
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
  }, [optData?.id, optData?.imageUrl, optData?.approved]) // eslint-disable-line

  if (!optData?.imageUrl) {
    return (
      <div className="client-elevation-canvas" style={{ minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--mid)', fontSize: 13 }}>No elevation uploaded for this option</div>
      </div>
    )
  }

  return (
    <div className="client-elevation-canvas" ref={canvasRef}>
      <div className="client-elev-scroller">
        <div className="client-elev-wrap" ref={elevWrapRef}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="client-elev-img"
            src={optData.imageUrl}
            alt="elevation"
            draggable={false}
            style={{ display: 'block', maxWidth: '100%' }}
          />

          {/* Foreground composite SVG */}
          <svg id="client-fg-svg" className="fg-svg" style={{ display: 'none' }}>
            <defs>
              <clipPath id="client-fg-clip" />
            </defs>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <image
              id="client-fg-image"
              href=""
              x="0"
              y="0"
              preserveAspectRatio="none"
              style={{ pointerEvents: 'none' }}
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
