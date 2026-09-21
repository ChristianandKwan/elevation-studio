'use client'

import { useEffect, useMemo, useState } from 'react'
import type { IndexElevation } from '@/lib/works'
import { DEFAULT_CHOICES, type ExportChoices } from '@/lib/export/types'

interface Props {
  projectId: string
  projectName: string
  elevations: IndexElevation[]
  /** How many works are set aside, so the checkbox can say what it would add. */
  setAsideCount: number
  /**
   * Photograph the budget as it would print. Returns null if it could not be
   * taken, which costs the pack that one picture and nothing else.
   */
  onCaptureBudget: () => Promise<string | null>
  onClose: () => void
}

interface PackResponse {
  url: string
  filename: string
  bytes: number
  included: { elevations: number; works: number; images: number }
}

/** "1.4 MB" — the pack's size, said the way a download dialogue would say it. */
function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * What goes in the export pack, and then the pack.
 *
 * The shape of the pack is settled — a markdown file plus images, assembled
 * downstream into the client proposal — so this screen is only ever about
 * *which* project it covers. Three decisions, in the order they matter:
 * which wall and which version of it, whether the works nobody is proposing
 * any more come too, and which pictures.
 *
 * Every elevation starts ticked, on the option the client picked where they
 * have picked one. That is the export somebody wants nine times in ten, so
 * the common case is open-and-click and the checkboxes are there for the
 * tenth.
 */
