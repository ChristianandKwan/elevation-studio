'use client'

import { useRef, useState, useEffect } from 'react'
import { ArcSpinner } from '@/components/ui/Spinner'
import { checkArtworkDetail } from '@/lib/utils'
import { SET_ASIDE_BADGE } from '@/lib/works'
import {
  DEFAULT_W, EMPTY_BATCH, buildWorkMetas, fillArtistDown,
  type BatchMeta, type TypedWork, type WorkMeta,
} from '@/lib/workMeta'
import type { Work } from '@/types'

interface Props {
  /** Awaited so the modal can stay disabled until the upload finishes. */
  onConfirm: (files: File[], metas: WorkMeta[]) => void | Promise<void>
  onCancel: () => void
  /**
   * Detail the calibrated wall photograph carries, per centimetre. Lets the
   * modal say whether a chosen file has the pixels to hang at the size being
   * typed in. Null before calibration, when there is nothing to compare to.
   */
  wallPxPerCm?: number | null
  /**
   * `place` (the default) hangs the upload on the open option. `index` only
   * adds it to the project — no wall, no scale needed — for works the
   * consultant wants on hand before deciding where they go. The Index is also
   * where the catalogue detail is asked for: there is room to read it off a
   * gallery page, and nothing on a wall depends on it.
   */
  mode?: 'place' | 'index'
  /** Works the project already has that aren't on this option, offered under "From this project". */
  availableWorks?: Work[]
  onPlaceExisting?: (works: Work[]) => void | Promise<void>
}

/**
 * Advises when a file will be enlarged to fill its place on the wall. Never
 * blocks: a consultant who only has this image still needs to use it.
 */
function DetailNote({ filePx, wCm, wallPxPerCm }: { filePx: number | undefined; wCm: number; wallPxPerCm: number | null | undefined }) {
  const detail = checkArtworkDetail(filePx, wCm, wallPxPerCm)
  if (!detail || detail.ok) return null
  return (
    <div style={{
      marginTop: 6, padding: '5px 8px', fontSize: 11, lineHeight: 1.45,
      color: 'var(--amber)', background: 'var(--amber-light)', borderRadius: 'var(--radius-sm)',
    }}>
      At {wCm} cm wide this needs about <strong>{detail.neededPx.toLocaleString()} px</strong> to match
      the wall; this file is {detail.filePx.toLocaleString()} px. It will be enlarged, so it will look
      softer than its surroundings. Fine to continue if it is the only image you have.
    </div>
  )
}

/** A row of typed fields for a file, with nothing filled in but its name. */
function rowFor(file: File, artist: string): TypedWork {
  return {
    name: file.name.replace(/\.[^.]+$/, ''),
    // Left empty on purpose: the boxes show 40 and 60 as placeholders and
    // fall back to them, rather than filling in a guess that reads as typed.
    wStr: '',
    hStr: '',
    priceStr: '',
    artist,
  }
}

