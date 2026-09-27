'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { IndexElevation } from '@/lib/works'
import { defaultPages, defaultSubtitle, type ClientType, type ProposalPages } from '@/lib/proposals/brief'
import { ArcSpinner } from '@/components/ui/Spinner'
import OptionPicker from './OptionPicker'

interface Props {
  projectId: string
  projectName: string
  elevations: IndexElevation[]
  works: Array<{ id: string; name: string; artist: string }>
  setAsideCount: number
  onClose: () => void
}

interface EarlierProposal {
  id: string
  status: string
  currentVersion: number | null
  createdAt: string
  subtitle: string
}

const PAGE_CHOICES: Array<{ key: keyof ProposalPages; label: string; note: string }> = [
  { key: 'intro', label: 'Introduction', note: 'Contents, Our approach, Our process' },
  { key: 'aboutUs', label: 'About us', note: 'Chloe and Petra, with their full bios' },
  { key: 'notesAndBudget', label: 'Notes and budget', note: 'the budget, typeset from the figures here' },
  { key: 'wallSpecs', label: 'Wall specs', note: 'the empty wall and its measurements' },
  { key: 'priceLists', label: 'Price lists', note: 'one page per artist' },
]

/**
 * Create proposal: the few decisions to make before Claude lays it out.
 *
 * Tom's note on the Nepean trial: offer the optional pages as a list rather
 * than leaving the engine to decide. The list starts from the one question
 * that settles most of it — is this client new? — and every box can change.
 * The options are the export's own picker: a proposal is built from exactly
 * the pack the Export button would make.
 */
