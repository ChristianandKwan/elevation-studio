'use client'

import { useRef, useState, useEffect } from 'react'
import { ArcSpinner } from '@/components/ui/Spinner'
import { checkArtworkDetail } from '@/lib/utils'
import type { Work } from '@/types'

export interface ArtMeta {
  name: string
  wCm: number
  hCm: number
  price: number
  artist: string
}

// Internal row type uses strings for numeric inputs to allow free editing
interface RowMeta {
  name: string
  wStr: string
  hStr: string
  price: number
  artist: string
}

interface Props {
  /** Awaited so the modal can stay disabled until the upload finishes. */
  onConfirm: (files: File[], metas: ArtMeta[]) => void | Promise<void>
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
   * consultant wants on hand before deciding where they go.
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

const DEFAULT_W = 40
const DEFAULT_H = 60

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
  // Single-file fields
  const [name, setName] = useState('')
  const [wCm, setWCm] = useState('')
  const [hCm, setHCm] = useState('')
  const [price, setPrice] = useState('')
  const [artist, setArtist] = useState('')
  // Multi-file per-row metas
  const [rowMetas, setRowMetas] = useState<RowMeta[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // "From this project": only offered when placing, and only when there is
  // something to offer. Starts on Upload so the familiar path is unchanged.
  const canPickExisting = mode === 'place' && !!onPlaceExisting && availableWorks.length > 0
  const [source, setSource] = useState<'upload' | 'existing'>('upload')
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
    if (selected.length === 1 && !name) {
      setName(selected[0].name.replace(/\.[^.]+$/, ''))
    }
    // Build per-row defaults for multi-file
    setRowMetas(selected.map(f => ({
      name: f.name.replace(/\.[^.]+$/, ''),
      wStr: String(DEFAULT_W),
      hStr: String(DEFAULT_H),
      price: 0,
      artist: '',
    })))
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
      setReading(false)
    })
    e.target.value = ''
  }

  function updateRow(i: number, patch: Partial<RowMeta>) {
    setRowMetas(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
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

    if (source === 'existing') {
      const picked = availableWorks.filter(w => pickedIds.has(w.id))
      if (!picked.length || !onPlaceExisting) return
      setSubmitting(true)
      try { await onPlaceExisting(picked) } finally { setSubmitting(false) }
      return
    }

    if (!files.length) return
    const metas: ArtMeta[] = files.length === 1
      ? [{
          name: name.trim() || 'Untitled',
          wCm: parseFloat(wCm) || DEFAULT_W,
          hCm: parseFloat(hCm) || DEFAULT_H,
          price: parseFloat(price) || 0,
          artist: artist.trim(),
        }]
      : rowMetas.map(m => ({
          name: m.name,
          wCm: parseFloat(m.wStr) || DEFAULT_W,
          hCm: parseFloat(m.hStr) || DEFAULT_H,
          price: m.price,
          artist: m.artist.trim(),
        }))

    setSubmitting(true)
    try {
      await onConfirm(files, metas)
    } finally {
      // The caller closes the modal on success; resetting matters for the
      // case where it fails and leaves the modal open.
      setSubmitting(false)
    }
  }

  const isMulti = files.length > 1
  const pickingExisting = source === 'existing'
  const canConfirm = pickingExisting ? pickedIds.size > 0 : files.length > 0

  const title = mode === 'index' ? 'Add a work to the project' : 'Add Artwork'
  const subtitle = pickingExisting
    ? 'Hang works the project already holds on this wall.'
    : mode === 'index'
      ? 'Upload the image and enter its details. It goes in the Index, ready to hang later.'
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

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ maxWidth: isMulti || pickingExisting ? 600 : undefined }}>
        <div className="modal-title">{title}</div>
        <div className="modal-sub">{subtitle}</div>

        {canPickExisting && (
          <div className="ble-seg work-pick-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!pickingExisting} className={`ble-seg-btn${!pickingExisting ? ' active' : ''}`} onClick={() => setSource('upload')}>
              Upload new
            </button>
            <button type="button" role="tab" aria-selected={pickingExisting} className={`ble-seg-btn${pickingExisting ? ' active' : ''}`} onClick={() => setSource('existing')}>
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
                  {w.imageUrl && <img src={w.imageUrl} alt="" />}
                </div>
                <div className="work-pick-main">
                  <span className="work-pick-title">{w.name}</span>
                  <span className="work-pick-meta">
                    {w.artist && <>{w.artist} · </>}{w.wCm} × {w.hCm} cm
                    {w.status !== 'proposed' && <> · {w.status}</>}
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
                {files.length === 1 && files[0].name}
                {files.length > 1 && `${files.length} artworks selected`}
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

        {/* Single file: original layout plus the artist field */}
        {!pickingExisting && !isMulti && (
          <>
            {previews.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: -4, marginBottom: 12 }}>
                {previews.map((src, i) => (
                  <div key={i} style={{ width: 52, height: 52, background: 'var(--cream)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                ))}
              </div>
            )}
            <div className="field">
              <label className="field-label">Name / Title</label>
              <input type="text" className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Abstract No. 3" />
            </div>
            <div className="field">
              <label className="field-label">Artist</label>
              <input type="text" className="field-input" list="index-artists" value={artist} onChange={e => setArtist(e.target.value)} placeholder="e.g. Sarah Chen" />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Width (cm)</label>
                <input type="number" className="field-input" value={wCm} onChange={e => setWCm(e.target.value)} placeholder="40" min={1} step={0.5} />
              </div>
              <div className="field">
                <label className="field-label">Height (cm)</label>
                <input type="number" className="field-input" value={hCm} onChange={e => setHCm(e.target.value)} placeholder="60" min={1} step={0.5} />
              </div>
            </div>
            {mode === 'place' && <DetailNote filePx={naturalWidths[0]} wCm={parseFloat(wCm) || DEFAULT_W} wallPxPerCm={wallPxPerCm} />}
            <div className="field">
              <label className="field-label">
                Price (£)
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--mid)', marginLeft: 5 }}>ex-VAT</span>
              </label>
              <input type="number" className="field-input" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 4500" min={0} step={50} />
            </div>
          </>
        )}

        {/* Multi-file: per-card layout */}
        {!pickingExisting && isMulti && rowMetas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {rowMetas.map((meta, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: 10, background: 'var(--cream)', borderRadius: 6, border: '1px solid var(--border)' }}>
                {/* Thumbnail */}
                <div style={{ width: 52, height: 52, background: 'white', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0, alignSelf: 'flex-start' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {previews[i] && <img src={previews[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                </div>
                {/* Fields */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {/* Name + Artist */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      className="field-input"
                      value={meta.name}
                      onChange={e => updateRow(i, { name: e.target.value })}
                      placeholder="Title"
                      style={{ flex: 1, fontSize: 12 }}
                    />
                    <input
                      type="text"
                      className="field-input"
                      list="index-artists"
                      value={meta.artist}
                      onChange={e => updateRow(i, { artist: e.target.value })}
                      placeholder="Artist"
                      style={{ flex: 1, fontSize: 12 }}
                    />
                  </div>
                  {/* Dimensions + Price */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>W (cm)</div>
                      <input type="text" inputMode="decimal" className="field-input" value={meta.wStr} onChange={e => updateRow(i, { wStr: e.target.value })} style={{ fontSize: 12, width: 60 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>H (cm)</div>
                      <input type="text" inputMode="decimal" className="field-input" value={meta.hStr} onChange={e => updateRow(i, { hStr: e.target.value })} style={{ fontSize: 12, width: 60 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>Price (£) <span style={{ opacity: 0.7 }}>ex-VAT</span></div>
                      <input type="number" className="field-input" value={meta.price || ''} onChange={e => updateRow(i, { price: parseFloat(e.target.value) || 0 })} min={0} step={50} placeholder="0" style={{ fontSize: 12, width: 80 }} />
                    </div>
                  </div>
                  {mode === 'place' && <DetailNote filePx={naturalWidths[i]} wCm={parseFloat(meta.wStr) || DEFAULT_W} wallPxPerCm={wallPxPerCm} />}
                </div>
              </div>
            ))}
          </div>
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
