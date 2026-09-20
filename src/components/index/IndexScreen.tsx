'use client'

import { useMemo, useState } from 'react'
import WorkRow from './WorkRow'
import { groupWorksByArtist, placementsOf } from '@/lib/works'
import type { IndexElevation, WorkPatch } from '@/lib/works'
import type { Work } from '@/types'
import NotePanel, { type NotePatch } from '@/components/notes/NotePanel'
import { artistKey, notesMentioning, notesOn, type Note, type NoteAnchor, type NoteRole } from '@/lib/notes'

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
  /** Every note in the project; the index narrows them per artist and work. */
  notes: Note[]
  onAddNote: (anchor: NoteAnchor, role: NoteRole, id: string | null) => void
  onChangeNote: (noteId: string, patch: NotePatch) => void
  onDeleteNote: (noteId: string) => void
}

/**
 * Every work in the project, grouped by artist — hung, considered and
 * declined alike. Where the studio shows what is on a wall and the budget
 * what it costs, this is the record of what was looked at.
 */
export default function IndexScreen({
  projectName, clientName, works, elevations, artistSuggestions, onWorkChange, onAddWork, onDeleteWork,
  notes, onAddNote, onChangeNote, onDeleteNote,
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
          groups.map(g => {
            const key = artistKey(g.label)
            const narrowable = g.works.map(w => ({ id: w.id, name: w.name }))
            return (
              <section key={g.key} className="index-group">
                <div className="budget-section-kicker index-kicker">
                  <span>{g.label}</span>
                  <span className="index-kicker-count">{g.works.length}</span>
                </div>

                {/* Notes about the artist, including any narrowed to a few of
                    their works. The standing note that carries between
                    projects is edited on the Notes screen, not here — changing
                    it changes what other projects say. */}
                {key && (
                  <NotePanel
                    notes={notesOn(notes, 'artist', key)}
                    anchor="artist"
                    onAdd={role => onAddNote('artist', role, key)}
                    onChange={onChangeNote}
                    onDelete={onDeleteNote}
                    narrowableWorks={narrowable.length > 1 ? narrowable : undefined}
                    compact
                  />
                )}

                {g.works.map(w => (
                  <div key={w.id}>
                    <WorkRow
                      work={w}
                      placed={placementsOf(w.id, elevations)}
                      elevations={elevations}
                      onChange={patch => onWorkChange(w.id, patch)}
                      onDelete={() => onDeleteWork(w.id)}
                    />
                    {/* Both the notes written on this work and any artist note
                        narrowed to a set it belongs to — a consignment note is
                        about this work as much as one written on it. */}
                    <WorkNotes
                      work={w}
                      notes={notesMentioning(notes, w.id)}
                      onAdd={role => onAddNote('work', role, w.id)}
                      onChange={onChangeNote}
                      onDelete={onDeleteNote}
                    />
                  </div>
                ))}
              </section>
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * A work's notes, collapsed until there is something to read or somebody
 * wants to write. The index is a list to scan; an always-open editor under
 * every row would bury the rows.
 */
function WorkNotes({
  work, notes, onAdd, onChange, onDelete,
}: {
  work: Work
  notes: Note[]
  onAdd: (role: NoteRole) => void
  onChange: (noteId: string, patch: NotePatch) => void
  onDelete: (noteId: string) => void
}) {
  const [open, setOpen] = useState(notes.length > 0)
  const written = notes.filter(n => n.body.trim().length > 0).length

  if (!open) {
    return (
      <button type="button" className="work-notes-toggle" onClick={() => setOpen(true)}>
        {written > 0
          ? `${written} note${written === 1 ? '' : 's'} on ${work.name}`
          : '+ Note'}
      </button>
    )
  }

  return (
    <div className="work-notes">
      <NotePanel
        notes={notes}
        anchor="work"
        onAdd={onAdd}
        onChange={onChange}
        onDelete={onDelete}
        compact
      />
    </div>
  )
}
