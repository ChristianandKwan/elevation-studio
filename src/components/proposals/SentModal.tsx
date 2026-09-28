'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { InlineSpinner } from '@/components/ui/InlineSpinner'

/** Matches SENT_PDF_MAX_BYTES on the server. */
const MAX_BYTES = 80 * 1024 * 1024

/**
 * Put the PDF a consultant actually sent into storage, on a link the studio
 * signs: it goes straight from the browser, because a PDF of pictures is far
 * larger than a request to the studio may be. Returns the path to record.
 */
export async function uploadSentPdf(proposalId: string, file: File): Promise<string> {
  if (file.type && file.type !== 'application/pdf') throw new Error('That is not a PDF.')
  if (file.size > MAX_BYTES) throw new Error('That PDF is over 80 MB. Save a smaller copy and try again.')
  const res = await fetch(`/api/proposals/${proposalId}/sent/upload`, { method: 'POST' })
  const link = await res.json().catch(() => null) as { path?: string; token?: string; error?: string } | null
  if (!res.ok || !link?.path || !link.token) throw new Error(link?.error ?? 'The upload could not be started.')
  const { error } = await createClient().storage.from('proposals')
    .uploadToSignedUrl(link.path, link.token, file, { contentType: 'application/pdf' })
  if (error) throw new Error('The PDF did not upload. Try again.')
  return link.path
}

/**
 * Why the PDF they sent matters, said where they choose it. Tom asked for a
 * note: consultants may well touch a proposal up in Acrobat after
 * downloading, and those edits are the truest record of how they like it.
 */
export function WhyThePdfMatters() {
  return (
    <p className="sent-why">
      <strong>Why it helps.</strong> The proposal you send is the best record of how you like things
      done. Claude compares it with its own last version, and suggests house-style rules from the
      differences — the wording you changed, what you moved. Nothing becomes a rule until one of you
      approves it on the House style page. The PDF stays in Elevation Studio and is never shown to
      the client.
    </p>
  )
}

interface Props {
  proposalId: string
  /** Finished versions, newest last. */
  versions: number[]
  /** The version on screen, offered first. */
  initialVersion: number
  onClose: () => void
  onSent: (notice: string | null) => void
}

/**
 * Mark as sent to the client: which version went, and — if they changed it
 * after downloading — the PDF they actually sent. Saving asks Claude to look
 * back over the whole proposal for the house style (040).
 */
export default function SentModal({ proposalId, versions, initialVersion, onClose, onSent }: Props) {
  const [version, setVersion] = useState(initialVersion)
  const [changed, setChanged] = useState<'no' | 'yes'>('no')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, busy])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const pdfPath = changed === 'yes' && file ? await uploadSentPdf(proposalId, file) : null
      const res = await fetch(`/api/proposals/${proposalId}/sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, pdfPath }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'It could not be marked as sent. Try again.')
      onSent(body?.notice ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be marked as sent. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg open">
      <div className="modal sent-modal" role="dialog" aria-labelledby="sent-title">
        <div className="modal-title" id="sent-title">Mark as sent to the client</div>
        <div className="modal-sub">
          The studio keeps a record of what went out, and Claude learns from it for the next proposal.
        </div>

        {versions.length > 1 && (
          <div className="field">
            <label className="field-label" htmlFor="sent-version">Which version went</label>
            <select id="sent-version" className="field-input" value={version} onChange={e => setVersion(Number(e.target.value))}>
              {[...versions].reverse().map(n => <option key={n} value={n}>Version {n}</option>)}
            </select>
          </div>
        )}

        <fieldset className="field sent-changed">
          <legend className="field-label">Did you change it after downloading?</legend>
          <label className="sent-choice">
            <input type="radio" name="changed" checked={changed === 'no'} onChange={() => setChanged('no')} />
            No, it went as Claude made it
          </label>
          <label className="sent-choice">
            <input type="radio" name="changed" checked={changed === 'yes'} onChange={() => setChanged('yes')} />
            Yes — in Acrobat, or anywhere else
          </label>
        </fieldset>

        {changed === 'yes' && (
          <div className="field">
            <label className="field-label" htmlFor="sent-file">The PDF you sent</label>
            <input
              id="sent-file" type="file" accept="application/pdf,.pdf" className="field-input"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            <WhyThePdfMatters />
          </div>
        )}

        {error && <div className="export-error">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || (changed === 'yes' && !file)}>
            {busy ? <><InlineSpinner size={13} immediate /> {file && changed === 'yes' ? 'Uploading…' : 'Saving…'}</> : 'Mark as sent'}
          </button>
        </div>
      </div>
    </div>
  )
}
