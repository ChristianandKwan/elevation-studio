'use client'

import { MoneyFields } from '@/components/budget/ArtworkLineEditor'
import { WORK_STATUSES, WORK_STATUS_LABEL, WORK_STATUS_HINT } from '@/lib/works'
import type { IndexElevation, WorkPatch } from '@/lib/works'
import type { Work } from '@/types'

interface Props {
  work: Work
  elevations: IndexElevation[]
  onChange: (patch: WorkPatch) => void
  onDelete: () => void
  onDone: () => void
}

/** A typed size, or the current one if what was typed isn't a size. */
function cm(value: string, current: number): number {
  const n = parseFloat(value)
  return Number.isFinite(n) && n > 0 ? n : current
}

/** Free text stored as null when empty, so an empty box doesn't print as a blank line. */
function text(value: string): string | null {
  return value.trim() ? value : null
}

/**
 * Everything about a work in one place: what it is, where it comes from,
 * where it stands, and — through the budget's own fields — what it costs.
 */
export default function WorkEditor({ work, elevations, onChange, onDelete, onDone }: Props) {
  return (
    <div className="ble index-editor">
      <div className="ble-head">
        <div>
          <span className="ble-title">{work.name}</span>
          {work.artist && <span className="ble-artist">{work.artist}</span>}
        </div>
        <div className="index-editor-actions">
          <button type="button" className="budget-cost-edit budget-cost-edit--danger" onClick={onDelete}>
            Delete from project
          </button>
          <button type="button" className="btn btn-sm btn-primary" onClick={onDone}>Done</button>
        </div>
      </div>

      <div className="ble-grid index-editor-grid">
        <div className="ble-field">
          <span className="ble-label">Title</span>
          <input
            type="text"
            className="ble-input ble-input--label"
            value={work.name}
            aria-label="Title"
            onChange={e => onChange({ name: e.target.value })}
          />
        </div>
        <div className="ble-field">
          <span className="ble-label">Artist</span>
          <input
            type="text"
            className="ble-input ble-input--label"
            list="index-artists"
            value={work.artist}
            placeholder="As it should appear in the proposal"
            aria-label="Artist"
            onChange={e => onChange({ artist: e.target.value })}
          />
        </div>

        <div className="ble-field ble-field--wide">
          <span className="ble-label">Size</span>
          <div className="index-size">
            <div className="ble-input-wrap">
              <input type="number" className="ble-input" value={work.wCm} min={1} step={0.5} aria-label="Width in centimetres"
                onChange={e => onChange({ wCm: cm(e.target.value, work.wCm) })} />
              <span className="ble-suffix">cm wide</span>
            </div>
            <div className="ble-input-wrap">
              <input type="number" className="ble-input" value={work.hCm} min={1} step={0.5} aria-label="Height in centimetres"
                onChange={e => onChange({ hCm: cm(e.target.value, work.hCm) })} />
              <span className="ble-suffix">cm high</span>
            </div>
          </div>
          <p className="ble-hint">A print&rsquo;s size is its size: this changes it on every wall it hangs on.</p>
        </div>

        <div className="ble-field">
          <span className="ble-label">Year</span>
          <input type="text" className="ble-input ble-input--label" value={work.year ?? ''} placeholder="2018" aria-label="Year"
            onChange={e => onChange({ year: text(e.target.value) })} />
        </div>
        <div className="ble-field">
          <span className="ble-label">Medium</span>
          <input type="text" className="ble-input ble-input--label" value={work.medium ?? ''} placeholder="Screenprint" aria-label="Medium"
            onChange={e => onChange({ medium: text(e.target.value) })} />
        </div>
        <div className="ble-field">
          <span className="ble-label">Edition</span>
          <input type="text" className="ble-input ble-input--label" value={work.edition ?? ''} placeholder="Edition of 150" aria-label="Edition"
            onChange={e => onChange({ edition: text(e.target.value) })} />
        </div>
        <div className="ble-field">
          <span className="ble-label">Source</span>
          <input type="text" className="ble-input ble-input--label" value={work.source ?? ''} placeholder="Cristea Roberts Gallery, London" aria-label="Source"
            onChange={e => onChange({ source: text(e.target.value) })} />
        </div>

        <div className="ble-field ble-field--wide">
          <span className="ble-label">Status</span>
          <div className="ble-seg">
            {WORK_STATUSES.map(s => (
              <button
                key={s}
                type="button"
                className={`ble-seg-btn${work.status === s ? ' active' : ''}`}
                onClick={() => onChange({ status: s })}
              >
                {WORK_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="ble-hint">{WORK_STATUS_HINT[work.status]}</p>
        </div>

        <div className="ble-field ble-field--wide">
          <span className="ble-label">Considered for</span>
          <select
            className="index-select"
            value={work.consideredFor ?? ''}
            aria-label="Considered for"
            onChange={e => onChange({ consideredFor: e.target.value || null })}
          >
            <option value="">— No particular wall —</option>
            {elevations.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <p className="ble-hint">The wall this is in mind for, whether or not it is hung there yet.</p>
        </div>
      </div>

      <MoneyFields
        artwork={{ ...work, workId: work.id, visible: true }}
        onChange={onChange}
      />
    </div>
  )
}
