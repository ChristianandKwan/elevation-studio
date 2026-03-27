'use client'

import { useRef, useState } from 'react'

export interface ArtMeta {
  name: string
  wCm: number
  hCm: number
  price: number
  priceIncludes: 'artwork' | 'all'
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
  // Single-file fields
  const [name, setName] = useState('')
  const [wCm, setWCm] = useState('')
  const [hCm, setHCm] = useState('')
  const [price, setPrice] = useState('')
  const [priceIncludes, setPriceIncludes] = useState<'artwork' | 'all'>('artwork')
  // Multi-file per-row metas
  const [rowMetas, setRowMetas] = useState<ArtMeta[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function pickImages() {
    inputRef.current?.click()
  }

  function onFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).slice(0, 5)
    if (!selected.length) return
    setFiles(selected)
    if (selected.length === 1 && !name) {
      setName(selected[0].name.replace(/\.[^.]+$/, ''))
    }
    // Build per-row defaults for multi-file
    setRowMetas(selected.map(f => ({
      name: f.name.replace(/\.[^.]+$/, ''),
      wCm: DEFAULT_W,
      hCm: DEFAULT_H,
      price: 0,
      priceIncludes: 'artwork',
    })))
    const readers = selected.map(f => new Promise<string>(resolve => {
      const r = new FileReader()
      r.onload = ev => resolve(ev.target?.result as string)
      r.readAsDataURL(f)
    }))
    Promise.all(readers).then(setPreviews)
    e.target.value = ''
  }

  function updateRow(i: number, patch: Partial<ArtMeta>) {
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
        priceIncludes,
      }])
    } else {
      onConfirm(files, rowMetas)
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
            <div className="field">
              <label className="field-label">Price includes</label>
              <select className="field-input" value={priceIncludes} onChange={e => setPriceIncludes(e.target.value as 'artwork' | 'all')}>
                <option value="artwork">Artwork only</option>
                <option value="all">Including framing &amp; installation</option>
              </select>
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
                  <input type="number" className="field-input" value={meta.wCm} onChange={e => updateRow(i, { wCm: parseFloat(e.target.value) || DEFAULT_W })} min={1} step={0.5} style={{ fontSize: 12 }} />
                </div>
                {/* H */}
                <div>
                  <div style={{ fontSize: 10, color: 'var(--mid)', marginBottom: 2 }}>H (cm)</div>
                  <input type="number" className="field-input" value={meta.hCm} onChange={e => updateRow(i, { hCm: parseFloat(e.target.value) || DEFAULT_H })} min={1} step={0.5} style={{ fontSize: 12 }} />
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
