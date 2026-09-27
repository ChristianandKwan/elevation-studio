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
  /** No first draft and nothing working on one: it stopped, and may be removed. */
  stalled: boolean
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
 * A proposal shows its latest version; the earlier ones fold away beneath
 * it. Any version opens or downloads. An older one can be started again
 * from: it is copied forward as the newest, and the next change is made to
 * it. Nothing is overwritten, so starting again is never a loss.
 */
export default function ProposalsView({ projectId, onNewProposal }: Props) {
  const [proposals, setProposals] = useState<ProposalItem[] | null>(null)
  const [starts, setStarts] = useState<{ left: number; limit: number } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** The version whose Start again is asking "are you sure". */
  const [confirming, setConfirming] = useState<{ id: string; number: number } | null>(null)
  const [startingAgain, setStartingAgain] = useState(false)
  /** Proposals whose earlier versions are unfolded. */
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set())
  const [removing, setRemoving] = useState<string | null>(null)
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
  const working = proposals?.some(p => p.startAgainBlocked && !p.stalled && p.status !== 'failed' && p.status !== 'resting')
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

  async function remove(proposalId: string) {
    setRemoving(proposalId)
    setNotice(null)
    try {
      const res = await fetch(`/api/proposals/${proposalId}`, { method: 'DELETE' })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'It could not be removed. Try again in a moment.')
      await load()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'It could not be removed. Try again in a moment.')
    } finally {
      setRemoving(null)
    }
  }

  const empty = proposals?.length === 0

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
          {onNewProposal && !empty && <button className="btn btn-primary" onClick={onNewProposal}>New proposal</button>}
        </div>

        {notice && <p className="proposals-notice" role="status">{notice}</p>}

        {loadError ? (
          <p className="proposals-empty">{loadError}</p>
        ) : !proposals ? (
          <div className="proposals-loading"><InlineSpinner size={28} /></div>
        ) : empty ? (
          <EmptyState onNewProposal={onNewProposal} />
        ) : proposals.map(p => {
          const href = `/projects/${projectId}/proposals/${p.id}`
          const [latest, ...earlier] = p.versions
          const open = unfolded.has(p.id)

          const versionRow = (v: VersionItem) => {
            const isLatest = v.number === p.currentVersion
            const asking = confirming?.id === p.id && confirming.number === v.number
            return (
              <div key={v.number} className={`proposals-version${isLatest ? ' latest' : ''}`}>
                <div className="proposals-vnum">
                  Version {v.number}
                  <small>{when(v.createdAt)}</small>
                </div>
                <div className="proposals-vsum" title={v.summary}>
                  {isLatest && <span className="proposals-latest">Latest</span>}
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
                      {isLatest ? (
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
          }

          return (
            <section key={p.id} className={`proposals-card${p.versions.length ? '' : ' proposals-card--draftless'}`}>
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

                {!latest && (
                  p.stalled || p.status === 'failed' ? (
                    <div className="proposals-state proposals-state--stopped">
                      <span>
                        {p.status === 'failed' && p.error
                          ? p.error
                          : 'Claude stopped before finishing the first draft, so there is nothing in this one.'}
                      </span>
                      <button
                        className="btn btn-sm"
                        onClick={() => remove(p.id)}
                        disabled={removing === p.id}
                      >
                        {removing === p.id ? 'Removing…' : 'Remove'}
                      </button>
                    </div>
                  ) : (
                    <p className="proposals-state">
                      <InlineSpinner size={13} immediate /> Claude is building the first draft…
                    </p>
                  )
                )}

                {latest && versionRow(latest)}

                {earlier.length > 0 && (
                  <>
                    <button
                      className="proposals-fold"
                      aria-expanded={open}
                      onClick={() => setUnfolded(u => {
                        const next = new Set(u)
                        if (next.has(p.id)) next.delete(p.id)
                        else next.add(p.id)
                        return next
                      })}
                    >
                      <span className="proposals-fold-mark" aria-hidden="true">{open ? '−' : '+'}</span>
                      {open ? 'Hide' : 'Show'} earlier versions ({earlier.length})
                    </button>
                    {open && <div className="proposals-earlier">{earlier.map(versionRow)}</div>}
                  </>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

/**
 * What a project with no proposals shows: what one is, how it goes, and the
 * button. The first time a consultant opens this tab is the moment to say.
 */
function EmptyState({ onNewProposal }: { onNewProposal?: () => void }) {
  return (
    <div className="proposals-empty-state">
      <div className="proposals-empty-sheet" aria-hidden="true">
        <span className="proposals-empty-rule" />
        <span className="proposals-empty-mark">C&amp;K</span>
        <span className="proposals-empty-lines" />
      </div>
      <div className="proposals-empty-text">
        <h2>No proposals yet</h2>
        <p>
          Claude lays out a client proposal in the Christian &amp; Kwan style, from the walls,
          works, notes and budget already in this project.
        </p>
        <ol>
          <li><strong>Choose</strong> the walls and options to include, and anything Claude should know.</li>
          <li><strong>Wait a few minutes</strong> for the first draft. You can leave and come back.</li>
          <li><strong>Refine it</strong> by writing to Claude, the way you would brief a designer.</li>
        </ol>
        {onNewProposal
          ? <button className="btn btn-primary" onClick={onNewProposal}>New proposal</button>
          : <p className="proposals-empty-aside">Proposals are made on the live studio.</p>}
      </div>
    </div>
  )
}