export default function AddArtworkModal({ onConfirm, onCancel, wallPxPerCm, mode = 'place', availableWorks = [], onPlaceExisting }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  /** Pixel width of each chosen file, read off the preview once it decodes. */
  const [naturalWidths, setNaturalWidths] = useState<number[]>([])
  const [sizeErrors, setSizeErrors] = useState<string[]>([])
  const [reading, setReading] = useState(false)
  // The modal stays mounted while addArtworks uploads, so without this a
  // second click fires a whole second batch — three clicks, three copies.
  const [submitting, setSubmitting] = useState(false)
  /** One row per chosen file; empty until something is chosen. */
  const [rows, setRows] = useState<TypedWork[]>([])
  /** Typed once for the whole batch. */
  const [batch, setBatch] = useState<BatchMeta>(EMPTY_BATCH)
  /** Rows whose artist was typed over by hand, which the batch leaves alone. */
  const [ownArtist, setOwnArtist] = useState<Set<number>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  // "From this project": only offered when placing, and only when there is
  // something to offer. Starts on Upload so the familiar path is unchanged.
  const canPickExisting = mode === 'place' && !!onPlaceExisting && availableWorks.length > 0
  const [pickFrom, setPickFrom] = useState<'upload' | 'existing'>('upload')
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  // Measure each preview so the detail advice can compare the file against the
  // wall. Reads the data URL already built for the thumbnails — no second read.
  useEffect(() => {
    let cancelled = false
    if (previews.length === 0) { setNaturalWidths([]); return }
    Promise.all(previews.map(src => new Promise<number>(resolve => {
      const img = new Image()
      img.onload = () => resolve(img.naturalWidth)
      img.onerror = () => resolve(0)
      img.src = src
    }))).then(widths => { if (!cancelled) setNaturalWidths(widths) })
    return () => { cancelled = true }
  }, [previews])

  function pickImages() {
    inputRef.current?.click()
  }

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).slice(0, 5)
    if (!selected.length) return

    const MAX = 20 * 1024 * 1024
    const tooBig = selected.filter(f => f.size > MAX)
    if (tooBig.length > 0) {
      setSizeErrors(tooBig.map(f => `${f.name} (${(f.size / 1024 / 1024).toFixed(1)} MB)`))
      e.target.value = ''
      return
    }
    setSizeErrors([])
    setFiles(selected)
    // A fresh selection replaces the last one, so the rows are rebuilt and
    // the hand-typed artists go with the works they belonged to. The batch
    // fields are typed about the batch, so they carry over.
    setRows(selected.map(f => rowFor(f, batch.artist)))
    setOwnArtist(new Set())
    const readers = selected.map(f => new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = ev => resolve(ev.target?.result as string)
      r.onerror = () => reject(new Error(`Failed to read ${f.name}`))
      r.readAsDataURL(f)
    }))
    setReading(true)
    Promise.all(readers).then(arr => {
      setPreviews(arr)
      setReading(false)
    }).catch(() => {
      setSizeErrors(['One or more files could not be read. Please try again.'])
      setFiles([])
      setRows([])
      setReading(false)
    })
    e.target.value = ''
  }

  function updateRow(i: number, patch: Partial<TypedWork>) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  /** Typing a work's own artist takes it out of the batch's reach. */
  function setRowArtist(i: number, artist: string) {
    updateRow(i, { artist })
    setOwnArtist(prev => new Set(prev).add(i))
  }

  /** The batch's artist, copied down onto every work not typed over by hand. */
  function setBatchArtist(artist: string) {
    setBatch(prev => ({ ...prev, artist }))
    setRows(prev => fillArtistDown(prev, artist, ownArtist))
  }

  function togglePicked(id: string) {
    setPickedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleConfirm() {
    if (submitting) return

    if (pickFrom === 'existing') {
      const picked = availableWorks.filter(w => pickedIds.has(w.id))
      if (!picked.length || !onPlaceExisting) return
      setSubmitting(true)
      try { await onPlaceExisting(picked) } finally { setSubmitting(false) }
      return
    }

    if (!files.length) return
    const metas = buildWorkMetas(rows, batch, { withCatalogue: mode === 'index' })

    setSubmitting(true)
    try {
      await onConfirm(files, metas)
    } finally {
      // The caller closes the modal on success; resetting matters for the
      // case where it fails and leaves the modal open.
      setSubmitting(false)
    }
  }

  const isSingle = files.length === 1
  const isMulti = files.length > 1
  const pickingExisting = pickFrom === 'existing'
  const canConfirm = pickingExisting ? pickedIds.size > 0 : files.length > 0
  /** The catalogue detail is asked for in the Index and nowhere else. */
  const withCatalogue = mode === 'index'
  /** Several works at once share one set of catalogue fields, typed once. */
  const showBatchFields = withCatalogue && isMulti

  const title = mode === 'index' ? 'Add a work to the project' : 'Add Artwork'
  const subtitle = pickingExisting
    ? 'Hang works the project already holds on this wall.'
    : mode === 'index'
      ? isMulti
        ? 'What they have in common, typed once — then each one’s title, size and price.'
        : 'Upload the image and enter its details. It goes in the Index, ready to hang later.'
      : isMulti
        ? 'Set details individually for each artwork.'
        : 'Upload the artwork image and enter its details.'
  const confirmLabel = submitting
    ? (mode === 'index' ? 'Adding…' : 'Placing…')
    : pickingExisting
      ? `Place ${pickedIds.size || ''} on Elevation`.replace('  ', ' ')
      : mode === 'index'
        ? 'Add to project'
        : 'Place on Elevation'

  /** Year, medium, edition and source, laid out the same way wherever they appear. */
  const catalogueFields = (
    <>
      <div className="field-row">
        <div className="field">
          <label className="field-label">Year</label>
          <input type="text" className="field-input" value={batch.year} placeholder="2018"
            onChange={e => setBatch(prev => ({ ...prev, year: e.target.value }))} />
        </div>
        <div className="field">
          <label className="field-label">Medium</label>
          <input type="text" className="field-input" value={batch.medium} placeholder="Screenprint"
            onChange={e => setBatch(prev => ({ ...prev, medium: e.target.value }))} />
        </div>
      </div>
      <div className="field">
        <label className="field-label">Edition</label>
        <input type="text" className="field-input" value={batch.edition} placeholder="Edition of 150"
          onChange={e => setBatch(prev => ({ ...prev, edition: e.target.value }))} />
      </div>
      <div className="field">
        <label className="field-label">Source</label>
        <input type="text" className="field-input" value={batch.source} placeholder="Cristea Roberts Gallery, London"
          onChange={e => setBatch(prev => ({ ...prev, source: e.target.value }))} />
      </div>
    </>
  )

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ maxWidth: isMulti || pickingExisting ? 600 : undefined }}>
        <div className="modal-title">{title}</div>
        <div className="modal-sub">{subtitle}</div>

        {canPickExisting && (
          <div className="ble-seg work-pick-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!pickingExisting} className={`ble-seg-btn${!pickingExisting ? ' active' : ''}`} onClick={() => setPickFrom('upload')}>
              Upload new
            </button>
            <button type="button" role="tab" aria-selected={pickingExisting} className={`ble-seg-btn${pickingExisting ? ' active' : ''}`} onClick={() => setPickFrom('existing')}>
              From this project ({availableWorks.length})
            </button>
          </div>
        )}

        {pickingExisting && (
          <div className="work-pick-list">
            {availableWorks.map(w => (
              <label key={w.id} className={`work-pick${pickedIds.has(w.id) ? ' selected' : ''}`}>
                <input type="checkbox" checked={pickedIds.has(w.id)} onChange={() => togglePicked(w.id)} />
                <div className="work-pick-thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {w.imageUrl && <img src={w.imageUrl} crossOrigin="anonymous" alt="" />}
                </div>
                <div className="work-pick-main">
                  <span className="work-pick-title">{w.name}</span>
                  <span className="work-pick-meta">
                    {w.artist && <>{w.artist} · </>}{w.wCm} × {w.hCm} cm
                    {w.setAside && <> · {SET_ASIDE_BADGE[w.setAside]}</>}
                  </span>
                </div>
              </label>
            ))}
          </div>
        )}

        {!pickingExisting && (
          <div className="field">
            <label className="field-label">Artwork Image</label>
            <div style={{ position: 'relative' }}>
              <div className={`upload-zone${files.length ? ' has-file' : ''}`} onClick={pickImages}>
                {files.length === 0 && 'Click to upload up to 5 artwork images'}
                {isSingle && files[0].name}
                {isMulti && `${files.length} artworks selected`}
              </div>
              {reading && <ArcSpinner size={36} />}
            </div>
            <input ref={inputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onFilesChange} />
            {sizeErrors.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: '#c0392b' }}>
                The following files exceed the 20 MB limit and were not added:
                <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                  {sizeErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* One file: the details form, shown only once there is a file to describe */}
        {!pickingExisting && isSingle && rows[0] && (
          <>
            {previews[0] && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -4, marginBottom: 12 }}>
                <div style={{ width: 52, height: 52, background: 'var(--cream)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={previews[0]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              </div>
            )}
            <div className="field">
              <label className="field-label">Name / Title</label>
              <input type="text" className="field-input" value={rows[0].name} onChange={e => updateRow(0, { name: e.target.value })} placeholder="e.g. Abstract No. 3" />
            </div>
            <div className="field">
              <label className="field-label">Artist</label>
              <input type="text" className="field-input" list="index-artists" value={batch.artist} onChange={e => setBatchArtist(e.target.value)} placeholder="e.g. Sarah Chen" />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Width (cm)</label>
                <input type="number" className="field-input" value={rows[0].wStr} onChange={e => updateRow(0, { wStr: e.target.value })} placeholder="40" min={1} step={0.5} />
              </div>
              <div className="field">
                <label className="field-label">Height (cm)</label>
                <input type="number" className="field-input" value={rows[0].hStr} onChange={e => updateRow(0, { hStr: e.target.value })} placeholder="60" min={1} step={0.5} />
              </div>
            </div>
            {mode === 'place' && <DetailNote filePx={naturalWidths[0]} wCm={parseFloat(rows[0].wStr) || DEFAULT_W} wallPxPerCm={wallPxPerCm} />}
            <div className="field">
              <label className="field-label">
                Price (£)
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--mid)', marginLeft: 5 }}>ex-VAT</span>
              </label>
              <input type="number" className="field-input" value={rows[0].priceStr} onChange={e => updateRow(0, { priceStr: e.target.value })} placeholder="e.g. 4500" min={0} step={50} />
            </div>
            {withCatalogue && catalogueFields}
          </>
        )}

        {/* Several files: what they share, then a card each */}
        {!pickingExisting && isMulti && (
          <>
            {showBatchFields && (
              <div className="batch-fields">
                <div className="batch-fields-head">
                  <span className="batch-fields-title">All {files.length} works</span>
                  <span className="batch-fields-hint">Typed once. Change any of it per work in the Index.</span>
                </div>
                <div className="field">
                  <label className="field-label">Artist</label>
                  <input type="text" className="field-input" list="index-artists" value={batch.artist} onChange={e => setBatchArtist(e.target.value)} placeholder="e.g. Sarah Chen" />
                </div>
                {catalogueFields}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {rows.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: 10, background: 'var(--cream)', borderRadius: 6, border: '1px solid var(--border)' }}>
                  {/* Thumbnail */}
                  <div style={{ width: 52, height: 52, background: 'white', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-start' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {previews[i] && <img src={previews[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                  </div>
                  {/* Fields */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* Title + Artist */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        className="field-input"
                        value={row.name}
                        onChange={e => updateRow(i, { name: e.target.value })}
                        placeholder="Title"
                        style={{ flex: 1, fontSize: 12 }}
                      />
                      <input
                        type="text"
                        className="field-input"
                        list="index-artists"
                        value={row.artist}
                        onChange={e => setRowArtist(i, e.target.value)}
                        placeholder="Artist"
                        style={{ flex: 1, fontSize: 12 }}
                      />
                    </div>
                    {/* Dimensions + Price */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>W (cm)</div>
                        <input type="text" inputMode="decimal" className="field-input" value={row.wStr} onChange={e => updateRow(i, { wStr: e.target.value })} placeholder="40" style={{ fontSize: 12, width: 60 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>H (cm)</div>
                        <input type="text" inputMode="decimal" className="field-input" value={row.hStr} onChange={e => updateRow(i, { hStr: e.target.value })} placeholder="60" style={{ fontSize: 12, width: 60 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>Price (£) <span style={{ opacity: 0.7 }}>ex-VAT</span></div>
                        <input type="number" className="field-input" value={row.priceStr} onChange={e => updateRow(i, { priceStr: e.target.value })} min={0} step={50} placeholder="0" style={{ fontSize: 12, width: 80 }} />
                      </div>
                    </div>
                    {mode === 'place' && <DetailNote filePx={naturalWidths[i]} wCm={parseFloat(row.wStr) || DEFAULT_W} wallPxPerCm={wallPxPerCm} />}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!canConfirm || submitting}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