export default function CreateProposalModal({
  projectId, projectName, elevations, works, setAsideCount, onClose,
}: Props) {
  const router = useRouter()

  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(elevations.flatMap(e => e.options.map(o => o.id))),
  )
  const toggleOption = (id: string) => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const setElevation = (elev: IndexElevation, on: boolean) => setPicked(prev => {
    const next = new Set(prev)
    for (const o of elev.options) {
      if (on) next.add(o.id)
      else next.delete(o.id)
    }
    return next
  })

  const [clientType, setClientType] = useState<ClientType>('existing')
  const [pages, setPages] = useState<ProposalPages>(() => defaultPages('existing'))
  const [coverWorkId, setCoverWorkId] = useState('')
  const [subtitle, setSubtitle] = useState(() => defaultSubtitle())
  const [instructions, setInstructions] = useState('')
  const [includeSetAside, setIncludeSetAside] = useState(false)

  const [earlier, setEarlier] = useState<EarlierProposal[]>([])
  const [starts, setStarts] = useState<{ used: number; limit: number; left: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/proposals?projectId=${projectId}`)
      .then(r => (r.ok ? r.json() : { proposals: [] }))
      .then(b => { setEarlier(b.proposals ?? []); setStarts(b.starts ?? null) })
      .catch(() => {})
  }, [projectId])

  useEffect(() => {
    if (!busy) { setElapsed(0); return }
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(id)
  }, [busy])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose, busy])

  /** A new client's first pitch gets the intro pages; a returning one does not. */
  function chooseClientType(type: ClientType) {
    setClientType(type)
    setPages(prev => ({ ...prev, intro: defaultPages(type).intro, aboutUs: defaultPages(type).aboutUs }))
  }

  const optionIds = useMemo(() => [...picked], [picked])

  // The cover can be any work on the walls going in.
  const coverChoices = useMemo(() => {
    const onWalls = new Set(elevations.flatMap(e => e.options.filter(o => picked.has(o.id)).flatMap(o => o.workIds)))
    return works.filter(w => onWalls.has(w.id))
  }, [elevations, picked, works])

  async function create() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          brief: {
            optionIds, includeSetAside, clientType, pages,
            coverWorkId: coverWorkId || null, subtitle, instructions,
          },
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.id) throw new Error(body?.error ?? 'The proposal could not be started.')
      router.push(`/projects/${projectId}/proposals/${body.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The proposal could not be started.')
      setBusy(false)
    }
  }

  return (
    <div className="modal-bg open">
      <div className="modal export-modal">
        <div className="modal-title">Create a proposal for {projectName}</div>
        <div className="modal-sub">
          Claude lays it out in the Christian &amp; Kwan style. You can then ask for changes and download the PDF.
        </div>
        {starts && (
          // Said plainly, because it is Tom's own plan (Tom): a proposal and
          // a sitting of changes is usually one start; coming back after a
          // break is another.
          <p className={`export-hint${starts.left === 0 ? ' proposal-starts-out' : ''}`}>
            {starts.left > 0
              ? `Claude runs on Tom’s Claude plan, which allows ${starts.limit} starts a day. A proposal and a sitting of changes usually takes one; coming back to it after a break takes another. ${starts.left} left today.`
              : `Today’s ${starts.limit} starts on Tom’s Claude plan look to be used up, so Claude may not be able to begin until tomorrow. You can still create it: if Claude can’t start, the proposal will say so, and writing to it later starts it.`}
          </p>
        )}

        {earlier.length > 0 && (
          <div className="field">
            <label className="field-label">Proposals already made</label>
            <div className="proposal-earlier">
              {earlier.map(p => (
                <a key={p.id} className="proposal-earlier-row" href={`/projects/${projectId}/proposals/${p.id}`}>
                  <span>{p.subtitle || 'Proposal'}</span>
                  <span className="export-check-note">
                    {p.currentVersion ? `version ${p.currentVersion}` : p.status === 'failed' ? 'did not finish' : 'in progress'}
                    {' · '}{new Date(p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label className="field-label">Which elevations, and which options of each</label>
          <OptionPicker elevations={elevations} picked={picked} onToggleOption={toggleOption} onSetElevation={setElevation} />
        </div>

        <div className="field">
          <label className="field-label">The client</label>
          <div className="export-options">
            <button type="button" className={`export-opt${clientType === 'existing' ? ' active' : ''}`}
              aria-pressed={clientType === 'existing'} onClick={() => chooseClientType('existing')}>
              Existing client
            </button>
            <button type="button" className={`export-opt${clientType === 'new' ? ' active' : ''}`}
              aria-pressed={clientType === 'new'} onClick={() => chooseClientType('new')}>
              New client — first pitch
            </button>
          </div>
        </div>

        <div className="field">
          <label className="field-label">Which pages?</label>
          {PAGE_CHOICES.map(c => (
            <label key={c.key} className="export-check">
              <input type="checkbox" checked={pages[c.key]}
                onChange={e => setPages(prev => ({ ...prev, [c.key]: e.target.checked }))} />
              <span>{c.label}<span className="export-check-note"> — {c.note}</span></span>
            </label>
          ))}
          <label className="export-check">
            <input type="checkbox" checked={includeSetAside} onChange={e => setIncludeSetAside(e.target.checked)} />
            <span>
              Works set aside
              <span className="export-check-note">
                {setAsideCount === 0 ? ' — nothing is set aside in this project' : ` — ${setAsideCount} of them, for context`}
              </span>
            </span>
          </label>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="proposal-cover">Cover</label>
          <select id="proposal-cover" className="field-input" value={coverWorkId} onChange={e => setCoverWorkId(e.target.value)}>
            <option value="">Let Claude choose</option>
            {coverChoices.map(w => (
              <option key={w.id} value={w.id}>{w.artist ? `${w.artist} — ` : ''}{w.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="proposal-subtitle">Under the title</label>
          <input id="proposal-subtitle" className="field-input" value={subtitle}
            onChange={e => setSubtitle(e.target.value)} placeholder="e.g. Version 2 | 17.9.26" />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="proposal-instructions">Anything Claude should know (optional)</label>
          <textarea id="proposal-instructions" className="field-input" rows={3} value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="e.g. Keep it to the Conference Room; the client loves the blue Opies." />
        </div>

        {error && <div className="export-error">{error}</div>}

        <div className="modal-footer">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={create} disabled={busy || optionIds.length === 0}>
            {busy ? 'Starting…' : 'Create proposal'}
          </button>
        </div>
        {busy && (
          <div className="export-progress" role="status" aria-live="polite">
            <ArcSpinner size={28} />
            <div>
              <p className="export-progress-stage">
                Gathering {optionIds.length} wall{optionIds.length === 1 ? '' : 's'} and the works for Claude…
              </p>
              <p className="export-progress-elapsed">{elapsed}s · a large project can take a minute</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
