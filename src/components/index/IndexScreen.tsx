'use client'

import { useMemo, useState } from 'react'
import WorkRow from './WorkRow'
import { groupWorksByArtist, placementsOf } from '@/lib/works'
import type { IndexElevation, WorkPatch } from '@/lib/works'
import type { Work } from '@/types'
import NotePanel, { type NotePatch } from '@/components/notes/NotePanel'
import ArtistStandingNote from '@/components/notes/ArtistStandingNote'
import { ANCHOR_META, notesMentioning, notesOwnedBy, type Note, type NoteAnchor } from '@/lib/notes'
import ArtistNameEditor from './ArtistNameEditor'
import ExportModal from '@/components/export/ExportModal'
import type { Artist } from '@/lib/artists'

interface Props {
  projectId: string
  /**
   * Photograph the budget as it would print, for the export pack. Lives in
   * StudioScreen because that is where the budget's data already is; the
   * index only forwards it to the export screen.
   */
  onCaptureBudget: () => Promise<string | null>
  projectName: string
  clientName: string
  works: Work[]
  elevations: IndexElevation[]
  /** Every artist the practice knows — the work editor offers these. */
  artists: Artist[]
  /** Put a work with an artist, creating them if they are new. */
  onSetWorkArtist: (workId: string, name: string) => void
  /** Rename an artist everywhere at once. */
  onRenameArtist: (artistId: string, name: string) => void
  /** The standing note about an artist, carried into every project. */
  onArtistNoteChange: (artistId: string, note: string) => void
  onWorkChange: (workId: string, patch: WorkPatch) => void
  onAddWork: () => void
  onDeleteWork: (workId: string) => void
  /** Every note in the project; the index narrows them per artist and work. */
  notes: Note[]
  onAddNote: (anchor: NoteAnchor, id: string | null) => void
  /** A note covering several works at once, made by picking them first. */
  onAddWorkSetNote: (artistKey: string, workIds: string[]) => void
  /**
   * Fold several records of one print into a single work. The picked ids go
   * up; which one survives is chosen in the confirmation, where the pictures
   * can be seen side by side.
   */
  onMergeWorks: (workIds: string[]) => void
  onChangeNote: (noteId: string, patch: NotePatch) => void
  onDeleteNote: (noteId: string) => void
}

/**
 * Every work in the project, grouped by artist — hung, considered and
 * declined alike. Where the studio shows what is on a wall and the budget
 * what it costs, this is the record of what was looked at.
 */