export default function ExportModal({
  projectId, projectName, elevations, setAsideCount, onCaptureBudget, onClose,
}: Props) {
  /**
   * The option chosen per elevation, or null where the elevation is out.
   *
   * Keyed by elevation rather than held as a flat list of option ids so that
   * unticking an elevation and picking a different option are the same
   * gesture in different places — and so the invariant the export relies on,
   * one option per elevation at most, cannot be expressed wrongly.
   */
  const [picked, setPicked] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {}
    for (const e of elevations) {
      if (e.options.length === 0) { initial[e.id] = null; continue }
      const pickedIndex = e.clientPickedOption
        ? e.optionKeys.indexOf(e.clientPickedOption)
        : -1
      initial[e.id] = (pickedIndex >= 0 ? e.options[pickedIndex] : e.options[0]).id
    }
    return initial
  })

  const [includeSetAside, setIncludeSetAside] = useState(DEFAULT_CHOICES.includeSetAside)
  const [includeWallRenders, setWallRenders] = useState(DEFAULT_CHOICES.includeWallRenders)
  const [includeWorkImages, setWorkImages] = useState(DEFAULT_CHOICES.includeWorkImages)
  const [includeThumbnails, setThumbnails] = useState(DEFAULT_CHOICES.includeThumbnails)
  const [includeBudgetImage, setBudgetImage] = useState(DEFAULT_CHOICES.includeBudgetImage)

  const [busy, setBusy] = useState(false)
  /** Which half of the work is running, so the wait can say what it is doing. */
  const [stage, setStage] = useState<'budget' | 'pack'>('pack')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<PackResponse | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, busy])

  const optionIds = useMemo(
    () => Object.values(picked).filter((id): id is string => !!id),
    [picked],
  )

  async function runExport() {
    setBusy(true)
    setError(null)
    setStage(includeBudgetImage ? 'budget' : 'pack')
    try {
      const choices: ExportChoices = {
        optionIds, includeSetAside, includeWallRenders, includeWorkImages,
        includeThumbnails, includeBudgetImage,
      }
      // Taken here rather than on the server: the budget's appearance is a
      // rendered screen, and the only place that screen exists is a browser.
      const budgetImage = includeBudgetImage ? await onCaptureBudget() : null
      setStage('pack')
      const res = await fetch(`/api/export/${projectId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...choices, budgetImage }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(body?.error ?? 'The export could not be built.')
      }
      setDone(body as PackResponse)
      // The zip is already in storage; this just starts the download. It is
      // not automatic on purpose — a file appearing unannounced in Downloads
      // is worse than a button that says what it will do.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The export could not be built.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="modal-bg open">
        <div className="modal export-modal">
          <div className="modal-title">The pack is ready</div>
          <div className="modal-sub">
            {done.included.elevations} elevation{done.included.elevations === 1 ? '' : 's'} ·{' '}
            {done.included.works} work{done.included.works === 1 ? '' : 's'} ·{' '}
            {done.included.images} image{done.included.images === 1 ? '' : 's'} ·{' '}
            {fileSize(done.bytes)}
          </div>
          <p className="export-hint">
            A markdown file with the images beside it. Unzip it, then give the
            whole folder to Claude Design to lay the proposal out.
          </p>
          <div className="modal-footer">
            <button className="btn" onClick={onClose}>Close</button>
            <a className="btn btn-primary" href={done.url} download={done.filename}>
              Download {done.filename}
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-bg open">
      <div className="modal export-modal">
        <div className="modal-title">Export {projectName}</div>
        <div className="modal-sub">
          A markdown file plus the pictures, to hand to Claude Design.
        </div>

        <div className="field">
          <label className="field-label">Which walls, and which version of each</label>
          {elevations.length === 0 ? (
            <p className="export-hint">This project has no elevations yet.</p>
          ) : (
            <div className="export-elevations">
              {elevations.map(elev => {
                const on = !!picked[elev.id]
                return (
                  <div key={elev.id} className={`export-elev${on ? '' : ' off'}`}>
                    <label className="export-check">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={elev.options.length === 0}
                        onChange={e => setPicked(p => ({
                          ...p,
                          [elev.id]: e.target.checked ? elev.options[0]?.id ?? null : null,
                        }))}
                      />
                      <span className="export-elev-name">{elev.name}</span>
                    </label>
                    {on && elev.options.length > 1 && (
                      <div className="export-options">
                        {elev.options.map((opt, i) => (
                          <button
                            key={opt.id}
                            type="button"
                            className={`export-opt${picked[elev.id] === opt.id ? ' active' : ''}`}
                            onClick={() => setPicked(p => ({ ...p, [elev.id]: opt.id }))}
                          >
                            {opt.title}
                            {elev.clientPickedOption === elev.optionKeys[i] && (
                              <span className="export-opt-picked"> · picked</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {elev.options.length === 0 && (
                      <span className="export-elev-note">nothing on it yet</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="field">
          <label className="field-label">What else goes in</label>
          <label className="export-check">
            <input
              type="checkbox"
              checked={includeSetAside}
              onChange={e => setIncludeSetAside(e.target.checked)}
            />
            <span>
              Works set aside
              <span className="export-check-note">
                {setAsideCount === 0
                  ? ' — nothing is set aside in this project'
                  : ` — ${setAsideCount} of them, in a section of their own, saying who decided`}
              </span>
            </span>
          </label>
        </div>

        <div className="field">
          <label className="field-label">Pictures</label>
          <label className="export-check">
            <input type="checkbox" checked={includeWallRenders}
              onChange={e => setWallRenders(e.target.checked)} />
            <span>
              The walls
              <span className="export-check-note"> — each one as it will look, framed and hung</span>
            </span>
          </label>
          <label className="export-check">
            <input type="checkbox" checked={includeWorkImages}
              onChange={e => setWorkImages(e.target.checked)} />
            <span>
              Each work on its own
              <span className="export-check-note"> — the original file, full size</span>
            </span>
          </label>
          <label className="export-check">
            <input type="checkbox" checked={includeBudgetImage}
              onChange={e => setBudgetImage(e.target.checked)} />
            <span>
              The budget as a page
              <span className="export-check-note"> — the budget screen as it would print, on A4</span>
            </span>
          </label>
          <label className="export-check">
            <input type="checkbox" checked={includeThumbnails}
              onChange={e => setThumbnails(e.target.checked)} />
            <span>
              Thumbnails
              <span className="export-check-note"> — small copies of the walls; rarely worth it</span>
            </span>
          </label>
        </div>

        {error && <div className="export-error">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={runExport}
            disabled={busy || optionIds.length === 0}
          >
            {busy ? 'Building…' : 'Build the pack'}
          </button>
        </div>
        {busy && (
          <p className="export-hint export-hint--busy">
            {stage === 'budget'
              ? 'Laying the budget out as a page…'
              : 'Rendering each wall at full size. A big project takes a few seconds.'}
          </p>
        )}
      </div>
    </div>
  )
}
