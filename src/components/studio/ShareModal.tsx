'use client'

import { useState, useEffect } from 'react'
import { ArcSpinner } from '@/components/ui/Spinner'

interface Props {
  projectName: string
  projectId: string
  onGetToken: () => Promise<string>
  onClose: () => void
  onStatus: (msg: string) => void
}

export default function ShareModal({ projectName, onGetToken, onClose, onStatus }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    onGetToken().then(token => {
      const base = window.location.origin
      setUrl(`${base}/client/${token}`)
      setLoading(false)
    })
  }, []) // eslint-disable-line

  function copyLink() {
    navigator.clipboard?.writeText(url)
    onStatus('Link copied to clipboard')
  }

  function previewAsClient() {
    window.open(url, '_blank')
    onClose()
  }

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-title">Client Preview Link</div>
        <div className="modal-sub">
          Share this link with your client. No login required — they see all elevations and all options, with full approval controls.
        </div>

        <div style={{ position: 'relative', padding: 12, background: 'var(--cream)', border: '1px solid var(--border)', fontSize: 12, fontFamily: "'Karla'", wordBreak: 'break-all', color: 'var(--mid)', marginBottom: 16, minHeight: loading ? 56 : undefined }}>
          {loading ? <ArcSpinner size={36} /> : url}
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--mid)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--charcoal)' }}>What clients can do:</strong><br />
          ✓ View all elevations &amp; options<br />
          ✓ See artwork details and pricing<br />
          ✓ Approve (locks artwork positions)
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={copyLink} disabled={loading}>Copy Link</button>
          <button className="btn btn-green" onClick={previewAsClient} disabled={loading}>Preview as Client ↗</button>
        </div>
      </div>
    </div>
  )
}
