'use client'

import { useState, useEffect } from 'react'
import { InlineSpinner } from '@/components/ui/InlineSpinner'

interface Props {
  projectName: string
  projectId: string
  onGetToken: () => Promise<string>
  /** Replaces the link with a new one and disables the old one. */
  onRegenerateToken: () => Promise<string>
  onClose: () => void
  onStatus: (msg: string) => void
}

export default function ShareModal({ projectName, onGetToken, onRegenerateToken, onClose, onStatus }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirmingRegen, setConfirmingRegen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    onGetToken().then(token => {
      const base = window.location.origin
      setUrl(`${base}/client/${token}`)
      setLoading(false)
    })
  }, []) // eslint-disable-line

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Escape backs out of the confirmation first, rather than closing the
      // whole modal and losing the consultant's place.
      if (confirmingRegen) setConfirmingRegen(false)
      else onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, confirmingRegen])

  function copyLink() {
    navigator.clipboard?.writeText(url)
    onStatus('Link copied to clipboard')
  }

  function previewAsClient() {
    window.open(url, '_blank')
    onClose()
  }

  async function regenerate() {
    setRegenerating(true)
    try {
      const token = await onRegenerateToken()
      setUrl(`${window.location.origin}/client/${token}`)
      setConfirmingRegen(false)
      onStatus('New link created — the previous one no longer works')
    } catch {
      onStatus('Could not create a new link. Please try again.')
    } finally {
      setRegenerating(false)
    }
  }

  const busy = loading || regenerating

  return (
    <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget && !regenerating) onClose() }}>
      <div className="modal">
        <div className="modal-title">Client Preview Link</div>
        <div className="modal-sub">
          Share this link with your client. No login required — they see all elevations and all options, with full approval controls.
        </div>

        <div style={{ padding: 12, ...(busy && { display: 'flex', alignItems: 'center', justifyContent: 'center' }), background: 'var(--cream)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, fontFamily: "'Karla'", wordBreak: 'break-all', color: 'var(--mid)', marginBottom: 12, minHeight: busy ? 56 : undefined }}>
          {busy ? <InlineSpinner size={20} /> : url}
        </div>

        {confirmingRegen ? (
          <div style={{ padding: 12, background: 'var(--amber-light)', border: '1px solid rgba(139,111,71,.25)', borderRadius: 'var(--radius-sm)', marginBottom: 16 }}>
            <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--charcoal)', marginBottom: 10 }}>
              This creates a different link and <strong>stops the current one working straight away</strong>.
              If you have already sent the link above to your client, they will need the new one.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setConfirmingRegen(false)} disabled={regenerating}>
                Keep current link
              </button>
              <button className="btn btn-sm btn-primary" onClick={regenerate} disabled={regenerating}>
                {regenerating ? 'Creating…' : 'Create new link'}
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-sm btn-ghost"
            style={{ marginBottom: 16 }}
            onClick={() => setConfirmingRegen(true)}
            disabled={busy}
          >
            Generate a different link
          </button>
        )}

        <div style={{ fontSize: 11.5, color: 'var(--mid)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--charcoal)' }}>What clients can do:</strong><br />
          ✓ View every elevation and option, and the budget<br />
          ✓ Message you about each option<br />
          ✓ Pick and approve (approving locks the wall)
        </div>

        {/* The guide ships with the site (public/), so this is always the
            version in the current release. Edit it there. */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          marginTop: 14, padding: '10px 12px', background: 'var(--cream)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ fontSize: 12, lineHeight: 1.5 }}>
            <strong>Client portal guide</strong>
            <div style={{ fontSize: 11.5, color: 'var(--mid)' }}>A short Word guide to send with the link.</div>
          </div>
          <a
            className="btn btn-sm"
            href="/client-portal-guide.docx"
            download="Christian & Kwan — Your Artwork Proposal guide.docx"
          >
            Download
          </a>
        </div>

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={regenerating}>Close</button>
          <button className="btn btn-primary" onClick={copyLink} disabled={busy}>Copy Link</button>
          <button className="btn btn-green" onClick={previewAsClient} disabled={busy}>Preview as Client ↗</button>
        </div>
      </div>
    </div>
  )
}
