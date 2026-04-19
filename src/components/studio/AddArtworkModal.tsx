'use client'

import { useRef, useState } from 'react'

export interface ArtMeta {
  name: string
  wCm: number
  hCm: number
  price: number
}

// Internal row type uses strings for dimension inputs to allow free editing
interface RowMeta {
  name: string
  wStr: string
  hStr: string
  price: number
}

interface Props {
  onConfirm: (files: File[], metas: ArtMeta[]) => void
  onCancel: () => void
}

const DEFAULT_W = 40
const DEFAULT_H = 60

export default function AddArtworkModal({ onConfirm, onCancel }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [sizeErrors, setSizeErrors] = useState<string[]>([])
  // Single-file fields
  const [name, setName] = useState('')
  const [wCm, setWCm] = useState('')
  const [hCm, setHCm] = useState('')
  const [price, setPrice] = useState('')
  // Multi-file per-row metas
  const [rowMetas, setRowMetas] = useState<RowMeta[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

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
    })))
    const readers = selected.map(f => new Promise<string>(resolve => {
      const r = new FileReader()
      r.onload = ev => resolve(ev.target?.result as string)
      r.readAsDataURL(f)
    }))
    Promise.all(readers).then(setPreviews)
    e.target.value = ''
  }

  function updateRow(i: number, patch: Partial<RowMeta>) {
    setRowMetas(prev => prev.map((m, idx) => idx === i ? { ...m, ...patch } : m))
  }

  function handleConfirm() {
    if (!files.length) return
    if (files.length === 1) {
      onConfirm(files, [{
        name: name.trim() || 'Untitled',
        wCm: parseFloat(wCm) || DEFAULT_W,
        hCm: parseFloat(hCm) || DEFAULT_H,
        price: parseFloat(price) || 0,
      }])
    } else {
      onConfirm(files, rowMetas.map(m => ({
        name: m.name,
        wCm: parseFloat(m.wStr) || DEFAULT_W,
        hCm: parseFloat(m.hStr) || DEFAULT_H,
        price: m.price,
      })))
    }
  }

  const isMulti = files.length > 1

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal" style={{ maxWidth: isMulti ? 600 : undefined }}>
        <div className="modal-title">Add Artwork</div>
        <div className="modal-sub">
          {isMulti
            ? 'Set dimensions and price individually for each artwork.'
            : 'Upload the artwork image and enter its real-world dimensions and price.'}
        </div>

        <div className="field">
          <label className="field-label">Artwork Image</label>
          <div className={`upload-zone${files.length ? ' has-file' : ''}`} onClick={pickImages}>
            {files.length === 0 && 'Click to upload up to 5 artwork images'}
            {files.length === 1 && files[0].name}
            {files.length > 1 && `${files.length} artworks selected`}
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

        {/* Single file: original layout */}
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
              <label className="field-label">Price (£)</label>
              <input type="number" className="field-input" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 4500" min={0} step={50} />
            </div>
          </>
        )}

        {/* Multi-file: per-row table */}
        {isMulti && rowMetas.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
            {rowMetas.map((meta, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '52px 1fr 64px 64px 80px', gap: 8, alignItems: 'center', padding: '10px', background: 'var(--cream)', borderRadius: 6, border: '1px solid var(--border)' }}>
                {/* Thumbnail */}
                <div style={{ width: 52, height: 52, background: 'white', border: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {previews[i] && <img src={previews[i]} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
                </div>
                {/* Name */}
                <input
                  type="text"
                  className="field-input"
                  value={meta.name}
                  onChange={e => updateRow(i, { name: e.target.value })}
                  placeholder="Title"
                  style={{ fontSize: 12 }}
                />
                {/* W */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>W (cm)</div>
                  <input type="text" inputMode="decimal" className="field-input" value={meta.wStr} onChange={e => updateRow(i, { wStr: e.target.value })} style={{ fontSize: 12 }} />
                </div>
                {/* H */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>H (cm)</div>
                  <input type="text" inputMode="decimal" className="field-input" value={meta.hStr} onChange={e => updateRow(i, { hStr: e.target.value })} style={{ fontSize: 12 }} />
                </div>
                {/* Price */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>Price (£)</div>
                  <input type="number" className="field-input" value={meta.price || ''} onChange={e => updateRow(i, { price: parseFloat(e.target.value) || 0 })} min={0} step={50} placeholder="0" style={{ fontSize: 12 }} />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={!files.length}>
            Place on Elevation
          </button>
        </div>
      </div>
    </div>
  )
}
