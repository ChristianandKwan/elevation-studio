'use client'

import { useRef, useState, useEffect } from 'react'
import type { useStudio } from '@/hooks/useStudio'
import type { ActivityLog } from '@/types'
import { priceLabel, formatPrice } from '@/lib/utils'

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

  const hasElev = !!state.elev
  const hasScale = !!state.scale
  const hasArts = state.artworks.length > 0
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
    const first = visibleArtworksWithPrice[0].priceIncludes
    return visibleArtworksWithPrice.some(a => a.priceIncludes !== first)
  })()

  return (
    <div className="studio-sidebar">
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
          disabled={!hasScale}
          onClick={() => setShowArtModal(true)}
        >
          + Add Artwork
        </button>

        {hasArts && (
          <>
            {state.selIds.size > 1 && (
              <div className="multi-select-bar">
                <span>{state.selIds.size} selected</span>
                <button onClick={() => onRequestDeleteArtworks(new Set(state.selIds))}>Delete all</button>
                <button onClick={() => studio.selectArtwork(null)}>Deselect</button>
              </div>
            )}
            <div className="artwork-list">
              {state.artworks.map(art => (
                <ArtworkItem
                  key={art.id}
                  art={art}
                  isSelected={state.selIds.has(art.id)}
                  hasScale={hasScale}
                  onSelect={() => studio.selectArtwork(art.id)}
                  onToggleVis={() => studio.toggleVisibility(art.id)}
                  onDelete={() => onRequestDeleteArtworks(new Set([art.id]))}
                  onDimsChange={(w, h) => studio.updateArtworkDims(art.id, w, h)}
                  onPriceChange={(p) => studio.updateArtworkPrice(art.id, p)}
                  onNameChange={(n) => studio.updateArtworkName(art.id, n)}
                  onFrameChange={(ft, fw) => studio.updateArtworkFrame(art.id, ft, fw)}
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
          <div style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mid)', marginBottom: 8 }}>
            Cost Summary
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
  art: { id: string; name: string; imageUrl: string | null; wCm: number; hCm: number; price: number; priceIncludes: string; visible: boolean; frameType?: string | null; frameWidthMm?: number | null }
  isSelected: boolean
  hasScale: boolean
  onSelect: () => void
  onToggleVis: () => void
  onDelete: () => void
  onDimsChange: (w: number, h: number) => void
  onPriceChange: (p: number) => void
  onNameChange: (name: string) => void
  onFrameChange: (frameType: string | null, frameWidthMm: number | null) => void
}

function ArtworkItem({ art, isSelected, hasScale, onSelect, onToggleVis, onDelete, onDimsChange, onPriceChange, onNameChange, onFrameChange }: ArtworkItemProps) {
  const dimsRef = useRef<HTMLDivElement>(null)
  const editBtnRef = useRef<HTMLButtonElement>(null)
  const [nameValue, setNameValue] = useState(art.name)

  useEffect(() => { setNameValue(art.name) }, [art.name])

  function toggleDims() {
    const dr = dimsRef.current
    const btn = editBtnRef.current
    if (!dr || !btn) return
    const open = dr.classList.toggle('visible')
    btn.classList.toggle('edit-active', open)
  }

  return (
    <div className={`aw-item${isSelected ? ' selected' : ''}`}>
      <div className="aw-item-top" onClick={onSelect}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="aw-thumb" src={art.imageUrl ?? ''} alt={art.name} />
        <div className="aw-info">
          <div className="aw-name">{art.name}</div>
          <div className="aw-price">
            {art.price ? `${formatPrice(art.price)} (${priceLabel(art.priceIncludes)})` : 'No price set'}
          </div>
        </div>
        <div className="aw-btns">
          <button
            ref={editBtnRef}
            className="icon-btn"
            title="Edit dimensions & price"
            onClick={e => { e.stopPropagation(); toggleDims() }}
          >
            <EditIcon />
          </button>
          <button
            className={`icon-btn${art.visible ? '' : ' hidden-art'}`}
            title={art.visible ? 'Hide' : 'Show'}
            onClick={e => { e.stopPropagation(); onToggleVis() }}
          >
            {art.visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            className="icon-btn del"
            title="Remove"
            onClick={e => { e.stopPropagation(); onDelete() }}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      <div className="aw-dims-row" ref={dimsRef}>
        <input
          type="text"
          className="name-input"
          value={nameValue}
          placeholder="Artwork name"
          onClick={e => e.stopPropagation()}
          onChange={e => setNameValue(e.target.value)}
          onBlur={() => onNameChange(nameValue)}
          onKeyDown={e => { if (e.key === 'Enter') { onNameChange(nameValue); (e.target as HTMLInputElement).blur() } }}
          style={{ gridColumn: '1 / -1', marginBottom: 6 }}
        />
        <label>W</label>
        <input
          type="number" className="dim-input" defaultValue={art.wCm} min={1} step={0.5}
          onClick={e => e.stopPropagation()}
          onBlur={e => { const w = parseFloat(e.target.value); if (w > 0) onDimsChange(w, art.hCm) }}
          onKeyDown={e => { if (e.key === 'Enter') { const w = parseFloat((e.target as HTMLInputElement).value); if (w > 0) onDimsChange(w, art.hCm) } }}
        />
        <span className="dim-sep">×</span>
        <label>H</label>
        <input
          type="number" className="dim-input" defaultValue={art.hCm} min={1} step={0.5}
          onClick={e => e.stopPropagation()}
          onBlur={e => { const h = parseFloat(e.target.value); if (h > 0) onDimsChange(art.wCm, h) }}
          onKeyDown={e => { if (e.key === 'Enter') { const h = parseFloat((e.target as HTMLInputElement).value); if (h > 0) onDimsChange(art.wCm, h) } }}
        />
        <label>cm</label>
        <label style={{ marginLeft: 6 }}>£</label>
        <input
          type="number" className="price-input" defaultValue={art.price || ''} placeholder="Price"
          onClick={e => e.stopPropagation()}
          onBlur={e => onPriceChange(parseFloat(e.target.value) || 0)}
          onKeyDown={e => { if (e.key === 'Enter') onPriceChange(parseFloat((e.target as HTMLInputElement).value) || 0) }}
        />
        {/* Frame controls */}
        <div style={{ width: '100%', display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, opacity: hasScale ? 1 : 0.45 }}>
          <label style={{ fontSize: 10, color: 'var(--mid)', minWidth: 34 }}>Frame</label>
          <select
            className="dim-input"
            style={{ flex: 1, height: 24, fontSize: 11 }}
            disabled={!hasScale}
            value={art.frameType ?? ''}
            onClick={e => e.stopPropagation()}
            onChange={e => {
              const ft = e.target.value || null
              onFrameChange(ft, ft ? (art.frameWidthMm ?? 40) : null)
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
                type="number" className="dim-input" style={{ width: 46, fontSize: 11 }}
                disabled={!hasScale}
                defaultValue={art.frameWidthMm ?? 40} min={5} max={200} step={5}
                title="Frame width (mm)"
                onClick={e => e.stopPropagation()}
                onBlur={e => { const v = parseFloat(e.target.value); if (v > 0) onFrameChange(art.frameType!, v) }}
                onKeyDown={e => { if (e.key === 'Enter') { const v = parseFloat((e.target as HTMLInputElement).value); if (v > 0) onFrameChange(art.frameType!, v) } }}
              />
              <label style={{ fontSize: 10, color: 'var(--mid)' }}>mm</label>
            </>
          )}
        </div>
      </div>
    </div>
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
