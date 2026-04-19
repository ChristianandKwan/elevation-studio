'use client'

import { useRef, useState, useEffect } from 'react'
import type { useStudio } from '@/hooks/useStudio'
import type { ActivityLog } from '@/types'
import { framingLabel, formatPrice } from '@/lib/utils'

type StudioHook = ReturnType<typeof useStudio>

interface Props {
  studio: StudioHook
  optionId: string
  projectId: string
  onStatus: (msg: string) => void
  clientNotes?: string
  otherOptionNotes?: string
  otherOptionKey?: string
  activityLogs?: ActivityLog[]
  onRequestDeleteArtworks: (ids: Set<string>) => void
  approvalStatus?: {
    pickedOption: string | null
    approved: boolean
    approvedAt: string | null
  }
  onUnapprove?: () => void
  budget?: number | null
  onBudgetChange?: (budget: number | null) => void
}

export default function StudioSidebar({ studio, onStatus, clientNotes, otherOptionNotes, otherOptionKey, activityLogs = [], onRequestDeleteArtworks, approvalStatus, onUnapprove, budget, onBudgetChange }: Props) {
  const { state, uploadElevation, startCalibration, setShowArtModal, startMaskDraw, finishMaskDraw, cancelMaskDraw, clearCurrentPoints, deletePolygon, clearAllMasks, highlightMask } = studio
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState(budget != null ? String(budget) : '')
  const [expandedArtId, setExpandedArtId] = useState<string | null>(null)

  // Auto-expand the artwork's toolbar panel when it is selected (from canvas click or sidebar click)
  useEffect(() => {
    if (state.selIds.size === 1) {
      const id = [...state.selIds][0]
      setExpandedArtId(id)
    }
  }, [state.selIds]) // eslint-disable-line

  const hasElev = !!state.elev
  const hasScale = !!state.scale
  const hasArts = state.artworks.length > 0
  // Lock all editing once client has picked or approved this option
  const isLocked = !!(approvalStatus?.pickedOption || approvalStatus?.approved)
  const hasMasks = state.masks.length > 0
  const maskDrawActive = state.maskDraw.active
  const pointsPlaced = state.maskDraw.currentPoints.length

  function pickElevation() {
    fileInputRef.current?.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadElevation(file)
    e.target.value = ''
  }

  const visibleArtworksWithPrice = state.artworks.filter(a => a.visible && a.price)
  const elevationTotal = visibleArtworksWithPrice.reduce((s, a) => s + a.price, 0)
  const hasMixedPricing = (() => {
    if (visibleArtworksWithPrice.length < 2) return false
    const first = visibleArtworksWithPrice[0].framingStatus
    return visibleArtworksWithPrice.some(a => a.framingStatus !== first)
  })()

  return (
    <div className="studio-sidebar" onClick={e => { if (e.target === e.currentTarget) studio.selectArtwork(null) }}>
      {/* Step 1: Elevation */}
      <div className="sidebar-section">
        <div className="s-title">
          <span className={`step-badge${hasElev ? ' done' : ''}`}>1</span>
          Elevation
        </div>
        <div className={`upload-zone${hasElev ? ' has-file' : ''}`} onClick={pickElevation}>
          {hasElev ? 'Elevation loaded — click to replace' : (
            <>Upload elevation image<br /><span style={{ fontSize: 10, opacity: .7 }}>JPG, PNG, TIFF — any resolution</span></>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFileChange}
        />
      </div>

      {/* Step 2: Scale */}
      <div className="sidebar-section">
        <div className="s-title">
          <span className={`step-badge${hasScale ? ' done' : ''}`}>2</span>
          Scale Calibration
        </div>
        <button
          className="btn btn-sm btn-full"
          disabled={!hasElev}
          onClick={startCalibration}
        >
          {hasScale ? 'Redraw Scale Line' : 'Draw Scale Line'}
        </button>
        {hasScale && (
          <div className="scale-chip">
            Scale: <strong>{state.scale!.origPxPerCm.toFixed(2)} px/cm</strong>
          </div>
        )}
      </div>

      {/* Step 3: Artworks */}
      <div className="sidebar-section" style={{ flex: 1 }}>
        <div className="s-title">
          <span className={`step-badge${hasArts ? ' done' : ''}`}>3</span>
          Artworks
        </div>
        <button
          className="btn btn-sm btn-primary btn-full"
          disabled={!hasScale || isLocked}
          onClick={() => setShowArtModal(true)}
        >
          + Add Artwork
        </button>

        {hasArts && (
          <>
            {state.selIds.size > 1 && (
              <div className="multi-select-bar">
                <span>{state.selIds.size} selected</span>
                <button disabled={isLocked} onClick={() => onRequestDeleteArtworks(new Set(state.selIds))}>Delete all</button>
                <button onClick={() => studio.selectArtwork(null)}>Deselect</button>
              </div>
            )}
            <div className="artwork-list">
              {state.artworks.map(art => (
                <ArtworkItem
                  key={art.id}
                  art={art}
                  isSelected={state.selIds.has(art.id)}
                  isExpanded={expandedArtId === art.id}
                  hasScale={hasScale}
                  isLocked={isLocked}
                  onSelect={() => studio.selectArtwork(art.id)}
                  onDeselect={() => studio.selectArtwork(null)}
                  onToggleExpand={() => setExpandedArtId(expandedArtId === art.id ? null : art.id)}
                  onToggleVis={() => studio.toggleVisibility(art.id)}
                  onDelete={() => onRequestDeleteArtworks(new Set([art.id]))}
                  onDimsChange={(w, h) => studio.updateArtworkDims(art.id, w, h)}
                  onPriceChange={(p) => studio.updateArtworkPrice(art.id, p)}
                  onNameChange={(n) => studio.updateArtworkName(art.id, n)}
                  onArtistChange={(a) => studio.updateArtworkArtist(art.id, a)}
                  onFrameChange={(ft, fw) => studio.updateArtworkFrame(art.id, ft, fw)}
                  onBrightnessChange={(b) => studio.updateArtworkBrightness(art.id, b)}
                  onBrightnessApplyAll={(b) => studio.updateAllArtworksBrightness(b)}
                  onShadowChange={(a, bl, op) => studio.updateArtworkShadow(art.id, a, bl, op)}
                  onShadowApplyAll={(a, bl, op) => studio.updateAllArtworksShadow(a, bl, op)}
                />
              ))}
            </div>

            {hasArts && (
              <div className="kb-hint">
                ↑↓←→ nudge · Shift+arrow = 10px · Delete = remove
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 4: Foreground */}
      {hasElev && (
        <div className="sidebar-section">
          <div className="s-title">
            <span className={`step-badge${hasMasks ? ' done' : ''}`}>4</span>
            Foreground
          </div>

          {!maskDrawActive ? (
            <>
              <button
                className="btn btn-sm btn-full"
                disabled={!hasElev}
                onClick={startMaskDraw}
              >
                {hasMasks ? 'Edit Foreground Regions' : 'Define Foreground'}
              </button>
              {hasMasks && (
                <div style={{ marginTop: 8 }}>
                  {state.masks.map((_, i) => (
                    <div
                      key={i}
                      className="mask-region-row"
                      onMouseEnter={() => highlightMask(i)}
                      onMouseLeave={() => highlightMask(null)}
                    >
                      <span className="mask-region-label">Region {i + 1}</span>
                      <button
                        className="icon-btn del"
                        title="Delete region"
                        onClick={() => { highlightMask(null); deletePolygon(i) }}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                  <button
                    className="btn btn-sm btn-full"
                    style={{ marginTop: 6, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)' }}
                    onClick={clearAllMasks}
                  >
                    Clear All Regions
                  </button>
                </div>
              )}
              {!hasMasks && (
                <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mid)', lineHeight: 1.5 }}>
                  Define areas that appear in front of artworks — e.g. light fixtures, plants, furniture.
                </div>
              )}
            </>
          ) : (
            <div className="mask-draw-panel">
              <div className="mask-draw-status">
                {pointsPlaced === 0
                  ? 'Click on the elevation to place points'
                  : pointsPlaced < 3
                    ? `${pointsPlaced} point${pointsPlaced > 1 ? 's' : ''} placed — need at least 3`
                    : `${pointsPlaced} points — double-click or click the first point to close`
                }
              </div>
              {state.masks.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 6 }}>
                  {state.masks.length} region{state.masks.length > 1 ? 's' : ''} already defined
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-sm btn-primary" style={{ flex: 1 }} onClick={finishMaskDraw}>
                  Done
                </button>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={cancelMaskDraw}>
                  Cancel
                </button>
              </div>
              {pointsPlaced > 0 && (
                <button
                  className="btn btn-sm btn-full"
                  style={{ marginTop: 6, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)' }}
                  onClick={clearCurrentPoints}
                >
                  Clear Current Shape
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 5: Perspective */}
      {hasElev && (
        <div className="sidebar-section">
          <div className="s-title">
            <span className={`step-badge${state.skewCorners ? ' done' : ''}`}>5</span>
            Perspective
          </div>
          {state.skewAdjustMode ? (
            <div className="mask-draw-panel">
              <div className="mask-draw-status">
                Drag corners to adjust · Enter or click to confirm
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-sm btn-full" onClick={studio.finaliseSkewAdjust}>Confirm</button>
                <button className="btn btn-sm" onClick={studio.cancelSkewAdjust}>Cancel</button>
              </div>
            </div>
          ) : state.skewDefMode ? (
            <div className="mask-draw-panel">
              <div className="mask-draw-status">
                Click 4 corners: TL → TR → BR → BL
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="btn btn-sm btn-full" onClick={studio.cancelSkewDef}>Cancel</button>
              </div>
            </div>
          ) : state.skewCorners ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <label style={{ fontSize: 11, color: 'var(--mid)', flex: 1 }}>Skew artworks</label>
                <input
                  type="checkbox"
                  checked={state.skewActive}
                  onChange={e => studio.setSkewActive(e.target.checked)}
                />
              </div>
              <button
                className="btn btn-sm btn-full"
                style={{ marginTop: 8 }}
                onClick={studio.startSkewDef}
              >
                Adjust corners
              </button>
              <button
                className="btn btn-sm btn-full"
                style={{ marginTop: 6, color: 'var(--mid)', background: 'transparent', border: '1px solid var(--border)' }}
                onClick={studio.clearSkew}
              >
                Remove perspective
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-sm btn-full"
                disabled={!hasElev}
                onClick={studio.startSkewDef}
              >
                Set Perspective
              </button>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mid)', lineHeight: 1.5 }}>
                Mark the 4 corners of the wall to apply perspective to artworks.
              </div>
            </>
          )}
        </div>
      )}

      {/* Client approval status */}
      {approvalStatus && (approvalStatus.pickedOption || approvalStatus.approved) && (
        <div className="sidebar-section" style={{ padding: '10px 14px', marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mid)', marginBottom: 8 }}>
            Client Status
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {approvalStatus.pickedOption && (
              <div className="studio-approval-chip picked">
                ✓ Client picked Option {approvalStatus.pickedOption}
              </div>
            )}
            {approvalStatus.approved ? (
              <>
                <div className="studio-approval-chip approved">
                  ✓ Approved {approvalStatus.approvedAt ? `· ${approvalStatus.approvedAt}` : ''}
                </div>
                {onUnapprove && (
                  <button
                    className="btn btn-sm btn-ghost btn-full"
                    style={{ marginTop: 4 }}
                    onClick={onUnapprove}
                  >
                    Unapprove (reopen for client)
                  </button>
                )}
              </>
            ) : approvalStatus.pickedOption ? (
              <div className="studio-approval-chip pending">
                ◌ Awaiting client approval
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Client notes (read-only) */}
      {clientNotes && (
        <div className="sidebar-section" style={{ background: 'var(--amber-light)', border: '1px solid rgba(139,111,71,.2)', padding: '10px 14px', marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
            {otherOptionNotes
              ? `Client Notes — Option ${otherOptionKey === 'B' ? 'A' : 'B'}`
              : 'Client Notes'}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--charcoal)', whiteSpace: 'pre-wrap' }}>{clientNotes}</div>
        </div>
      )}
      {otherOptionNotes && (
        <div className="sidebar-section" style={{ background: 'var(--amber-light)', border: '1px solid rgba(139,111,71,.2)', padding: '10px 14px', marginTop: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>
            Client Notes — Option {otherOptionKey}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--charcoal)', whiteSpace: 'pre-wrap' }}>{otherOptionNotes}</div>
        </div>
      )}

      {/* Cost summary */}
      {visibleArtworksWithPrice.length > 0 && (
        <div className="cost-summary">
          <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mid)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            Cost Summary
            <span title="All prices are exclusive of VAT" style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.02em', textTransform: 'none', opacity: 0.65, cursor: 'help', border: '1px solid currentColor', borderRadius: 3, padding: '0 3px', lineHeight: '14px' }}>ex-VAT</span>
          </div>
          {visibleArtworksWithPrice.map(a => (
            <div key={a.id} className="cost-row">
              <span className="cost-row-label">{a.name}</span>
              <span className="cost-row-value">{formatPrice(a.price)}</span>
            </div>
          ))}
          <div className="cost-row cost-total">
            <span>Elevation Total</span>
            <span className="cost-row-value">{formatPrice(elevationTotal)}</span>
          </div>
          {/* Budget line */}
          {budget != null && elevationTotal > 0 && (
            <div className="cost-row" style={{ marginTop: 4, opacity: 0.75 }}>
              <span>% of Budget</span>
              <span className="cost-row-value">{Math.round((elevationTotal / budget) * 100)}%</span>
            </div>
          )}
          {/* Budget edit */}
          {onBudgetChange && (
            editingBudget ? (
              <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                <input
                  className="field-input"
                  style={{ flex: 1, fontSize: 11, padding: '4px 7px', height: 26 }}
                  type="number"
                  min="0"
                  placeholder="Budget (£)"
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const v = parseFloat(budgetInput)
                      onBudgetChange(isNaN(v) || v <= 0 ? null : v)
                      setEditingBudget(false)
                    }
                    if (e.key === 'Escape') setEditingBudget(false)
                  }}
                  autoFocus
                />
                <button className="btn btn-sm btn-primary" style={{ fontSize: 11, padding: '0 8px', height: 26 }} onClick={() => {
                  const v = parseFloat(budgetInput)
                  onBudgetChange(isNaN(v) || v <= 0 ? null : v)
                  setEditingBudget(false)
                }}>Save</button>
              </div>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 6, fontSize: 10.5, padding: '2px 6px' }}
                onClick={() => { setBudgetInput(budget != null ? String(budget) : ''); setEditingBudget(true) }}
              >
                {budget != null ? `Budget: ${formatPrice(budget)} · Edit` : '+ Set Project Budget'}
              </button>
            )
          )}
          {hasMixedPricing && (
            <div style={{ marginTop: 8, padding: '7px 9px', background: '#FFF8F0', border: '1px solid rgba(139,111,71,.3)', fontSize: 10.5, color: 'var(--accent)', lineHeight: 1.5 }}>
              ⚠ Mixed pricing — some artworks include framing &amp; installation, others don't.
            </div>
          )}
        </div>
      )}

      {/* History (collapsible) */}
      {activityLogs.length > 0 && (
        <div className="sidebar-section">
          <button
            className="s-title"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            onClick={() => setHistoryOpen(o => !o)}
          >
            <span>History</span>
            <span style={{ fontSize: 10, color: 'var(--mid)' }}>{historyOpen ? '▲' : '▼'}</span>
          </button>
          {historyOpen && (
            <div className="activity-log" style={{ marginTop: 8, borderTop: 'none', paddingTop: 0 }}>
              {activityLogs.map(a => (
                <div key={a.id} className="activity-entry">
                  <div className={`activity-dot${a.type === 'approved' ? ' green' : ''}`} />
                  <div className="activity-text">{a.text}</div>
                  <div className="activity-time">
                    {new Date(a.createdAt).toLocaleString('en-GB', {
                      day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const FRAME_COLORS: Record<string, string> = {
  black: '#1a1a1a', white: '#f0ede8',
  'pale-wood': '#c4a882', 'mid-wood': '#7d5a35', 'dark-wood': '#3d2814',
}

interface ArtworkItemProps {
  art: { id: string; name: string; imageUrl: string | null; wCm: number; hCm: number; price: number; artist: string; framingStatus: string; visible: boolean; frameType?: string | null; frameWidthMm?: number | null; brightness?: number | null; shadowAngle?: number | null; shadowBlur?: number | null; shadowOpacity?: number | null }
  isSelected: boolean
  isExpanded: boolean
  hasScale: boolean
  isLocked: boolean
  onSelect: () => void
  onDeselect: () => void
  onToggleExpand: () => void
  onToggleVis: () => void
  onDelete: () => void
  onDimsChange: (w: number, h: number) => void
  onPriceChange: (p: number) => void
  onNameChange: (name: string) => void
  onArtistChange: (artist: string) => void
  onFrameChange: (frameType: string | null, frameWidthMm: number | null) => void
  onBrightnessChange: (b: number) => void
  onBrightnessApplyAll: (b: number) => void
  onShadowChange: (angle: number | null, blur: number | null, opacity: number | null) => void
  onShadowApplyAll: (angle: number | null, blur: number | null, opacity: number | null) => void
}

function ArtworkItem({ art, isSelected, isExpanded, hasScale, isLocked, onSelect, onDeselect, onToggleExpand, onToggleVis, onDelete, onDimsChange, onPriceChange, onNameChange, onArtistChange, onFrameChange, onBrightnessChange, onBrightnessApplyAll, onShadowChange, onShadowApplyAll }: ArtworkItemProps) {
  const dimsRef = useRef<HTMLDivElement>(null)
  const editBtnRef = useRef<HTMLButtonElement>(null)
  const [nameValue, setNameValue] = useState(art.name)
  const [artistValue, setArtistValue] = useState(art.artist ?? '')
  const [brightnessVal, setBrightnessVal] = useState(art.brightness ?? 1)
  const [shadowAngle, setShadowAngle] = useState(art.shadowAngle ?? 225)
  const [shadowBlur, setShadowBlur] = useState(art.shadowBlur ?? 0)
  const [shadowOpacity, setShadowOpacity] = useState(art.shadowOpacity ?? 0)

  useEffect(() => { setNameValue(art.name) }, [art.name])
  useEffect(() => { setArtistValue(art.artist ?? '') }, [art.artist])
  useEffect(() => { setBrightnessVal(art.brightness ?? 1) }, [art.brightness])
  useEffect(() => { setShadowAngle(art.shadowAngle ?? 225) }, [art.shadowAngle])
  useEffect(() => { setShadowBlur(art.shadowBlur ?? 0) }, [art.shadowBlur])
  useEffect(() => { setShadowOpacity(art.shadowOpacity ?? 0) }, [art.shadowOpacity])

  // Sync expand/collapse with controlled isExpanded prop
  useEffect(() => {
    const dr = dimsRef.current
    const btn = editBtnRef.current
    if (!dr || !btn) return
    dr.classList.toggle('visible', isExpanded)
    btn.classList.toggle('edit-active', isExpanded)
  }, [isExpanded])

  function handleShadowAngle(a: number) {
    setShadowAngle(a)
    onShadowChange(a, shadowBlur > 0 ? shadowBlur : null, shadowOpacity > 0 ? shadowOpacity : null)
  }
  function handleShadowBlur(b: number) {
    setShadowBlur(b)
    onShadowChange(shadowAngle, b > 0 ? b : null, shadowOpacity > 0 ? shadowOpacity : null)
  }
  function handleShadowOpacity(o: number) {
    setShadowOpacity(o)
    onShadowChange(shadowAngle, shadowBlur > 0 ? shadowBlur : null, o > 0 ? o : null)
  }

  return (
    <div className={`aw-item${isSelected ? ' selected' : ''}`} onClick={e => e.stopPropagation()}>
      <div className="aw-item-top" onClick={onSelect}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="aw-thumb" src={art.imageUrl ?? ''} alt={art.name} />
        <div className="aw-info">
          <div className="aw-name">{art.name}</div>
          {art.artist && <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 1 }}>{art.artist}</div>}
        </div>
        <div className="aw-btns">
          <button
            ref={editBtnRef}
            className="icon-btn"
            title="Edit dimensions & price"
            disabled={isLocked}
            onClick={e => { e.stopPropagation(); onToggleExpand() }}
          >
            <EditIcon />
          </button>
          <button
            className={`icon-btn${art.visible ? '' : ' hidden-art'}`}
            title={art.visible ? 'Hide' : 'Show'}
            disabled={isLocked}
            onClick={e => { e.stopPropagation(); onToggleVis() }}
          >
            {art.visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            className="icon-btn del"
            title="Remove"
            disabled={isLocked}
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="aw-dims-row" ref={dimsRef}>

        {/* Group 1: Identity */}
        <div className="aw-edit-group">
          <div className="aw-field-row">
            <label className="aw-f-label">Name</label>
            <input
              type="text"
              className="aw-f-input"
              value={nameValue}
              placeholder="Artwork name"
              disabled={isLocked}
              onClick={e => e.stopPropagation()}
              onChange={e => setNameValue(e.target.value)}
              onBlur={() => onNameChange(nameValue)}
              onKeyDown={e => { if (e.key === 'Enter') { onNameChange(nameValue); (e.target as HTMLInputElement).blur() } }}
            />
          </div>
          <div className="aw-field-row">
            <label className="aw-f-label">Artist Name</label>
            <input
              type="text"
              className="aw-f-input"
              value={artistValue}
              placeholder="Artist name"
              disabled={isLocked}
              onClick={e => e.stopPropagation()}
              onChange={e => setArtistValue(e.target.value)}
              onBlur={() => onArtistChange(artistValue)}
              onKeyDown={e => { if (e.key === 'Enter') { onArtistChange(artistValue); (e.target as HTMLInputElement).blur() } }}
            />
          </div>
        </div>

        {/* Group 2: Size & Price */}
        <div className="aw-edit-group">
          <div className="aw-field-row">
            <label className="aw-f-label">Size</label>
            <div className="aw-dims-group">
              <input
                type="number" className="dim-input" defaultValue={art.wCm} min={1} step={0.5}
                disabled={isLocked}
                onClick={e => e.stopPropagation()}
                onBlur={e => { const w = parseFloat(e.target.value); if (w > 0) onDimsChange(w, art.hCm) }}
                onKeyDown={e => { if (e.key === 'Enter') { const w = parseFloat((e.target as HTMLInputElement).value); if (w > 0) onDimsChange(w, art.hCm) } }}
              />
              <span className="dim-sep">×</span>
              <input
                type="number" className="dim-input" defaultValue={art.hCm} min={1} step={0.5}
                disabled={isLocked}
                onClick={e => e.stopPropagation()}
                onBlur={e => { const h = parseFloat(e.target.value); if (h > 0) onDimsChange(art.wCm, h) }}
                onKeyDown={e => { if (e.key === 'Enter') { const h = parseFloat((e.target as HTMLInputElement).value); if (h > 0) onDimsChange(art.wCm, h) } }}
              />
              <span className="dim-unit">cm</span>
            </div>
          </div>
          <div className="aw-field-row">
            <label className="aw-f-label">Price</label>
            <div className="aw-price-wrap">
              <span className="aw-price-prefix">£</span>
              <input
                type="number" className="aw-price-input" defaultValue={art.price || ''} placeholder="ex-VAT"
                disabled={isLocked}
                onClick={e => e.stopPropagation()}
                onBlur={e => onPriceChange(parseFloat(e.target.value) || 0)}
                onKeyDown={e => { if (e.key === 'Enter') onPriceChange(parseFloat((e.target as HTMLInputElement).value) || 0) }}
              />
            </div>
          </div>
        </div>

        {/* Group 3: Frame */}
        <div className="aw-edit-group" style={{ opacity: hasScale ? 1 : 0.45 }}>
          <div className="aw-field-row">
            <label className="aw-f-label">Frame</label>
            <select
              className="aw-frame-select"
              disabled={!hasScale || isLocked}
              value={art.frameType ?? ''}
              onClick={e => e.stopPropagation()}
              onChange={e => {
                const ft = e.target.value || null
                onFrameChange(ft, ft ? (art.frameWidthMm ?? 20) : null)
              }}
            >
              <option value="">None</option>
              {Object.keys(FRAME_COLORS).map(k => (
                <option key={k} value={k}>{k.replace('-', ' ')}</option>
              ))}
            </select>
            {art.frameType && (
              <>
                <input
                  type="number" className="dim-input" style={{ width: 44, marginLeft: 5 }}
                  disabled={!hasScale || isLocked}
                  defaultValue={art.frameWidthMm ?? 20} min={5} max={200} step={5}
                  title="Frame width (mm)"
                  onClick={e => e.stopPropagation()}
                  onBlur={e => { const v = parseFloat(e.target.value); if (v > 0) onFrameChange(art.frameType!, v) }}
                  onKeyDown={e => { if (e.key === 'Enter') { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) { onFrameChange(art.frameType!, v); onDeselect() } } }}
                />
                <span className="dim-unit" style={{ marginLeft: 3 }}>mm</span>
              </>
            )}
          </div>
        </div>

        {/* Group 4: Lighting */}
        <div className="aw-edit-group">
          <div className="aw-slider-row">
            <label className="aw-f-label">Brightness</label>
            <input
              type="range" min={0.5} max={1.5} step={0.05}
              value={brightnessVal}
              disabled={isLocked}
              onClick={e => e.stopPropagation()}
              onChange={e => {
                const v = parseFloat(e.target.value)
                setBrightnessVal(v)
                onBrightnessChange(v)
              }}
            />
            <span className="aw-slider-val">{brightnessVal.toFixed(2)}</span>
          </div>
          <div className="aw-shadow-section" onClick={e => e.stopPropagation()}>
            <div className="aw-shadow-header">
              <label className="aw-shadow-label">Shadow</label>
              <button
                className="aw-apply-all"
                title="Apply shadow to all artworks"
                disabled={isLocked}
                onClick={e => { e.stopPropagation(); onShadowApplyAll(shadowAngle, shadowBlur > 0 ? shadowBlur : null, shadowOpacity > 0 ? shadowOpacity : null) }}
              >
                Apply to all
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <SunAnglePicker angle={shadowAngle} onChange={handleShadowAngle} disabled={isLocked} />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="aw-slider-row">
                  <label style={{ fontSize: 10, color: 'var(--mid)', width: 42, flexShrink: 0 }}>Spread</label>
                  <input
                    type="range" min={0} max={20} step={1}
                    value={shadowBlur}
                    disabled={isLocked}
                    onChange={e => handleShadowBlur(parseFloat(e.target.value))}
                  />
                  <span className="aw-slider-val">{shadowBlur}</span>
                </div>
                <div className="aw-slider-row">
                  <label style={{ fontSize: 10, color: 'var(--mid)', width: 42, flexShrink: 0 }}>Opacity</label>
                  <input
                    type="range" min={0} max={0.8} step={0.05}
                    value={shadowOpacity}
                    disabled={isLocked}
                    onChange={e => handleShadowOpacity(parseFloat(e.target.value))}
                  />
                  <span className="aw-slider-val">{shadowOpacity.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── SUN ANGLE PICKER ───────────────────────────────────────────────────────
function SunAnglePicker({ angle, onChange, disabled }: { angle: number; onChange: (a: number) => void; disabled?: boolean }) {
  const cx = 36, cy = 36, r = 24
  const rad = (angle * Math.PI) / 180
  const sunX = cx + r * Math.sin(rad)
  const sunY = cy - r * Math.cos(rad)
  // Shadow direction: opposite of sun, short indicator line from centre
  const sdX = cx - r * 0.45 * Math.sin(rad)
  const sdY = cy + r * 0.45 * Math.cos(rad)

  function handleMouseDown(e: React.MouseEvent<SVGCircleElement>) {
    if (disabled) return
    e.preventDefault()
    e.stopPropagation()
    const svg = e.currentTarget.closest('svg') as SVGSVGElement | null
    if (!svg) return
    const rect = svg.getBoundingClientRect()

    function move(ev: MouseEvent) {
      const x = ev.clientX - rect.left - cx
      const y = ev.clientY - rect.top - cy
      const deg = Math.atan2(x, -y) * (180 / Math.PI)
      onChange(((deg % 360) + 360) % 360)
    }
    function up() {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const rays = [0, 45, 90, 135, 180, 225, 270, 315]

  return (
    <svg
      width={72} height={72}
      style={{ flexShrink: 0, cursor: 'default', userSelect: 'none' }}
    >
      <title>Drag sun to set shadow direction</title>
      {/* Warm background fill */}
      <circle cx={cx} cy={cy} r={r - 0.5} fill="var(--cream)" />
      {/* Track circle */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={1.5} />
      {/* Compass tick marks */}
      <line x1={cx} y1={cy - r + 5} x2={cx} y2={cy - r} stroke="var(--border)" strokeWidth={1.5} />
      <line x1={cx} y1={cy + r - 5} x2={cx} y2={cy + r} stroke="var(--border)" strokeWidth={1.5} />
      <line x1={cx - r + 5} y1={cy} x2={cx - r} y2={cy} stroke="var(--border)" strokeWidth={1.5} />
      <line x1={cx + r - 5} y1={cy} x2={cx + r} y2={cy} stroke="var(--border)" strokeWidth={1.5} />
      {/* Centre dot */}
      <circle cx={cx} cy={cy} r={2.5} fill="var(--mid)" />
      {/* Shadow direction indicator */}
      <line x1={cx} y1={cy} x2={sdX} y2={sdY} stroke="var(--mid)" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
      {/* Sun rays */}
      {rays.map(rayDeg => {
        const rr = (rayDeg * Math.PI) / 180
        return (
          <line
            key={rayDeg}
            x1={sunX + Math.cos(rr) * 8} y1={sunY + Math.sin(rr) * 8}
            x2={sunX + Math.cos(rr) * 11} y2={sunY + Math.sin(rr) * 11}
            stroke="#E8A800" strokeWidth={1.5}
          />
        )
      })}
      {/* Sun body (draggable) */}
      <circle
        cx={sunX} cy={sunY} r={7}
        fill={disabled ? 'var(--border)' : '#F5C518'}
        stroke="white" strokeWidth={1.5}
        style={{ cursor: disabled ? 'default' : 'grab' }}
        onMouseDown={handleMouseDown}
      />
    </svg>
  )
}

function EditIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
}
function EyeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function EyeOffIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
}
function TrashIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
}
