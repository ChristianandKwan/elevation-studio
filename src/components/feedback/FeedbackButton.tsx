'use client'

import { useEffect, useState } from 'react'
import { installFeedbackLogger, snapshotFeedback } from '@/lib/feedback/logger'

type Kind = 'bug' | 'feature' | 'other'
type Status = 'idle' | 'sending' | 'sent' | 'error'

// Marks every feedback UI element so html2canvas can exclude them from
// the page capture (see `ignoreElements` below). Without this the
// screenshot would show the modal itself, which is useless.
const FEEDBACK_UI_ATTR = 'data-feedback-ui'

interface Props {
  // 'dark' is for the budget header, which sits on a charcoal background.
  variant?: 'light' | 'dark'
}

export default function FeedbackButton({ variant = 'light' }: Props = {}) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('bug')
  const [description, setDescription] = useState('')
  const [includeScreenshot, setIncludeScreenshot] = useState(true)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    installFeedbackLogger()
  }, [])

  function reset() {
    setKind('bug')
    setDescription('')
    setIncludeScreenshot(true)
    setStatus('idle')
    setErrorMsg('')
  }

  async function captureScreenshot(): Promise<string | null> {
    try {
      const mod = await import('html2canvas-pro')
      const html2canvas = mod.default
      const canvas = await html2canvas(document.body, {
        backgroundColor: '#F7F4EF',
        useCORS: true,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 1.5),
        ignoreElements: (el) => el.hasAttribute?.(FEEDBACK_UI_ATTR),
      })
      // JPEG at 0.75 keeps emails under the Resend 40MB hard limit comfortably.
      return canvas.toDataURL('image/jpeg', 0.75)
    } catch {
      return null
    }
  }

  async function handleSend() {
    setStatus('sending')
    setErrorMsg('')

    const screenshot = includeScreenshot ? await captureScreenshot() : null
    const logs = snapshotFeedback()

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          description,
          route: window.location.pathname + window.location.search,
          href: window.location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          logs,
          screenshot,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Send failed (${res.status})`)
      }
      setStatus('sent')
      setTimeout(() => {
        setOpen(false)
        reset()
      }, 1200)
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Send failed')
    }
  }

  const uiProps = { [FEEDBACK_UI_ATTR]: '' }

  const palette = variant === 'dark'
    ? {
        borderIdle: 'rgba(255,255,255,0.3)',
        colorIdle: 'rgba(255,255,255,0.6)',
        borderHover: 'rgba(255,255,255,0.6)',
        colorHover: 'rgba(255,255,255,0.95)',
        bgHover: 'rgba(255,255,255,0.08)',
      }
    : {
        borderIdle: 'var(--border)',
        colorIdle: 'var(--mid)',
        borderHover: 'var(--charcoal)',
        colorHover: 'var(--charcoal)',
        bgHover: 'var(--cream)',
      }

  return (
    <>
      <button
        {...uiProps}
        type="button"
        onClick={() => setOpen(true)}
        title="Send feedback"
        aria-label="Send feedback"
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${palette.borderIdle}`,
          background: 'transparent',
          color: palette.colorIdle,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all .15s',
          padding: 0,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = palette.bgHover
          e.currentTarget.style.color = palette.colorHover
          e.currentTarget.style.borderColor = palette.borderHover
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = palette.colorIdle
          e.currentTarget.style.borderColor = palette.borderIdle
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
      </button>

      {open && (
        <div
          {...uiProps}
          className="modal-bg open"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && status !== 'sending') {
              setOpen(false)
              reset()
            }
          }}
        >
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-title">Send feedback</div>
            <div className="modal-sub">
              Your message plus recent console logs, errors, and network failures will be emailed so the issue can be reproduced.
            </div>

            <div className="field">
              <label className="field-label">Type</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['bug', 'feature', 'other'] as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`btn btn-sm ${kind === k ? 'btn-primary' : ''}`}
                    style={{ flex: 1, textTransform: 'capitalize' }}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="feedback-desc">Description</label>
              <textarea
                id="feedback-desc"
                className="field-input"
                rows={5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={kind === 'bug' ? 'What went wrong? What were you trying to do?' : 'What would you like to see?'}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                disabled={status === 'sending'}
              />
            </div>

            <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                id="feedback-screenshot"
                type="checkbox"
                checked={includeScreenshot}
                onChange={(e) => setIncludeScreenshot(e.target.checked)}
                disabled={status === 'sending'}
              />
              <label htmlFor="feedback-screenshot" style={{ fontSize: 12, color: 'var(--mid)', cursor: 'pointer' }}>
                Include a screenshot of this page
              </label>
            </div>

            {status === 'error' && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
                {errorMsg}
              </div>
            )}

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setOpen(false); reset() }}
                disabled={status === 'sending'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSend}
                disabled={status === 'sending' || !description.trim()}
              >
                {status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent ✓' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
