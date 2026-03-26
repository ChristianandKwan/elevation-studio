'use client'

import { useState } from 'react'

interface Props {
  lineDispPx: number
  onConfirm: (cm: number) => void
  onCancel: () => void
}

export default function CalibrationModal({ lineDispPx, onConfirm, onCancel }: Props) {
  const [cm, setCm] = useState('')

  function handleConfirm() {
    const val = parseFloat(cm)
    if (!val || val <= 0) return
    onConfirm(val)
  }

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="modal-title">Set Scale</div>
        <div className="modal-sub">
          You drew a {Math.round(lineDispPx)}px line. Enter its real-world length in cm.
        </div>
        <div className="field">
          <label className="field-label">Length in centimetres</label>
          <input
            type="number"
            className="field-input"
            value={cm}
            onChange={e => setCm(e.target.value)}
            placeholder="e.g. 280 for ceiling height"
            min={1}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleConfirm()}
          />
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!cm || parseFloat(cm) <= 0}>
            Set Scale
          </button>
        </div>
      </div>
    </div>
  )
}