export default function IndexScreen({
  projectId, onCaptureBudget, projectName, clientName, works, elevations, onWorkChange, onAddWork, onDeleteWork,
  notes, onAddNote, onAddWorkSetNote, onMergeWorks, onChangeNote, onDeleteNote,
  artists, onSetWorkArtist, onRenameArtist, onArtistNoteChange,
}: Props) {
  const nameOf = useMemo(() => {
    const m = new Map(works.map(w => [w.id, w.name]))
    return (id: string) => m.get(id)
  }, [works])
  const groups = useMemo(() => groupWorksByArtist(works), [works])
  const placedCount = works.filter(w => placementsOf(w.id, elevations).length > 0).length
  const setAsideCount = works.filter(w => w.setAside).length
  const [exporting, setExporting] = useState(false)

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
              {setAsideCount > 0 && <> · {setAsideCount} set aside</>}
            </p>
          </div>
          <div className="index-head-actions">
            {/* Inside the content, not the header group — see index-view.css. */}
            <button type="button" className="btn btn-sm" onClick={() => setExporting(true)}>
              Export pack
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={onAddWork}>+ Add work</button>
          </div>
        </div>

        {exporting && (
          <ExportModal
            projectId={projectId}
            projectName={projectName}
            elevations={elevations}
            setAsideCount={setAsideCount}
            onCaptureBudget={onCaptureBudget}
            onClose={() => setExporting(false)}
          />
        )}

        {/* The artist inputs in the editor and the add modal both read this
            list. It is the artist rows themselves now, not a list scraped
            from the spellings on works — that is how 'Paula scher' got in
            beside 'Paula Scher'. */}
        <datalist id="index-artists">
          {artists.map(a => <option key={a.id} value={a.name} />)}
        </datalist>

        {groups.length === 0 ? (
          <div className="index-empty">
            <p>Nothing in the project yet.</p>
            <p>Works you place in the studio appear here — or add one now to have it on hand before you hang it.</p>
          </div>
        ) : (
          groups.map(g => {
            const artist = g.artistId ? artists.find(a => a.id === g.artistId) : undefined
            return (
              <ArtistGroupSection
                key={g.key}
                artist={artist}
                artists={artists}
                label={g.label}
                works={g.works}
                elevations={elevations}
                notes={notes}
                nameOf={nameOf}
                onRenameArtist={onRenameArtist}
                onArtistNoteChange={onArtistNoteChange}
                onSetWorkArtist={onSetWorkArtist}
                onWorkChange={onWorkChange}
                onDeleteWork={onDeleteWork}
                onAddNote={onAddNote}
                onAddWorkSetNote={onAddWorkSetNote}
                onMergeWorks={onMergeWorks}
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
  artist, artists, label, works, elevations, notes, nameOf,
  onRenameArtist, onArtistNoteChange, onSetWorkArtist,
  onWorkChange, onDeleteWork,
  onAddNote, onAddWorkSetNote, onMergeWorks, onChangeNote, onDeleteNote,
}: {
  /** Undefined for the unattributed group, which is the absence of an artist. */
  artist?: Artist
  artists: Artist[]
  label: string
  works: Work[]
  elevations: IndexElevation[]
  notes: Note[]
  nameOf: (id: string) => string | undefined
  onRenameArtist: (artistId: string, name: string) => void
  onArtistNoteChange: (artistId: string, note: string) => void
  onSetWorkArtist: (workId: string, name: string) => void
  onWorkChange: (workId: string, patch: WorkPatch) => void
  onDeleteWork: (workId: string) => void
  onAddNote: (anchor: NoteAnchor, id: string | null) => void
  onAddWorkSetNote: (artistId: string, workIds: string[]) => void
  onMergeWorks: (workIds: string[]) => void
  onChangeNote: (noteId: string, patch: NotePatch) => void
  onDeleteNote: (noteId: string) => void
}) {
  const artistKeyValue = artist?.id ?? ''
  // Two things are done by picking works: writing one note across several,
  // and folding duplicates into one. They share the checkboxes and differ in
  // what the button at the end does.
  const [picking, setPicking] = useState<'note' | 'merge' | null>(null)
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

  const enough = picking === 'merge' ? picked.size >= 2 : picked.size > 0

  function stop() {
    setPicked(new Set())
    setPicking(null)
  }

  function finish() {
    if (!enough) return
    if (picking === 'merge') onMergeWorks([...picked])
    else onAddWorkSetNote(artistKeyValue, [...picked])
    stop()
  }

  // A note covering a set is read on the works it covers, not again up here.
  const aboutTheArtist = artistKeyValue ? notesOwnedBy(notes, 'artist', artistKeyValue) : []

  return (
    <section className="index-group">
      <div className="budget-section-kicker index-kicker">
        {artist
          ? (
            <ArtistNameEditor
              artist={artist}
              artists={artists}
              onRename={name => onRenameArtist(artist.id, name)}
            />
          )
          : <span>{label}</span>}
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
              <>
                {/* A real button rather than another quiet tab: this is the
                    one thing on the screen nobody finds on their own. */}
                <button type="button" className="btn btn-sm" onClick={() => setPicking('note')}>
                  Note about several works
                </button>
                <button type="button" className="btn btn-sm" onClick={() => setPicking('merge')}>
                  Merge duplicates
                </button>
              </>
            )}
          </div>

          {picking && (
            <div className="artist-picking">
              <div className="artist-picking-title">
                {picking === 'merge'
                  ? 'Pick the records that are the same print.'
                  : 'Pick the works this note covers, then write it once.'}
              </div>
              <p className="artist-picking-blurb">
                {picking === 'merge'
                  ? `The same print uploaded twice is two records here, each with its
                     own file. Pick them and you choose which one to keep; everywhere
                     the others hang moves across, and their files go. Check the
                     pictures rather than the names — two records can share a name and
                     be different prints.`
                  : `Useful when something is true of several pieces but not all of
                     them — one consignment, one series, a shared lead time. The note
                     appears on each work you pick, and editing it anywhere changes it
                     everywhere.`}
              </p>
              <div className="artist-picking-actions">
                <span className="artist-pick-hint">
                  {picked.size === 0
                    ? 'Nothing picked yet'
                    : picking === 'merge' && picked.size < 2
                      ? 'Pick at least two'
                      : `${picked.size} of ${works.length} picked`}
                </span>
                <button type="button" className="btn btn-sm btn-primary" disabled={!enough} onClick={finish}>
                  {picking === 'merge' ? 'Merge these' : 'Write about these'}
                </button>
                <button type="button" className="btn btn-sm" onClick={stop}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showAbout && artistKeyValue && (
            <div className="artist-note-open">
              <ArtistStandingNote
                name={artist!.name}
                note={artist!.note}
                onChange={note => onArtistNoteChange(artist!.id, note)}
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
                onArtistChange={name => onSetWorkArtist(w.id, name)}
                onDelete={() => onDeleteWork(w.id)}
              />
            </div>
          </div>
          {/* Both the notes written on this work and any note covering a set
              it belongs to — a consignment note is about this work as much as
              one written on it directly. */}
          <WorkNotes
            notes={notesMentioning(notes, w.id)}
            workId={w.id}
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
  notes, workId, nameOf, onAdd, onChange, onDelete,
}: {
  notes: Note[]
  /** Which work these are being read on — see NotePanel's `onWork`. */
  workId: string
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
        onWork={workId}
        // No section heading down here to carry the prompt, so each card
        // shows it on the line with its own buttons.
        promptInline
        compact
      />
    </div>
  )
}
