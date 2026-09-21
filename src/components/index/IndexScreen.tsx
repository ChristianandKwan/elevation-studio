'use client'

import { useMemo, useState } from 'react'
import WorkRow from './WorkRow'
import { groupWorksByArtist, placementsOf } from '@/lib/works'
import type { IndexElevation, WorkPatch } from '@/lib/works'
import type { Work } from '@/types'
import NotePanel, { type NotePatch } from '@/components/notes/NotePanel'
import ArtistStandingNote from '@/components/notes/ArtistStandingNote'
import { ANCHOR_META, artistKey, notesMentioning, notesOn, type Note, type NoteAnchor } from '@/lib/notes'
import type { ArtistProfile } from '@/components/studio/StudioScreen'

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
  onAddNote: (anchor: NoteAnchor, id: string | null) => void
  /** A note covering several works at once, made by picking them first. */
  onAddWorkSetNote: (artistKey: string, workIds: string[]) => void
  onChangeNote: (noteId: string, patch: NotePatch) => void
  onDeleteNote: (noteId: string) => void
  /** Standing artist notes — the same text in every project they appear in. */
  artistProfiles: ArtistProfile[]
  onArtistProfileChange: (name: string, note: string) => void
}

/**
 * Every work in the project, grouped by artist — hung, considered and
 * declined alike. Where the studio shows what is on a wall and the budget
 * what it costs, this is the record of what was looked at.
 */
