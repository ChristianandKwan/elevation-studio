'use client'

import { useRef, useState, useEffect } from 'react'
import { ArcSpinner } from '@/components/ui/Spinner'

export interface ArtMeta {
  name: string
  wCm: number
  hCm: number
  price: number
  artist: string
  framingStatus: 'framed' | 'requires_framing'
  framingCost: number | null
}

// Internal row type uses strings for numeric inputs to allow free editing
interface RowMeta {
  name: string
  wStr: string
  hStr: string
  price: number
  artist: string
  framingStatus: 'framed' | 'requires_framing'
  framingCostStr: string
}

interface Props {
  /** Awaited so the modal can stay disabled until the upload finishes. */
  onConfirm: (files: File[], metas: ArtMeta[]) => void | Promise<void>
  onCancel: () => void
}

const DEFAULT_W = 40
const DEFAULT_H = 60

export default function AddArtworkModal({ onConfirm, onCancel }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
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
  const [framingStatus, setFramingStatus] = useState<'framed' | 'requires_framing'>('framed')
  const [framingCost, setFramingCost] = useState('')
  // Multi-file per-row metas
  const [rowMetas, setRowMetas] = useState<RowMeta[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

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
      framingStatus: 'framed',
      framingCostStr: '',
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

  async function handleConfirm() {
    if (!files.length || submitting) return

    const metas: ArtMeta[] = files.length === 1
      ? [{
          name: name.trim() || 'Untitled',
          wCm: parseFloat(wCm) || DEFAULT_W,
          hCm: parseFloat(hCm) || DEFAULT_H,
          price: parseFloat(price) || 0,
          artist: artist.trim(),
          framingStatus,
          framingCost: framingStatus === 'requires_framing' ? (parseFloat(framingCost) || null) : null,
        }]
      : rowMetas.map(m => ({
          name: m.name,
          wCm: parseFloat(m.wStr) || DEFAULT_W,
          hCm: parseFloat(m.hStr) || DEFAULT_H,
          price: m.price,
          artist: m.artist.trim(),
          framingStatus: m.framingStatus,
          framingCost: m.framingStatus === 'requires_framing' ? (parseFloat(m.framingCostStr) || null) : null,
        }))

    setSubmitting(true)
    try {
      await onConfirm(files, metas)
    } finally {
      // addArtworks closes the modal on success; resetting matters for the
      // case where it fails and leaves the modal open.
      setSubmitting(false)
    }
  }

  const isMulti = files.length > 1

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ maxWidth: isMulti ? 600 : undefined }}>
        <div className="modal-title">Add Artwork</div>
        <div className="modal-sub">
          {isMulti
            ? 'Set details individually for each artwork.'
            : 'Upload the artwork image and enter its details.'}
        </div>

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

        {/* Single file: original layout + artist & framing fields */}
        {!isMulti && (
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
              <input type="text" className="field-input" value={artist} onChange={e => setArtist(e.target.value)} placeholder="e.g. Sarah Chen" />
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
            <div className="field">
              <label className="field-label">
                Price (£)
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--mid)', marginLeft: 5 }}>ex-VAT</span>
              </label>
              <input type="number" className="field-input" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 4500" min={0} step={50} />
            </div>
            <div className="field">
              <label className="field-label">Framing</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className={`btn btn-sm${framingStatus === 'framed' ? ' btn-primary' : ''}`}
                  onClick={() => setFramingStatus('framed')}
                >
                  Framed
                </button>
                <button
                  type="button"
                  className={`btn btn-sm${framingStatus === 'requires_framing' ? ' btn-primary' : ''}`}
                  onClick={() => setFramingStatus('requires_framing')}
                >
                  Requires framing
                </button>
              </div>
            </div>
            {framingStatus === 'requires_framing' && (
              <div className="field">
                <label className="field-label">Framing Cost (£)</label>
                <input type="number" className="field-input" value={framingCost} onChange={e => setFramingCost(e.target.value)} placeholder="e.g. 350" min={0} step={50} />
              </div>
            )}
          </>
        )}

        {/* Multi-file: per-card layout */}
        {isMulti && rowMetas.length > 0 && (
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
                  {/* Framing */}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn btn-sm${meta.framingStatus === 'framed' ? ' btn-primary' : ''}`}
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => updateRow(i, { framingStatus: 'framed' })}
                    >
                      Framed
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm${meta.framingStatus === 'requires_framing' ? ' btn-primary' : ''}`}
                      style={{ fontSize: 11, padding: '2px 8px' }}
                      onClick={() => updateRow(i, { framingStatus: 'requires_framing' })}
                    >
                      Requires framing
                    </button>
                    {meta.framingStatus === 'requires_framing' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--mid)' }}>Framing £</span>
                        <input
                          type="number"
                          className="field-input"
                          value={meta.framingCostStr}
                          onChange={e => updateRow(i, { framingCostStr: e.target.value })}
                          placeholder="0"
                          min={0}
                          step={50}
                          style={{ fontSize: 12, width: 80 }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onCancel} disabled={submitting}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!files.length || submitting}>
            {submitting ? 'Placing…' : 'Place on Elevation'}
          </button>
        </div>
      </div>
    </div>
  )
}
