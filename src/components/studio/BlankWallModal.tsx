'use client'

import { useEffect, useState } from 'react'
import {
  DEFAULT_WALL_COLOR, DEFAULT_WALL_H_CM, DEFAULT_WALL_W_CM,
  WALL_MAX_CM, WALL_MIN_CM, WALL_PRESETS, wallHex,
} from '@/lib/wall'

interface Props {
  /** The wall as it stands, when one has already been set. */
  wCm: number | null
  hCm: number | null
  color: string | null
  onConfirm: (wCm: number, hCm: number, color: string) => void
  onCancel: () => void
}

/**
 * The wall as a measurement: how wide, how tall, what colour.
 *
 * There is no scale step afterwards. A photograph has to be calibrated by
 * drawing a line along something of known length; a wall typed in centimetres
 * already knows how big it is.
 */
export default function BlankWallModal({ wCm, hCm, color, onConfirm, onCancel }: Props) {
  const existing = wCm != null && hCm != null
  const [w, setW] = useState(String(wCm ?? DEFAULT_WALL_W_CM))
  const [h, setH] = useState(String(hCm ?? DEFAULT_WALL_H_CM))
  const [hex, setHex] = useState(wallHex(color ?? DEFAULT_WALL_COLOR))

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  const wNum = parseFloat(w)
  const hNum = parseFloat(h)
  const inRange = (n: number) => Number.isFinite(n) && n >= WALL_MIN_CM && n <= WALL_MAX_CM
  const valid = inRange(wNum) && inRange(hNum)

  function handleConfirm() {
    if (!valid) return
    onConfirm(wNum, hNum, hex)
  }

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="modal-title">{existing ? 'Edit the wall' : 'Set a plain wall'}</div>
        <div className="modal-sub">
          For a wall with no photograph — a room that isn&apos;t built yet, or one
          nobody got a usable picture of. Give it its real size and everything
          hangs at true scale, with no scale line to draw.
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">Width in centimetres</label>
            <input
              type="number"
              className="field-input"
              value={w}
              onChange={e => setW(e.target.value)}
              min={WALL_MIN_CM}
              max={WALL_MAX_CM}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label className="field-label">Height in centimetres</label>
            <input
              type="number"
              className="field-input"
              value={h}
              onChange={e => setH(e.target.value)}
              min={WALL_MIN_CM}
              max={WALL_MAX_CM}
              onKeyDown={e => e.key === 'Enter' && handleConfirm()}
            />
          </div>
        </div>

        <div className="field">
          <label className="field-label">Wall colour</label>
          <div className="wall-swatches">
            {WALL_PRESETS.map(p => (
              <button
                key={p.hex}
                type="button"
                title={p.label}
                aria-label={p.label}
                className={`wall-swatch${hex === p.hex ? ' selected' : ''}`}
                style={{ background: p.hex }}
                onClick={() => setHex(p.hex)}
              />
            ))}
          </div>
          {/* The presets cover most rooms; this is here for the ones they don't. */}
          <div className="wall-colour-row">
            <input
              type="color"
              className="wall-colour-input"
              value={hex}
              onChange={e => setHex(wallHex(e.target.value))}
            />
            <span className="wall-colour-hex">{hex}</span>
          </div>
        </div>

        {/* What the wall will actually look like, at the shape it will be. */}
        <div className="field">
          <label className="field-label">Preview</label>
          <div className="wall-preview-box">
            <div
              className="wall-preview"
              style={{
                background: hex,
                aspectRatio: valid ? `${wNum} / ${hNum}` : '400 / 260',
              }}
            />
          </div>
        </div>

        {!valid && (
          <div className="detail-note">
            Width and height are in centimetres, between {WALL_MIN_CM} and {WALL_MAX_CM}.
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!valid}>
            {existing ? 'Update wall' : 'Set wall'}
          </button>
        </div>
      </div>
    </div>
  )
}