export default function IndexScreen({
  projectName, clientName, works, elevations, artistSuggestions, onWorkChange, onAddWork, onDeleteWork,
  notes, onAddNote, onAddWorkSetNote, onChangeNote, onDeleteNote,
  artistProfiles, onArtistProfileChange,
}: Props) {
  const nameOf = useMemo(() => {
    const m = new Map(works.map(w => [w.id, w.name]))
    return (id: string) => m.get(id)
  }, [works])
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
            // The works' own artist, not the group label. Works with no
            // artist group under a placeholder, and must not become one.
            const key = artistKey(g.works[0]?.artist)
            return (
              <ArtistGroupSection
                key={g.key}
                artistKeyValue={key}
                label={g.label}
                works={g.works}
                elevations={elevations}
                notes={notes}
                nameOf={nameOf}
                standingNote={artistProfiles.find(p => p.nameKey === key)?.note ?? ''}
                onStandingNoteChange={note => onArtistProfileChange(g.label, note)}
                onWorkChange={onWorkChange}
                onDeleteWork={onDeleteWork}
                onAddNote={onAddNote}
                onAddWorkSetNote={onAddWorkSetNote}
                onChangeNote={onChangeNote}
                onDeleteNote={onDeleteNote}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

/**
 * One artist: what carries between projects, what this project says, their
 * works, and any note covering several of them at once.
 *
 * Picking works and then writing about them is the way round that reads: the
 * set is made by pointing at things, which is how a consultant would describe
 * it out loud. The earlier version had the consultant open a note and tick
 * works from inside it, which nobody could explain.
 */
function ArtistGroupSection({
  artistKeyValue, label, works, elevations, notes, nameOf,
  standingNote, onStandingNoteChange,
  onWorkChange, onDeleteWork,
  onAddNote, onAddWorkSetNote, onChangeNote, onDeleteNote,
}: {
  artistKeyValue: string
  label: string
  works: Work[]
  elevations: IndexElevation[]
  notes: Note[]
  nameOf: (id: string) => string | undefined
  standingNote: string
  onStandingNoteChange: (note: string) => void
  onWorkChange: (workId: string, patch: WorkPatch) => void
  onDeleteWork: (workId: string) => void
  onAddNote: (anchor: NoteAnchor, id: string | null) => void
  onAddWorkSetNote: (artistKey: string, workIds: string[]) => void
  onChangeNote: (noteId: string, patch: NotePatch) => void
  onDeleteNote: (noteId: string) => void
}) {
  const [picking, setPicking] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showAbout, setShowAbout] = useState(false)

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function finish() {
    if (picked.size > 0) onAddWorkSetNote(artistKeyValue, [...picked])
    setPicked(new Set())
    setPicking(false)
  }

  const artistNotes = artistKeyValue ? notesOn(notes, 'artist', artistKeyValue) : []
  // A note covering a set is read on the works it covers, not again up here.
  const aboutTheArtist = artistNotes.filter(n => n.workIds.length === 0)

  return (
    <section className="index-group">
      <div className="budget-section-kicker index-kicker">
        <span>{label}</span>
        <span className="index-kicker-count">{works.length}</span>
      </div>

      {/* Writing about several works at once does not need the works to have
          an artist — a shared lead time or one consignment is just as likely
          among unattributed pieces. This used to sit inside the artist block
          below, so a group of works with no artist had nowhere to do it. */}
      {(artistKeyValue || works.length > 1) && (
        <>
          <div className="artist-note-tools">
            {artistKeyValue && (
              <button
                type="button"
                className={`artist-note-tab${showAbout ? ' on' : ''}`}
                onClick={() => setShowAbout(v => !v)}
              >
                {showAbout ? 'Hide notes about this artist' : `Notes about ${label}`}
              </button>
            )}
            {works.length > 1 && !picking && (
              // A real button rather than another quiet tab: this is the one
              // thing on the screen nobody finds on their own.
              <button type="button" className="btn btn-sm" onClick={() => setPicking(true)}>
                Note about several works
              </button>
            )}
          </div>

          {picking && (
            <div className="artist-picking">
              <div className="artist-picking-title">
                Pick the works this note covers, then write it once.
              </div>
              <p className="artist-picking-blurb">
                Useful when something is true of several pieces but not all of
                them — one consignment, one series, a shared lead time. The
                note appears on each work you pick, and editing it anywhere
                changes it everywhere.
              </p>
              <div className="artist-picking-actions">
                <span className="artist-pick-hint">
                  {picked.size === 0
                    ? 'Nothing picked yet'
                    : `${picked.size} of ${works.length} picked`}
                </span>
                <button type="button" className="btn btn-sm btn-primary" disabled={picked.size === 0} onClick={finish}>
                  Write about these
                </button>
                <button type="button" className="btn btn-sm" onClick={() => { setPicked(new Set()); setPicking(false) }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showAbout && artistKeyValue && (
            <div className="artist-note-open">
              <ArtistStandingNote
                name={label}
                note={standingNote}
                onChange={onStandingNoteChange}
              />
              <p className="notes-hint">{ANCHOR_META.artist.prompt}</p>
              <NotePanel
                notes={aboutTheArtist}
                anchor="artist"
                onAdd={() => onAddNote('artist', artistKeyValue)}
                onChange={onChangeNote}
                onDelete={onDeleteNote}
                compact
              />
            </div>
          )}
        </>
      )}

      {works.map(w => (
        <div key={w.id} className={picking ? 'index-pickable' : undefined}>
          <div className="index-pick-row">
            {picking && (
              <input
                type="checkbox"
                className="index-pick-box"
                checked={picked.has(w.id)}
                onChange={() => toggle(w.id)}
                aria-label={`Include ${w.name}`}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <WorkRow
                work={w}
                placed={placementsOf(w.id, elevations)}
                elevations={elevations}
                onChange={patch => onWorkChange(w.id, patch)}
                onDelete={() => onDeleteWork(w.id)}
              />
            </div>
          </div>
          {/* Both the notes written on this work and any note covering a set
              it belongs to — a consignment note is about this work as much as
              one written on it directly. */}
          <WorkNotes
            notes={notesMentioning(notes, w.id)}
            nameOf={nameOf}
            onAdd={() => onAddNote('work', w.id)}
            onChange={onChangeNote}
            onDelete={onDeleteNote}
          />
        </div>
      ))}
    </section>
  )
}

/**
 * A work's notes: the ones written on it, plus any note covering a set it
 * belongs to. With nothing written it is a single "+ Note" line, so the index
 * stays a list to scan.
 */
function WorkNotes({
  notes, nameOf, onAdd, onChange, onDelete,
}: {
  notes: Note[]
  nameOf: (id: string) => string | undefined
  onAdd: () => void
  onChange: (noteId: string, patch: NotePatch) => void
  onDelete: (noteId: string) => void
}) {
  // No open/closed state. A panel with no notes in it is already just a
  // "+ Note" line, so the collapsed state was the same thing drawn twice —
  // and keeping the two in step was where the bugs were: clicking "+ Note"
  // flashed the panel's own add button before the new note arrived, and
  // removing the last note left the panel open showing a button that no
  // longer matched the one you pressed to get there.
  return (
    <div className="work-notes">
      <NotePanel
        notes={notes}
        anchor="work"
        onAdd={onAdd}
        onChange={onChange}
        onDelete={onDelete}
        workName={nameOf}
        // No section heading down here to carry the prompt, so each card
        // shows it on the line with its own buttons.
        promptInline
        compact
      />
    </div>
  )
}
