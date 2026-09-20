'use client'

import { useMemo } from 'react'
import WorkRow from './WorkRow'
import { groupWorksByArtist, placementsOf } from '@/lib/works'
import type { IndexElevation, WorkPatch } from '@/lib/works'
import type { Work } from '@/types'

interface Props {
  projectName: string
  clientName: string
  works: Work[]
  elevations: IndexElevation[]
  /** Artists across the consultant's projects, so a name is typed the same way twice. */
  artistSuggestions: string[]
  onWorkChange: (workId: string, patch: WorkPatch) => void
  onAddWork: () => void
  onDeleteWork: (workId: string) => void
}

/**
 * Every work in the project, grouped by artist — hung, considered and
 * declined alike. Where the studio shows what is on a wall and the budget
 * what it costs, this is the record of what was looked at.
 */
export default function IndexScreen({
  projectName, clientName, works, elevations, artistSuggestions, onWorkChange, onAddWork, onDeleteWork,
}: Props) {
  const groups = useMemo(() => groupWorksByArtist(works), [works])
  const placedCount = works.filter(w => placementsOf(w.id, elevations).length > 0).length
  const declinedCount = works.filter(w => w.status === 'declined').length

  return (
    <div className="index-view">
      <div className="index-content">
        <div className="index-head">
          <div>
            <h1 className="index-title">{projectName}</h1>
            <p className="index-sub">
              {clientName && <>{clientName} · </>}
              {works.length} work{works.length === 1 ? '' : 's'}
              {works.length > 0 && <> · {placedCount} on a wall</>}
              {declinedCount > 0 && <> · {declinedCount} declined</>}
            </p>
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={onAddWork}>+ Add work</button>
        </div>

        {/* The artist inputs in the editor and the add modal both read this list. */}
        <datalist id="index-artists">
          {artistSuggestions.map(a => <option key={a} value={a} />)}
        </datalist>

        {groups.length === 0 ? (
          <div className="index-empty">
            <p>Nothing in the project yet.</p>
            <p>Works you place in the studio appear here — or add one now to have it on hand before you hang it.</p>
          </div>
        ) : (
          groups.map(g => (
            <section key={g.key} className="index-group">
              <div className="budget-section-kicker index-kicker">
                <span>{g.label}</span>
                <span className="index-kicker-count">{g.works.length}</span>
              </div>
              {g.works.map(w => (
                <WorkRow
                  key={w.id}
                  work={w}
                  placed={placementsOf(w.id, elevations)}
                  elevations={elevations}
                  onChange={patch => onWorkChange(w.id, patch)}
                  onDelete={() => onDeleteWork(w.id)}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  )
}
