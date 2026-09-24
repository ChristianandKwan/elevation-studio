'use client'

import { useRef, useEffect, useState } from 'react'
import NextImage from 'next/image'
import { formatPrice, formatApprovalTimestamp } from '@/lib/utils'
import { wallQuadToSkewMatrix } from '@/lib/homography'
import {
  frameLipShadeElement, mountLipShadeElement, mountLipOpacity, SHADOW_PUSH,
} from '@/lib/frameShadow'
import { ArcSpinner } from '@/components/ui/Spinner'
import { frameHex, mountHex, bandsPx, isWoodFrame } from '@/lib/frames'
import { frameGrainElement } from '@/lib/frameGrain'
import { wallImageUrl } from '@/lib/wall'
import { setPreloadPaused } from '@/lib/imagePreload'
import Conversation from '@/components/conversation/Conversation'
import type { OptionMessage } from '@/lib/messages'

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
  frameType?: string | null
  frameWidthMm?: number | null
  mountColor?: string | null
  mountTopMm?: number | null
  mountRightMm?: number | null
  mountBottomMm?: number | null
  mountLeftMm?: number | null
  brightness?: number | null
  fade?: number | null
  shadowAngle?: number | null
  shadowBlur?: number | null
  shadowOpacity?: number | null
}

interface ClientOption {
  id: string
  option: string
  imageUrl: string | null
  orig_w: number
  orig_h: number
  scale_px_per_cm: number | null
  /** Set instead of imageUrl when this wall was entered as a measurement. */
  wall_w_cm?: number | null
  wall_h_cm?: number | null
  wall_color?: string | null
  approved: boolean
  approved_at: string | null
  foreground_masks?: unknown
  artworks: ClientArtwork[]
  /** What C&K wrote about this option for the client (notes set to Client). */
  ckNotes: string[]
  /** The conversation on this option, oldest first. */
  messages: OptionMessage[]
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
  /** Stored key of the active option — used for picks, never shown */
  activeOpt: string
  /** How to refer to activeOpt: its name, or "Option A" */
  optionTitle: string
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
  /** Fired once when a drag finishes, so positions can be persisted. */
  onArtworkMoveEnd: () => void
  onToggleVisibility: (artId: string) => void
  /** Resolves true once the message is saved. */
  onSendMessage: (body: string) => Promise<boolean>
  onApprove: () => void
}

