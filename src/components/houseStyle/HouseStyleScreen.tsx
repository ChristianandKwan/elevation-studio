'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { InlineSpinner } from '@/components/ui/InlineSpinner'

interface Rule {
  id: string
  rule: string
  why: string
  status: 'suggested' | 'approved' | 'rejected' | 'applied' | 'retired'
  decided_by: string | null
  decided_at: string | null
  created_at: string
  from: string
}

interface Sent {
  id: string
  proposalId: string
  projectId: string | null
  projectName: string
  subtitle: string
  mine: boolean
  version: number
  sentBy: string
  sentAt: string
  hasOwnPdf: boolean
  review: 'done' | 'working' | 'waiting' | 'not-started'
  lesson: string | null
}

const day = (iso: string | null) => iso
  ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : ''

/**
 * The house style, as Christian & Kwan see and decide it.
 *
 * Claude follows the C&K design system, and on top of it the rules here.
 * Rules come from two places: a consultant telling Claude in the chat that
 * something applies always, and Claude looking back over a proposal that was
 * sent to the client (040). Nothing reaches a proposal until one of them
 * approves it; they can reword a rule, or stop using it, at any time. None
 * of this needs anyone to go near Tom's Claude account or the design system.
 */
export default function HouseStyleScreen() {
  const [data, setData] = useState<{ rules: Rule[]; sent: Sent[] } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const [showSetAside, setShowSetAside] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/house-style', { cache: 'no-store' })
      if (!res.ok) throw new Error()
      setData(await res.json())
      setLoadError(null)
    } catch {
      setLoadError('The house style could not be loaded. Try again in a moment.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  // While Claude is looking back over a sent proposal, keep an eye out for it.
  const reviewing = data?.sent.some(s => s.review === 'working')
  useEffect(() => {
    if (!reviewing) return
    const id = setInterval(() => { if (document.visibilityState === 'visible') load() }, 20000)
    return () => clearInterval(id)
  }, [reviewing, load])

  async function change(key: string, url: string, init: RequestInit) {
    setBusy(key)
    setNotice(null)
    try {
      const res = await fetch(url, init)
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'That could not be saved. Try again in a moment.')
      if (body?.notice) setNotice(body.notice)
      await load()
      return true
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That could not be saved. Try again in a moment.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const decide = (rule: Rule, decision: 'approve' | 'reject' | 'retire' | 'restore') =>
    change(`${rule.id}:${decision}`, `/api/proposals/rules/${rule.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
    })

  async function saveWording() {
    if (!editing) return
    const ok = await change(`${editing.id}:edit`, `/api/proposals/rules/${editing.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rule: editing.text }),
    })
    if (ok) setEditing(null)
  }

  const askAgain = (s: Sent) => change(`${s.id}:ask`, `/api/proposals/sends/${s.id}/review`, { method: 'POST' })

  const waiting = data?.rules.filter(r => r.status === 'suggested') ?? []
  const inForce = data?.rules.filter(r => r.status === 'approved' || r.status === 'applied') ?? []
  const setAside = data?.rules.filter(r => r.status === 'rejected' || r.status === 'retired') ?? []

  function ruleText(r: Rule) {
    if (editing?.id !== r.id) return <p className="hs-rule-text">{r.rule}</p>
    return (
      <div className="hs-reword">
        <textarea className="field-input" rows={3} value={editing.text} autoFocus
          onChange={e => setEditing({ id: r.id, text: e.target.value })} />
        <div className="hs-actions">
          <button className="btn btn-sm" onClick={() => setEditing(null)} disabled={!!busy}>Cancel</button>
          <button className="btn btn-sm btn-primary" onClick={saveWording} disabled={!!busy || !editing.text.trim()}>
            {busy === `${r.id}:edit` ? 'Saving…' : 'Save wording'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="hs-screen">
      <header className="hs-header">
        <Link href="/dashboard" className="btn btn-sm btn-ghost">← Your work</Link>
      </header>

      <main className="hs-content">
        <div className="hs-kicker">Proposals</div>
        <h1 className="hs-title">House style</h1>
        <p className="hs-intro">
          Claude lays out every proposal in the Christian &amp; Kwan design system, and follows the rules below
          on top of it. It learns them from what you ask for in the chat, and from the proposals you send to
          clients. Nothing here reaches a proposal until one of you approves it — and you can reword a rule, or
          stop using it, whenever you like.
        </p>

        {notice && <p className="proposals-notice" role="status">{notice}</p>}

        {loadError ? <p className="hs-empty">{loadError}</p> : !data ? (
          <div className="proposals-loading"><InlineSpinner size={28} /></div>
        ) : (
          <>
            <section className="hs-section">
              <h2 className="hs-h2">Waiting for you{waiting.length > 0 && <span className="hs-count">{waiting.length}</span>}</h2>
              {waiting.length === 0 ? (
                <p className="hs-empty">Nothing waiting. When Claude notices something that might apply to every proposal, it asks here.</p>
              ) : waiting.map(r => (
                <article key={r.id} className="hs-rule hs-rule--waiting">
                  <div className="hs-from">{r.from} · {day(r.created_at)}</div>
                  {ruleText(r)}
                  {r.why && <p className="hs-why">{r.why}</p>}
                  {editing?.id !== r.id && (
                    <div className="hs-actions">
                      <button className="hs-link" onClick={() => setEditing({ id: r.id, text: r.rule })} disabled={!!busy}>Reword</button>
                      <button className="btn btn-sm" onClick={() => decide(r, 'reject')} disabled={!!busy}>
                        {busy === `${r.id}:reject` ? 'Saving…' : 'Not a rule'}
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => decide(r, 'approve')} disabled={!!busy}>
                        {busy === `${r.id}:approve` ? 'Saving…' : 'Make it a rule'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>

            <section className="hs-section">
              <h2 className="hs-h2">In every proposal</h2>
              {inForce.length === 0 ? (
                <p className="hs-empty">No rules of your own yet — for now Claude follows the Christian &amp; Kwan design system alone.</p>
              ) : inForce.map(r => (
                <article key={r.id} className="hs-rule">
                  {ruleText(r)}
                  <div className="hs-from">
                    {r.decided_by ? `Approved by ${r.decided_by}` : 'Approved'}{r.decided_at ? `, ${day(r.decided_at)}` : ''} · {r.from}
                  </div>
                  {editing?.id !== r.id && (
                    <div className="hs-actions">
                      <button className="hs-link" onClick={() => setEditing({ id: r.id, text: r.rule })} disabled={!!busy}>Reword</button>
                      <button className="hs-link" onClick={() => decide(r, 'retire')} disabled={!!busy}>
                        {busy === `${r.id}:retire` ? 'Saving…' : 'Stop using'}
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </section>

            <section className="hs-section">
              <h2 className="hs-h2">Sent to clients</h2>
              <p className="hs-note">
                Claude looks back over each proposal you mark as sent — what you asked for, and anything you changed
                in the PDF yourself — and suggests rules above. The latest ones are also the examples it studies before
                it starts a new proposal.
              </p>
              {data.sent.length === 0 ? (
                <p className="hs-empty">None yet. On a proposal, press <em>Mark as sent</em> once it has gone to the client.</p>
              ) : data.sent.map(s => (
                <article key={s.id} className="hs-sent">
                  <div className="hs-sent-head">
                    {s.mine && s.projectId ? (
                      <Link href={`/projects/${s.projectId}/proposals/${s.proposalId}?version=${s.version}`} className="hs-sent-name">
                        {s.projectName || 'A project'}
                      </Link>
                    ) : <span className="hs-sent-name">{s.projectName || 'A project'}</span>}
                    {s.subtitle && <span className="hs-sent-sub">{s.subtitle}</span>}
                  </div>
                  <div className="hs-from">
                    Sent {day(s.sentAt)} · version {s.version}{s.sentBy ? ` · ${s.sentBy}` : ''}
                    {s.hasOwnPdf ? ' · with the PDF as sent' : ''}
                  </div>
                  {s.review === 'done' && s.lesson ? (
                    <p className="hs-lesson">{s.lesson}</p>
                  ) : s.review === 'working' ? (
                    <p className="hs-lesson hs-lesson--pending"><InlineSpinner size={12} immediate /> Claude is looking back over it…</p>
                  ) : (
                    <p className="hs-lesson hs-lesson--pending">
                      Claude hasn’t looked back over this one yet.{' '}
                      <button className="hs-link" onClick={() => askAgain(s)} disabled={!!busy}>
                        {busy === `${s.id}:ask` ? 'Asking…' : 'Ask Claude now'}
                      </button>
                    </p>
                  )}
                </article>
              ))}
            </section>

            {setAside.length > 0 && (
              <section className="hs-section">
                <button className="proposals-fold" aria-expanded={showSetAside} onClick={() => setShowSetAside(x => !x)}>
                  <span className="proposals-fold-mark" aria-hidden="true">{showSetAside ? '−' : '+'}</span>
                  Turned down, or no longer used ({setAside.length})
                </button>
                {showSetAside && setAside.map(r => (
                  <article key={r.id} className="hs-rule hs-rule--aside">
                    <p className="hs-rule-text">{r.rule}</p>
                    <div className="hs-from">
                      {r.status === 'retired' ? 'Stopped' : 'Turned down'}{r.decided_by ? ` by ${r.decided_by}` : ''}
                      {r.decided_at ? `, ${day(r.decided_at)}` : ''} · {r.from}
                    </div>
                    <div className="hs-actions">
                      <button className="hs-link" onClick={() => decide(r, 'restore')} disabled={!!busy}>
                        {busy === `${r.id}:restore` ? 'Saving…' : 'Use it after all'}
                      </button>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
