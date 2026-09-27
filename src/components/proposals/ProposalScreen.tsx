'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { InlineSpinner } from '@/components/ui/InlineSpinner'

interface Message {
  id: string
  author: 'consultant' | 'engine'
  body: string
  page: number | null
  answered_at: string | null
  answered_in: number | null
  created_at: string
}

interface Rule {
  id: string
  rule: string
  why: string
  status: 'suggested' | 'approved' | 'rejected' | 'applied'
  decided_by: string | null
}

interface View {
  status: 'queued' | 'working' | 'ready' | 'resting' | 'failed'
  error: string | null
  engineAlive: boolean
  /** Starts of the engine in the last day, of what Tom's plan allows. */
  starts: { used: number; limit: number; left: number }
  currentVersion: number | null
  versions: Array<{ number: number; summary: string; pageCount: number | null; createdAt: string }>
  shown: { number: number; summary: string; warnings: string[]; pages: string[]; pdfUrl: string | null } | null
  messages: Message[]
  rules: Rule[]
}

interface Props {
  projectId: string
  projectName: string
  proposalId: string
  /** From the Proposals view's "View" on an older version. */
  initialVersion?: number | null
}

/**
 * The proposal, and a conversation with Claude about it.
 *
 * Pages on the left, as pictures of exactly what the PDF holds. Clicking one
 * selects it, and a message sent while it is selected carries the page
 * number — which is what "this" and "here" mean to Claude. The chat is on
 * the right; Claude's replies and each new version arrive in it.
 *
 * Nothing here is instant: a first draft takes a few minutes and a change a
 * minute or two. So the screen says plainly what Claude is doing, polls
 * while it is working, and never implies an answer is on its way when the
 * engine has stopped (the next message starts it again).
 */
