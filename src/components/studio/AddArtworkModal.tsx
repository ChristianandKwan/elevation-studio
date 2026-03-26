'use client'

import { useRef, useState } from 'react'

interface ArtMeta {
  name: string
  wCm: number
  hCm: number
  price: number
  priceIncludes: 'artwork' | 'all'
}

interface Props {
  onConfirm: (files: File[], meta: ArtMeta) => void
  onCancel: () => void
}

export default function AddArtworkModal({ onConfirm, onCancel }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [name, setName] = useState('')
  const [wCm, setWCm] = useState('')
  const [hCm, setHCm] = useState('')
  const [price, setPrice] = useState('')
  const [priceIncludes, setPriceIncludes] = useState<'artwork' | 'all'>('artwork')
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
    const readers = selected.map(f => {
      return new Promise<string>(resolve => {
        const r = new FileReader()
        r.onload = ev => resolve(ev.target?.result as string)
        r.readAsDataURL(f)
      })
    })
    Promise.all(readers).then(setPreviews)
    e.target.value = ''
  }

  function handleConfirm() {
    if (!files.length) return
    onConfirm(files, {
      name: name.trim() || 'Untitled',
      wCm: parseFloat(wCm) || 40,
      hCm: parseFloat(hCm) || 60,
      price: parseFloat(price) || 0,
      priceIncludes,
    })
  }

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="modal">
        <div className="modal-title">Add Artwork</div>
        <div className="modal-sub">Upload the artwork image and enter its real-world dimensions and price.</div>

        <div className="field">
          <label className="field-label">Artwork Image</label>
          <div
            className={`upload-zone${files.length ? ' has-file' : ''}`}
            onClick={pickImages}
          >
            {files.length === 0 && 'Click to upload up to 5 artwork images'}
            {files.length === 1 && files[0].name}
            {files.length > 1 && `${files.length} artworks selected — shared dims & price below`}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={onFilesChange}
          />
          {previews.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {previews.map((src, i) => (
                <div key={i} style={{ width: 52, height: 52, background: 'var(--cream)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {files.length <= 1 && (
          <div className="field">
            <label className="field-label">Name / Title</label>
            <input type="text" className="field-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Abstract No. 3" />
          </div>
        )}

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
