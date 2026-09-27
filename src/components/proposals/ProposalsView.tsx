'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { InlineSpinner } from '@/components/ui/InlineSpinner'

interface VersionItem {
  number: number
  summary: string
  pageCount: number | null
  createdAt: string
}

interface ProposalItem {
  id: string
  subtitle: string
  status: string
  error: string | null
  createdAt: string
  currentVersion: number | null
  coverUrl: string | null
  /** Why Start again is closed right now; null when it is open. */
  startAgainBlocked: string | null
  versions: VersionItem[]
}

interface Props {
  projectId: string
  /** Absent where the engine is not set up (previews): no New proposal. */
  onNewProposal?: () => void
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
})

/**
 * The project's proposals, and every version of each.
 *
 * Any version opens or downloads. An older one can be started again from:
 * it is copied forward as the newest, and the next change is made to it.
 * Nothing is overwritten, so starting again is never a loss — the versions
 * after it stay here, and starting again from one of them is the way back.
 */
export default function ProposalsView({ projectId, onNewProposal }: Props) {
  const [proposals, setProposals] = useState<ProposalItem[] | null>(null)
  const [starts, setStarts] = useState<{ left: number; limit: number } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** The version whose Start again is asking "are you sure". */
  const [confirming, setConfirming] = useState<{ id: string; number: number } | null>(null)
  const [startingAgain, setStartingAgain] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proposals?projectId=${projectId}`, { cache: 'no-store' })
      if (!res.ok) throw new Error()
      const body = await res.json()
      setProposals(body.proposals ?? [])
      setStarts(body.starts ?? null)
      setLoadError(null)
    } catch {
      setLoadError('The proposals could not be loaded. Try again in a moment.')
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // A first draft or a change arrives while this is open: keep it current.
  const working = proposals?.some(p => p.startAgainBlocked && p.status !== 'failed' && p.status !== 'resting')
  useEffect(() => {
    if (!working) return
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [working, load])

  async function startAgain(proposalId: string, number: number) {
    setStartingAgain(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/proposals/${proposalId}/start-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: number }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'That did not work. Try again in a moment.')
      setNotice(`Version ${body.version} is a copy of version ${number}. The next change you ask for is made to it.`)
      setConfirming(null)
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'That did not work. Try again in a moment.')
    } finally {
      setStartingAgain(false)
    }
  }

  return (
    <div className="index-view">
      <div className="index-content proposals-content">
        <div className="index-head">
          <div>
            <h1 className="index-title">Proposals</h1>
            <p className="index-sub">
              Laid out by Claude in the C&amp;K style
              {starts && <> · {starts.left} of {starts.limit} starts left today</>}
            </p>
          </div>
          {onNewProposal && <button className="btn btn-primary" onClick={onNewProposal}>New proposal</button>}
        </div>

        {notice && <p className="proposals-notice" role="status">{notice}</p>}

        {loadError ? (
          <p className="proposals-empty">{loadError}</p>
        ) : !proposals ? (
          <div className="proposals-loading"><InlineSpinner size={28} /></div>
        ) : proposals.length === 0 ? (
          <p className="proposals-empty">
            {onNewProposal
              ? <>No proposals yet. <strong>New proposal</strong> chooses the walls and options to include,
                  and Claude lays them out in a few minutes. You then refine it by writing to it.</>
              : 'No proposals yet. Proposals are made on the live studio.'}
          </p>
        ) : proposals.map(p => {
          const href = `/projects/${projectId}/proposals/${p.id}`
          return (
            <section key={p.id} className="proposals-card">
              <Link href={href} className="proposals-cover" aria-label={`Open ${p.subtitle || 'the proposal'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.coverUrl ? <img src={p.coverUrl} alt="" /> : <span>C&amp;K</span>}
              </Link>
              <div className="proposals-body">
                <div className="proposals-top">
                  <Link href={href} className="proposals-name">{p.subtitle || 'Proposal'}</Link>
                  <span className="proposals-meta">
                    Started {when(p.createdAt)}
                    {p.versions.length > 0 && <> · {p.versions.length} version{p.versions.length === 1 ? '' : 's'}</>}
                  </span>
                </div>

                {p.versions.length === 0 && (
                  <p className="proposals-state">
                    {p.status === 'failed'
                      ? (p.error ?? 'Claude could not build this proposal.')
                      : <><InlineSpinner size={13} immediate /> Claude is building the first draft…</>}
                  </p>
                )}

                {p.versions.map(v => {
                  const latest = v.number === p.currentVersion
                  const asking = confirming?.id === p.id && confirming.number === v.number
                  return (
                    <div key={v.number} className={`proposals-version${latest ? ' latest' : ''}`}>
                      <div className="proposals-vnum">
                        Version {v.number}
                        <small>{when(v.createdAt)}</small>
                      </div>
                      <div className="proposals-vsum" title={v.summary}>
                        {latest && <span className="proposals-latest">Latest</span>}
                        {v.summary || (v.pageCount ? `${v.pageCount} pages` : '')}
                      </div>
                      <div className="proposals-vact">
                        {asking ? (
                          <>
                            <span className="proposals-ask">Copy it forward as the newest?</span>
                            <button className="btn btn-sm" onClick={() => setConfirming(null)} disabled={startingAgain}>Cancel</button>
                            <button className="btn btn-sm btn-primary" onClick={() => startAgain(p.id, v.number)} disabled={startingAgain}>
                              {startingAgain ? 'Copying…' : 'Start again'}
                            </button>
                          </>
                        ) : (
                          <>
                            {latest ? (
                              <Link className="btn btn-sm" href={href}>Open</Link>
                            ) : (
                              <>
                                <button
                                  className="proposals-again"
                                  disabled={!!p.startAgainBlocked}
                                  title={p.startAgainBlocked ?? `Carry on from version ${v.number}: it is copied forward as the newest`}
                                  onClick={() => { setNotice(null); setConfirming({ id: p.id, number: v.number }) }}
                                >
                                  Start again from here
                                </button>
                                <Link className="btn btn-sm btn-ghost" href={`${href}?version=${v.number}`}>View</Link>
                              </>
                            )}
                            <a className="btn btn-sm" href={`/api/proposals/${p.id}/pdf?version=${v.number}`}>PDF</a>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