export default function ProposalScreen({ projectId, projectName, proposalId, initialVersion = null }: Props) {
  const [view, setView] = useState<View | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** The version on screen; null follows the newest. */
  const [versionShown, setVersionShown] = useState<number | null>(initialVersion)
  const [startingAgain, setStartingAgain] = useState(false)
  const [selectedPage, setSelectedPage] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const chatEnd = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const q = versionShown ? `?version=${versionShown}` : ''
    try {
      const res = await fetch(`/api/proposals/${proposalId}${q}`, { cache: 'no-store' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'The proposal could not be loaded.')
      const next = await res.json() as View
      setView(prev => keepSignedPages(prev, next))
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'The proposal could not be loaded.')
    }
  }, [proposalId, versionShown])

  // Poll quickly while Claude has it, slowly otherwise — only while visible.
  const working = !!view && (view.status === 'queued' || view.status === 'working' ||
    view.messages.some(m => m.author === 'consultant' && !m.answered_at))
  useEffect(() => {
    load()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, working ? 4000 : 15000)
    return () => clearInterval(id)
  }, [load, working])

  const messageCount = view?.messages.length ?? 0
  useEffect(() => { chatEnd.current?.scrollIntoView({ block: 'end' }) }, [messageCount])

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, page: selectedPage }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) throw new Error(result?.error ?? 'The message could not be sent.')
      if (result?.error) setNotice(result.error)
      setDraft('')
      setVersionShown(null)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The message could not be sent.')
    } finally {
      setSending(false)
    }
  }

  async function refreshFigures() {
    if (refreshing) return
    setRefreshing(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/refresh`, { method: 'POST' })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'The figures could not be refreshed.')
      setVersionShown(null)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The figures could not be refreshed.')
    } finally {
      setRefreshing(false)
    }
  }

  /** Copy the version on screen forward as the newest; the next change is made to it. */
  async function startAgain() {
    if (!view?.shown) return
    const from = view.shown.number
    setStartingAgain(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/start-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: from }),
      })
      const result = await res.json().catch(() => null)
      if (!res.ok) throw new Error(result?.error ?? 'That did not work. Try again in a moment.')
      // The chat shows "Start again from version N" and the menu the new latest.
      setVersionShown(null)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That did not work. Try again in a moment.')
    } finally {
      setStartingAgain(false)
    }
  }

  async function decide(rule: Rule, decision: 'approve' | 'reject') {
    const res = await fetch(`/api/proposals/rules/${rule.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (!res.ok) setNotice((await res.json().catch(() => null))?.error ?? 'That could not be saved.')
    await load()
  }

  if (!view) {
    return (
      <div className="proposal-loading">
        {loadError ? <p>{loadError}</p> : <InlineSpinner size={32} />}
      </div>
    )
  }

  const shown = view.shown
  const waitingOn = view.messages.filter(m => m.author === 'consultant' && !m.answered_at).length

  return (
    <div className="proposal-screen">
      <header className="proposal-header">
        <Link href={`/projects/${projectId}?view=proposals`} className="btn btn-sm btn-ghost">← {projectName}</Link>
        <div className="proposal-title">
          Proposal
          {view.versions.length > 0 && (
            <select
              className="proposal-version"
              value={shown?.number ?? ''}
              onChange={e => setVersionShown(Number(e.target.value) === view.currentVersion ? null : Number(e.target.value))}
              aria-label="Version"
            >
              {view.versions.map(v => (
                <option key={v.number} value={v.number}>
                  Version {v.number}{v.number === view.currentVersion ? ' (latest)' : ''}
                </option>
              ))}
            </select>
          )}
          {shown && shown.number !== view.currentVersion && (
            <button
              className="btn btn-sm"
              onClick={startAgain}
              disabled={startingAgain || waitingOn > 0}
              title={waitingOn > 0
                ? 'Claude is working on a change. You can start again once it is done.'
                : `Carry on from version ${shown.number}: it is copied forward as the newest`}
            >
              {startingAgain ? 'Copying…' : 'Start again from this version'}
            </button>
          )}
        </div>
        <div className="proposal-actions">
          <button className="btn btn-sm" onClick={refreshFigures} disabled={refreshing}
            title="Take the prices and works from the studio as they are now">
            {refreshing ? 'Refreshing…' : 'Refresh figures'}
          </button>
          {shown?.pdfUrl && (
            <a className="btn btn-sm btn-primary" href={shown.pdfUrl}>Download PDF</a>
          )}
        </div>
      </header>

      <div className="proposal-body">
        <section className="proposal-pages" aria-label="Pages">
          {!shown ? (
            <div className="proposal-empty">
              {view.status === 'failed' ? (
                <p>{view.error ?? 'Claude could not build this proposal.'}</p>
              ) : (
                <>
                  <InlineSpinner size={32} immediate />
                  <p>Claude is building the first draft. It usually takes a few minutes — you can leave this page and come back.</p>
                </>
              )}
            </div>
          ) : (
            <>
              {shown.warnings.length > 0 && (
                <ul className="proposal-warnings">
                  {shown.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              {shown.pages.map((src, i) => {
                const n = i + 1
                return (
                  <button
                    key={`${shown.number}-${n}`}
                    type="button"
                    className={`proposal-page${selectedPage === n ? ' selected' : ''}`}
                    onClick={() => setSelectedPage(selectedPage === n ? null : n)}
                    aria-pressed={selectedPage === n}
                    aria-label={`Page ${n}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL, sized by the page */}
                    <img src={src} alt={`Page ${n}`} loading={i < 2 ? 'eager' : 'lazy'} />
                    <span className="proposal-page-n">{n}</span>
                  </button>
                )
              })}
            </>
          )}
        </section>

        <aside className="proposal-chat" aria-label="Conversation with Claude">
          <div className="proposal-status" role="status">
            <EngineStatus view={view} waitingOn={waitingOn} />
          </div>

          <div className="proposal-messages">
            {view.messages.length === 0 && (
              <p className="proposal-hint">
                Once the first draft is up, tell Claude what to change — “make the room title bigger”, “move
                this page after the price list”. Click a page first and Claude will know which one you mean.
              </p>
            )}
            {view.messages.map(m => (
              <div key={m.id} className={`proposal-msg ${m.author}`}>
                <div className="proposal-msg-who">
                  {m.author === 'engine' ? 'Claude' : 'You'}
                  {m.page ? <span className="proposal-msg-page"> · page {m.page}</span> : null}
                </div>
                <div className="proposal-msg-body">{m.body}</div>
              </div>
            ))}
            {view.rules.filter(r => r.status === 'suggested').map(r => (
              <div key={r.id} className="proposal-rule">
                <div className="proposal-msg-who">A house-style rule, for every proposal</div>
                <p>{r.rule}</p>
                {r.why && <p className="proposal-rule-why">{r.why}</p>}
                <div className="proposal-rule-actions">
                  <button className="btn btn-sm" onClick={() => decide(r, 'reject')}>Just this proposal</button>
                  <button className="btn btn-sm btn-primary" onClick={() => decide(r, 'approve')}>Make it a rule</button>
                </div>
              </div>
            ))}
            <div ref={chatEnd} />
          </div>

          {notice && <div className="export-error">{notice}</div>}

          <div className="proposal-composer">
            {selectedPage && (
              <div className="proposal-chip">
                About page {selectedPage}
                <button type="button" aria-label="Not about a page" onClick={() => setSelectedPage(null)}>×</button>
              </div>
            )}
            <textarea
              className="field-input"
              rows={3}
              value={draft}
              placeholder={selectedPage ? `What should change on page ${selectedPage}?` : 'What should change?'}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            />
            <button className="btn btn-primary" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

/**
 * How long the page links are kept before fresh ones are taken. The studio
 * signs them for an hour; swapping a little before then means a screen left
 * open all afternoon never shows broken pages.
 */
const KEEP_SIGNED_MS = 45 * 60_000
const signedAt = new WeakMap<object, number>()

/**
 * The same version's pages, kept as they are.
 *
 * Every poll brings back freshly signed links to the page pictures: the same
 * pictures, but new addresses. Swapping them in made the browser drop every
 * page and load it again — a white flash every few seconds (Tom). So while
 * the version on screen is unchanged, the links it was first given stay.
 */
function keepSignedPages(prev: View | null, next: View): View {
  const before = prev?.shown
  const after = next.shown
  if (!before || !after || before.number !== after.number) {
    if (after) signedAt.set(after, Date.now())
    return next
  }
  const age = Date.now() - (signedAt.get(before) ?? 0)
  if (age > KEEP_SIGNED_MS) {
    signedAt.set(after, Date.now())
    return next
  }
  const kept = { ...after, pages: before.pages, pdfUrl: before.pdfUrl }
  signedAt.set(kept, signedAt.get(before) ?? Date.now())
  return { ...next, shown: kept }
}

/** What Claude is doing, in a sentence — never "on its way" when it has stopped. */
function EngineStatus({ view, waitingOn }: { view: View; waitingOn: number }) {
  if (view.status === 'failed') {
    return <span className="proposal-status-failed">{view.error ?? 'Claude stopped.'} Sending a message tries again.</span>
  }
  if (view.status === 'queued' || view.status === 'working') {
    return <span><InlineSpinner size={14} immediate /> {view.currentVersion ? 'Claude is working on your changes…' : 'Claude is building the first draft…'}</span>
  }
  if (waitingOn > 0) {
    return <span><InlineSpinner size={14} immediate /> Claude has your message{waitingOn > 1 ? 's' : ''} and is on it…</span>
  }
  if (view.status === 'resting' || !view.engineAlive) {
    const { left, limit } = view.starts
    return left > 0 ? (
      <span>
        Claude has stepped away. Your next message brings it back, which uses one of the {limit} starts
        a day on Tom’s Claude plan ({left} left today). Everything you send while it’s back is included.
      </span>
    ) : (
      <span>
        Claude has stepped away, and today’s {limit} starts on Tom’s Claude plan look to be used up. You can
        still write — your message is saved and Claude picks it up when it next starts.
      </span>
    )
  }
  return <span>Claude is ready for changes.</span>
}