export default function ClientElevation({
  optData, elevationName, activeOpt, optionTitle, rerenderKey,
  approvalActivity, clientBudget, isPicked, artworksLocked, onPick, onClearPick,
  zoom, onZoom,
  onArtworkMove, onArtworkMoveEnd, onToggleVisibility, onSendMessage, onApprove,
}: Props) {
  const [showApproveWarning, setShowApproveWarning] = useState(false)
  // Bumped on Fit click to re-measure the viewport and re-fit the elevation
  // (parity with consultant `setZoomFit`, which recomputes fit on every click).
  const [refitKey, setRefitKey] = useState(0)
  // Read after mount: the server has no storage, and a note that flashed in
  // and out on every visit would be worse than one that waits a moment.
  const [phoneNoteDismissed, setPhoneNoteDismissed] = useState(true)
  useEffect(() => {
    let dismissed = false
    try { dismissed = localStorage.getItem(PHONE_NOTE_KEY) === '1' } catch { /* storage blocked: show it */ }
    setPhoneNoteDismissed(dismissed) // eslint-disable-line react-hooks/set-state-in-effect
  }, [])

  // A phone turned on its side, or a window resized, re-fits the wall. Only a
  // change of width counts: a phone's height changes every time its address
  // bar slides in or out while scrolling.
  useEffect(() => {
    let width = window.innerWidth
    let timer: number | undefined
    const onResize = () => {
      if (window.innerWidth === width) return
      width = window.innerWidth
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setRefitKey(k => k + 1), 200)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); window.clearTimeout(timer) }
  }, [])

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
            onArtworkMoveEnd={onArtworkMoveEnd}
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
            style={{ fontSize: 10, letterSpacing: 0.5 }}
            onClick={() => { setRefitKey(k => k + 1); onZoom(1.0) }}
            title="Fit to viewport"
          >Fit</button>
        </div>
      </div>

      {/* Sidebar */}
      <div className="client-sidebar">
        <div className="client-sidebar-scroll">
          {/* Phones only (the stylesheet hides it elsewhere): a phone cannot
              move artworks, so it says where that can be done. Not once the
              wall is picked or approved — nothing moves then on any screen. */}
          {!artworksLocked && !phoneNoteDismissed && (
            <div className="client-phone-note" role="note">
              <span>For the best experience and to move and rearrange artworks, we would recommend viewing this link on a computer.</span>
              <button
                className="client-phone-note-close"
                onClick={() => {
                  setPhoneNoteDismissed(true)
                  try { localStorage.setItem(PHONE_NOTE_KEY, '1') } catch { /* private mode: dismissed for this visit */ }
                }}
                aria-label="Dismiss"
              >×</button>
            </div>
          )}

          {/* Option / elevation label */}
          <div className="client-sidebar-section">
            <div className="client-sidebar-kicker">{optionTitle}</div>
            <div className="client-sidebar-elev-name">{elevationName}</div>
          </div>

          {/* What C&K wrote about this option, where they set it to Client.
              Undated on purpose (Tom): it reads as the proposal speaking, not
              as a message in the conversation below. */}
          {optData.ckNotes.length > 0 && (
            <div className="client-sidebar-section">
              <div className="client-sidebar-kicker">From Christian &amp; Kwan</div>
              <div className="client-ck-note">
                {optData.ckNotes.map((body, i) => <p key={i}>{body}</p>)}
              </div>
            </div>
          )}

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
                      {art.imageUrl && <img className="client-art-thumb" src={art.imageUrl} crossOrigin="anonymous" alt={art.name} />}
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

          {/* The conversation. It stays open after approval: questions about
              delivery and hanging come after the choice, not before. */}
          <div className="client-sidebar-section">
            <div className="client-sidebar-kicker">Conversation</div>
            <Conversation
              key={optData.id}
              viewer="client"
              messages={optData.messages}
              onSend={onSendMessage}
              hint="We are emailed when you send."
              emptyText="Ask us anything about this option, and we will reply here."
            />
          </div>

          {/* Approval section — scrolls with the rest of the sidebar */}
          <div className="client-approval-section">
          {optData.approved ? (
            /* ── Stage 3: Approved ── */
            <div className="approval-status-bar approved" style={{ margin: '0 0 12px' }}>
              <div className="approval-status-icon">✓</div>
              <div>
                <div className="approval-status-text" style={{ color: 'var(--green)' }}>
                  {optionTitle} approved
                </div>
                <div className="approval-status-sub">Approved {formatApprovalTimestamp(optData.approved_at)}</div>
              </div>
            </div>
          ) : !isPicked ? (
            /* ── Stage 1: Pick ── */
            <div className="client-pick-panel">
              <div className="client-pick-title">Choose your option</div>
              <div className="client-pick-hint">
                Compare the options using the tabs above, then lock in your choice.
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
                Pick {optionTitle}
              </button>
            </div>
          ) : (
            /* ── Stage 2: Picked, awaiting approval ── */
            <>
              <div className="approval-status-bar pending" style={{ margin: '0 0 12px' }}>
                <div className="approval-status-icon">◌</div>
                <div>
                  <div className="approval-status-text">{optionTitle} selected</div>
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
                ✓ Approve {optionTitle}
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

/** Remembers, on this device, that the client closed the "open it on a computer" note. */
const PHONE_NOTE_KEY = 'es-client-phone-note-dismissed'

/** Must match the phone breakpoint in client-portal.css. */
const PHONE_QUERY = '(max-width: 640px)'
/** How long a finger rests on an artwork before it can be dragged. */
const TOUCH_HOLD_MS = 280
/** How far a finger may wander during that hold before it counts as a scroll. */
const TOUCH_SLOP_PX = 8

// ── Canvas (imperative DOM, artwork drag, foreground masks) ───────────
function ClientCanvas({
  optData,
  rerenderKey,
  refitKey,
  locked,
  onArtworkMove,
  onArtworkMoveEnd,
  zoom,
}: {
  optData: ClientOption
  rerenderKey: number
  refitKey: number
  locked: boolean
  onArtworkMove: (artId: string, xF: number, yF: number) => void
  onArtworkMoveEnd: () => void
  zoom: number
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const elevWrapRef = useRef<HTMLDivElement>(null)
  // Read by the drag handlers, which are built once per draw: the wall is
  // shown at scale(zoom), so a finger's movement on screen is zoom times the
  // movement on the wall. Ignoring it made artworks run ahead of the pointer
  // when zoomed in and lag behind it when zoomed out.
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const elevImgRef = useRef<HTMLImageElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  // Decoded images — walls and artworks — kept across rebuilds. Every
  // visibility toggle bumps rerenderKey and re-runs this effect; without the
  // cache each one re-entered the loading state and flashed the spinner over
  // an image the browser already had, which is what made the eye icon feel
  // slow.
  const decodedRef = useRef(new Map<string, HTMLImageElement>())
  // The option the canvas last drew. Redrawing that same option — an artwork
  // switched on with the eye, a re-fit — never hides the artworks: fading
  // them all out and back in to add one would be worse than letting it land.
  const shownOptionRef = useRef<string | null>(null)

  // The wall to draw: the photograph if the consultant uploaded one, or a
  // generated rectangle of the colour they chose if they entered the wall as
  // a measurement instead. Everything below works on the picture either way.
  const wallUrl = wallImageUrl({
    imageUrl: optData.imageUrl,
    origW: optData.orig_w,
    origH: optData.orig_h,
    wallColor: optData.wall_color,
  })

  useEffect(() => {
    if (!wallUrl || !canvasRef.current) return
    let cancelled = false

    // `artworksPending` hides the artwork layer until every artwork is ready,
    // so they arrive together rather than one at a time.
    const build = (img: HTMLImageElement, artworksPending: boolean) => {
      // Fit to the visible canvas frame (.client-canvas-area) on both dimensions
      // with 32 px padding per side. Measuring canvas-area — not canvas-inner —
      // matters because canvas-inner grows with its own content (the wrap we size
      // below), so reading it would feed stale dimensions back on re-fit.
      // No upper cap: small elevation images are upscaled to fit, large ones are
      // downscaled. The `zoom` prop is a relative multiplier on top (1.0 = fit).
      const area = canvasRef.current?.closest('.client-canvas-area') as HTMLElement | null
      // The padding is the stylesheet's, so a phone's narrower margin is
      // honoured here rather than a second number that has to agree with it.
      const inner = canvasRef.current ? getComputedStyle(canvasRef.current) : null
      const padX = inner ? parseFloat(inner.paddingLeft) + parseFloat(inner.paddingRight) : 64
      const padY = inner ? parseFloat(inner.paddingTop) + parseFloat(inner.paddingBottom) : 64
      const areaW = area?.clientWidth ?? canvasRef.current?.clientWidth ?? 900
      // On a phone the wall sits above the panel instead of beside it, and is
      // given the height its own shape needs at full width — a landscape wall
      // is not stranded in a tall grey box — within limits, so a portrait
      // wall leaves the panel something of the screen. See client-portal.css.
      const canvasWrap = area?.closest('.client-canvas-wrap') as HTMLElement | null
      if (canvasWrap && window.matchMedia(PHONE_QUERY).matches) {
        const natural = (areaW - padX) * (img.naturalHeight / img.naturalWidth) + padY
        const h = Math.round(Math.max(220, Math.min(natural, window.innerHeight * 0.62)))
        canvasWrap.style.setProperty('--phone-wall-h', h + 'px')
      }
      const areaH = area?.clientHeight ?? canvasRef.current?.clientHeight ?? 600
      const availW = Math.max(1, areaW - padX)
      const availH = Math.max(1, areaH - padY)
      const s = Math.min(availW / img.naturalWidth, availH / img.naturalHeight)
      // On a phone the client looks, reads and writes messages, but does not
      // rearrange the wall — at that size placing work is fiddly, and the
      // snap guides a mouse gets were never there for a finger (Tom). Checked
      // at each draw, so a phone turned on its side (see the resize re-fit)
      // is judged at its new width.
      const movable = !locked && !window.matchMedia(PHONE_QUERY).matches

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
      artLayer.classList.toggle('artworks-pending', artworksPending)

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
        aw.className = 'client-aw-overlay' + (movable ? '' : ' locked')
        aw.dataset.id = art.id
        aw.style.left = art.xF * img.naturalWidth * s + 'px'
        aw.style.top = art.yF * img.naturalHeight * s + 'px'
        aw.style.width = (sc ? art.wCm * sc : 80) + 'px'
        aw.style.height = (sc ? art.hCm * sc : 60) + 'px'

        // Mount and frame — the same two bands the studio draws, read from the
        // same helper so the client sees what the consultant designed.
        const bands = sc ? bandsPx(art, sc) : null
        if (bands) {
          if (bands.mount.top || bands.mount.right || bands.mount.bottom || bands.mount.left) {
            aw.style.padding =
              `${bands.mount.top}px ${bands.mount.right}px ${bands.mount.bottom}px ${bands.mount.left}px`
            aw.style.background = mountHex(art.mountColor)
            aw.style.boxSizing = 'content-box'
          }
          if (bands.frame > 0) {
            aw.style.border = `${bands.frame}px solid ${frameHex(art.frameType)}`
            aw.style.boxSizing = 'content-box'
          }
        }

        const ai = document.createElement('img')
        // Asked for the same way the loader below fetched it, so this is the
        // copy already in the browser rather than a second download.
        ai.crossOrigin = 'anonymous'
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
          const dist = (art as any).shadowBlur * SHADOW_PUSH
          const oX = (-Math.sin(rad) * dist).toFixed(1)
          const oY = (Math.cos(rad) * dist).toFixed(1)
          awFilters.push(`drop-shadow(${oX}px ${oY}px ${(art as any).shadowBlur.toFixed(1)}px rgba(0,0,0,${(art as any).shadowOpacity.toFixed(2)}))`)
        }
        if (awFilters.length > 0) aw.style.filter = awFilters.join(' ')
        if (art.fade != null && art.fade > 0) {
          aw.style.opacity = (1 - art.fade * 0.25).toFixed(3)
        }

        aw.appendChild(ai)

        // Grain, on the wood frames only.
        if (bands && bands.frame > 0 && isWoodFrame(art.frameType) && sc) {
          const awW = (sc ? art.wCm * sc : 80)
          const awH = (sc ? art.hCm * sc : 60)
          aw.appendChild(frameGrainElement(
            art.frameType!,
            awW + bands.mount.left + bands.mount.right + bands.frame * 2,
            awH + bands.mount.top + bands.mount.bottom + bands.frame * 2,
            bands.frame,
            sc,
            bands.frame,
            bands.frame,
          ))
        }

        // Two lips, as in the studio: the frame's onto the mount (inset:0 —
        // the mount is this element's padding), the mount's onto the artwork.
        const lit = art.shadowBlur != null && art.shadowBlur > 0
          && art.shadowOpacity != null && art.shadowOpacity > 0
        if (art.frameType && art.frameWidthMm && sc && lit) {
          aw.appendChild(frameLipShadeElement(art.shadowAngle, art.shadowBlur!, art.shadowOpacity!))
        }
        if (bands && lit) {
          const m = bands.mount
          if (m.top || m.right || m.bottom || m.left) {
            aw.appendChild(mountLipShadeElement(
              art.shadowAngle, art.shadowBlur!, mountLipOpacity(art.shadowOpacity!),
              `${m.top}px ${m.right}px ${m.bottom}px ${m.left}px`,
            ))
          }
        }

        const tag = document.createElement('div')
        tag.className = 'client-aw-tag'
        tag.textContent = art.name + (art.price ? ' · ' + formatPrice(art.price) : '')
        aw.appendChild(tag)

        if (movable) {
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
              const z = zoomRef.current || 1
              let rawLeft = Math.max(0, Math.min(eW - wW, sl.val + (ev.clientX - sx.val) / z))
              let rawTop = Math.max(0, Math.min(eH - wH, st.val + (ev.clientY - sy.val) / z))
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
              onArtworkMoveEnd()
            }
            document.addEventListener('mousemove', mv)
            document.addEventListener('mouseup', up)
          })

          // By touch (a tablet — phones do not move artworks at all, see
          // `movable`), an artwork is moved by holding it for a moment, then
          // dragging. A finger that lands on an artwork and sets straight off
          // is scrolling or panning; grabbing on contact shoved pictures about
          // whenever someone meant to scroll past them.
          aw.addEventListener('touchstart', e => {
            if (e.touches.length !== 1) return
            e.stopPropagation()
            const t0 = e.touches[0]
            sx.val = t0.clientX; sy.val = t0.clientY
            sl.val = parseFloat(aw.style.left); st.val = parseFloat(aw.style.top)
            const eW = img.naturalWidth * s, eH = img.naturalHeight * s
            const wW = parseFloat(aw.style.width), wH = parseFloat(aw.style.height)
            let dragging = false
            const hold = window.setTimeout(() => {
              dragging = true
              aw.classList.add('touch-dragging')
              navigator.vibrate?.(10)
            }, TOUCH_HOLD_MS)

            function mv(ev: TouchEvent) {
              const t = ev.touches[0]
              if (!dragging) {
                // Moved before the hold completed: a scroll, not a drag.
                if (Math.hypot(t.clientX - sx.val, t.clientY - sy.val) > TOUCH_SLOP_PX) end(false)
                return
              }
              ev.preventDefault()
              const z = zoomRef.current || 1
              const nl = Math.max(0, Math.min(eW - wW, sl.val + (t.clientX - sx.val) / z))
              const nt = Math.max(0, Math.min(eH - wH, st.val + (t.clientY - sy.val) / z))
              aw.style.left = nl + 'px'
              aw.style.top = nt + 'px'
              onArtworkMove(art.id, nl / eW, nt / eH)
            }
            function end(moved: boolean) {
              window.clearTimeout(hold)
              document.removeEventListener('touchmove', mv)
              document.removeEventListener('touchend', up)
              document.removeEventListener('touchcancel', up)
              aw.classList.remove('touch-dragging')
              if (moved) onArtworkMoveEnd()
            }
            function up() { end(dragging) }
            document.addEventListener('touchmove', mv, { passive: false })
            document.addEventListener('touchend', up)
            document.addEventListener('touchcancel', up)
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
          fgImg.setAttribute('href', wallUrl)
        }
        fgSvg.style.display = masks.length > 0 ? '' : 'none'
      }
      setIsLoading(false)
    }

    // ── How an option arrives ── (the same as in the studio's useStudio)
    // The wall and the artworks on it are fetched side by side. The wall goes
    // up the moment it is ready, and the spinner with it; the artworks appear
    // together once all of them are ready, fading in if the wall got there
    // first. Everything already in the browser — a visibility toggle, a
    // re-fit, a tab the background preload has reached — is drawn at once.
    const ready = (u: string) => {
      const c = decodedRef.current.get(u)
      return !!c && c.complete && c.naturalWidth > 0
    }
    const load = (u: string) => new Promise<void>(resolve => {
      if (ready(u)) { resolve(); return }
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        // Unpacked before it counts as ready, so it shows the moment it is
        // revealed instead of being decoded then.
        img.decode().catch(() => { /* drawn regardless */ }).then(() => {
          decodedRef.current.set(u, img)
          resolve()
        })
      }
      // A broken artwork shows as it always has; it just does not hold up
      // the others.
      img.onerror = () => resolve()
      img.src = u
    })

    const artUrls = [...new Set(
      optData.artworks.filter(a => a.visible && a.imageUrl).map(a => a.imageUrl!),
    )]
    const wall = decodedRef.current.get(wallUrl)
    if (wall && ready(wallUrl) && (shownOptionRef.current === optData.id || artUrls.every(ready))) {
      build(wall, false)
      shownOptionRef.current = optData.id
      return
    }

    // Background downloads of the other options wait for this one.
    setPreloadPaused(true)
    if (!ready(wallUrl)) setIsLoading(true)

    let wallShown = false
    let artsDone = false
    const artLayer = () => elevWrapRef.current?.querySelector('#client-artwork-layer')

    load(wallUrl).then(() => {
      if (cancelled) return
      const img = decodedRef.current.get(wallUrl)
      if (!img) {
        setIsLoading(false)
        setPreloadPaused(false)
        return
      }
      wallShown = true
      build(img, !artsDone)
      shownOptionRef.current = optData.id
      if (artsDone) setPreloadPaused(false)
    })

    // Ten seconds is as long as any one slow artwork may hold up the rest.
    Promise.race([
      Promise.all(artUrls.map(load)),
      new Promise(resolve => setTimeout(resolve, 10_000)),
    ]).then(() => {
      artsDone = true
      if (cancelled || !wallShown) return
      artLayer()?.classList.remove('artworks-pending')
      setPreloadPaused(false)
    })

    return () => {
      cancelled = true
      setPreloadPaused(false)
    }
  }, [optData.id, wallUrl, locked, rerenderKey, refitKey]) // eslint-disable-line

  return (
    <div className="client-canvas-inner" ref={canvasRef} style={{ position: 'relative', minHeight: isLoading ? 200 : undefined }}>
      <div
        className="client-elev-wrap"
        ref={elevWrapRef}
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
      >
        <NextImage
          className="client-elev-img"
          src={wallUrl ?? ''}
          alt="elevation"
          width={optData.orig_w || 1600}
          height={optData.orig_h || 900}
          unoptimized
          // Every portal image is fetched this way (see imagePreload.ts); the
          // browser keeps one copy per way of asking.
          crossOrigin="anonymous"
          draggable={false}
          ref={elevImgRef}
        />
        <svg
          id="client-snap-svg"
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', display: 'none', overflow: 'visible' }}
        />
        <svg id="client-fg-svg" className="fg-svg" style={{ display: 'none' }}>
          <defs><clipPath id="client-fg-clip" /></defs>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <image id="client-fg-image" crossOrigin="anonymous" x="0" y="0" preserveAspectRatio="none" clipPath="url(#client-fg-clip)" style={{ pointerEvents: 'none' }} />
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
