'use client'

import { useMemo } from 'react'
import NotePanel, { type NotePatch } from './NotePanel'
import ArtistStandingNote from './ArtistStandingNote'
import { artistKey, notesOn, type Note, type NoteAnchor, type NoteRole } from '@/lib/notes'
import { groupWorksByArtist } from '@/lib/works'
import { labelOptions } from '@/lib/options'
import type { Work } from '@/types'
import type { ArtistProfile } from '@/components/studio/StudioScreen'

interface NotesElevation {
  id: string
  name: string
  elevation_options: Array<{ id: string; option: string; sort_order?: number | null; name?: string | null }>
}

interface Props {
  projectName: string
  clientName: string
  notes: Note[]
  works: Work[]
  elevations: NotesElevation[]
  artistProfiles: ArtistProfile[]
  onAdd: (anchor: NoteAnchor, role: NoteRole, id: string | null) => void
  onChange: (noteId: string, patch: NotePatch) => void
  onDelete: (noteId: string) => void
  onArtistProfileChange: (name: string, note: string) => void
}

/**
 * Everything written about the project, in the order a proposal reads it.
 *
 * The same panels appear beside the thing they are about — an option's notes
 * in the studio sidebar, a work's in the index — but those are shortcuts.
 * This is the document, and it is what the export walks.
 */
export default function NotesScreen({
  projectName, clientName, notes, works, elevations, artistProfiles,
  onAdd, onChange, onDelete, onArtistProfileChange,
}: Props) {
  const artistGroups = useMemo(() => groupWorksByArtist(works), [works])
  const written = notes.filter(n => n.body.trim().length > 0).length
  const privateCount = notes.filter(n => n.share === 'private' && n.body.trim().length > 0).length

  return (
    <div className="index-view">
      <div className="index-content notes-content">
        <div className="index-head">
          <div>
            <h1 className="index-title">{projectName}</h1>
            <p className="index-sub">
              {clientName && <>{clientName} · </>}
              {written} note{written === 1 ? '' : 's'} written
              {privateCount > 0 && <> · {privateCount} kept out of the export</>}
            </p>
          </div>
        </div>

        <p className="notes-preamble">
          What the export will be built from. Anything marked private stays
          here — it never reaches the file the proposal is made from.
        </p>

        {/* ── The project ─────────────────────────────────────── */}
        <section className="index-group">
          <div className="budget-section-kicker index-kicker">
            <span>The project</span>
          </div>
          <p className="notes-hint">
            The brief and the space belong here — they have nowhere else to
            live, and everything else in the proposal argues from them.
          </p>
          <NotePanel
            notes={notesOn(notes, 'project')}
            anchor="project"
            onAdd={role => onAdd('project', role, null)}
            onChange={onChange}
            onDelete={onDelete}
          />
        </section>

        {/* ── Each wall, and its options ──────────────────────── */}
        {elevations.map(elev => {
          // labelOptions is the one place option order and naming are decided
          // (src/lib/options.ts) — the notes screen must not invent its own.
          const options = labelOptions(elev.elevation_options ?? [])
          return (
            <section key={elev.id} className="index-group">
              <div className="budget-section-kicker index-kicker">
                <span>{elev.name}</span>
              </div>
              <NotePanel
                notes={notesOn(notes, 'elevation', elev.id)}
                anchor="elevation"
                onAdd={role => onAdd('elevation', role, elev.id)}
                onChange={onChange}
                onDelete={onDelete}
              />
              {options.map(opt => (
                <div key={opt.id} className="notes-suborder">
                  <div className="notes-sub-kicker">{opt.title}</div>
                  <NotePanel
                    notes={notesOn(notes, 'option', opt.id)}
                    anchor="option"
                    onAdd={role => onAdd('option', role, opt.id)}
                    onChange={onChange}
                    onDelete={onDelete}
                  />
                </div>
              ))}
            </section>
          )
        })}

        {/* ── Each artist, and their works ────────────────────── */}
        {artistGroups.map(g => {
          // From the works' own artist field, not the group label: works
          // with no artist group under a placeholder, and keying off that
          // would invent an artist called "Unattributed" with notes and a
          // standing profile of its own.
          const key = artistKey(g.works[0]?.artist)
          const profile = artistProfiles.find(p => p.nameKey === key)
          const narrowable = g.works.map(w => ({ id: w.id, name: w.name }))
          return (
            <section key={g.key} className="index-group">
              <div className="budget-section-kicker index-kicker">
                <span>{g.label}</span>
                <span className="index-kicker-count">{g.works.length}</span>
              </div>

              {key && (
                <ArtistStandingNote
                  name={g.label}
                  note={profile?.note ?? ''}
                  onChange={note => onArtistProfileChange(g.label, note)}
                />
              )}

              <div className="notes-sub-kicker">In this project</div>
              <NotePanel
                notes={notesOn(notes, 'artist', key)}
                anchor="artist"
                onAdd={role => onAdd('artist', role, key)}
                onChange={onChange}
                onDelete={onDelete}
                narrowableWorks={narrowable.length > 1 ? narrowable : undefined}
              />

              {g.works.map(w => (
                <div key={w.id} className="notes-suborder">
                  <div className="notes-sub-kicker">{w.name}</div>
                  <NotePanel
                    notes={notesOn(notes, 'work', w.id)}
                    anchor="work"
                    onAdd={role => onAdd('work', role, w.id)}
                    onChange={onChange}
                    onDelete={onDelete}
                    compact
                  />
                </div>
              ))}
            </section>
          )
        })}

        {elevations.length === 0 && works.length === 0 && (
          <div className="index-empty">
            <p>Nothing to write about yet.</p>
            <p>Add a wall or a work and it will appear here with somewhere to write.</p>
          </div>
        )}
      </div>
    </div>
  )
}
