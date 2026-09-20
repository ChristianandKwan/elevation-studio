'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ANCHOR_META, ROLE_META, defaultRoleFor, rolesFor,
  type Note, type NoteAnchor, type NoteRole, type NoteShare,
} from '@/lib/notes'

export interface NotePatch {
  role?: NoteRole
  body?: string
  share?: NoteShare
  workIds?: string[]
}

interface Props {
  /** Already narrowed to this anchor, in the order they should read. */
  notes: Note[]
  anchor: NoteAnchor
  onAdd: (role: NoteRole) => void
  onChange: (noteId: string, patch: NotePatch) => void
  onDelete: (noteId: string) => void
  /**
   * The artist's works, when this panel is on an artist. Passing these turns
   * on narrowing: a note can say it is about four of them rather than all.
   */
  narrowableWorks?: Array<{ id: string; name: string }>
  /** Tightens spacing for the studio sidebar, which has none to spare. */
  compact?: boolean
}

/**
 * Every note on one thing, and the way to write another.
 *
 * The same panel serves all five anchors. What changes between them is which
 * roles are offered and whether narrowing is available — both passed in,
 * because a second editor is a second thing to keep in step.
 */
export default function NotePanel({
  notes, anchor, onAdd, onChange, onDelete, narrowableWorks, compact = false,
}: Props) {
  const [adding, setAdding] = useState(false)
  const roles = rolesFor(anchor)

  return (
    <div className={`note-panel${compact ? ' compact' : ''}`}>
      {notes.length === 0 && !adding && (
        <p className="note-empty">
          Nothing written about {ANCHOR_META[anchor].label} yet.
        </p>
      )}

      {notes.map(n => (
        <NoteCard
          key={n.id}
          note={n}
          roles={roles}
          narrowableWorks={narrowableWorks}
          // A note can show up somewhere it is not anchored — an artist note
          // narrowed to a set appears on each work in that set. It is the
          // same note, so editing it here changes it everywhere; saying so
          // is the difference between a shortcut and a trap.
          borrowed={n.anchor !== anchor}
          onChange={patch => onChange(n.id, patch)}
          onDelete={() => onDelete(n.id)}
        />
      ))}

      {adding ? (
        <div className="note-role-picker">
          <div className="note-role-picker-title">What is this note for?</div>
          {roles.map(r => (
            <button
              key={r}
              type="button"
              className="note-role-option"
              onClick={() => { onAdd(r); setAdding(false) }}
            >
              <span className="note-role-option-label">{ROLE_META[r].label}</span>
              <span className="note-role-option-blurb">{ROLE_META[r].blurb}</span>
            </button>
          ))}
          <button type="button" className="btn btn-sm" onClick={() => setAdding(false)}>Cancel</button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm note-add"
          onClick={() => {
            // One role on offer is not a choice worth making somebody click
            // through, so it is skipped.
            if (roles.length === 1) onAdd(defaultRoleFor(anchor))
            else setAdding(true)
          }}
        >
          + Add a note
        </button>
      )}
    </div>
  )
}

function NoteCard({
  note, roles, narrowableWorks, borrowed = false, onChange, onDelete,
}: {
  note: Note
  roles: readonly NoteRole[]
  narrowableWorks?: Array<{ id: string; name: string }>
  /** Shown here but anchored elsewhere — editing it changes it there too. */
  borrowed?: boolean
  onChange: (patch: NotePatch) => void
  onDelete: () => void
}) {
  // The textarea holds its own text between saves: every keystroke going
  // through the parent's state would re-render every panel on the screen.
  const [body, setBody] = useState(note.body)
  const [narrowing, setNarrowing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // A note written elsewhere — the same artist note is shown on two screens —
  // must not be overwritten by a stale textarea. Adjusted during render
  // rather than in an effect: React re-runs this component before anything
  // is painted, so the box never flashes the old text.
  const [saved, setSaved] = useState(note.body)
  if (note.body !== saved) {
    setSaved(note.body)
    setBody(note.body)
  }

  function commit() {
    if (body === saved) return
    setSaved(body)
    onChange({ body })
  }

  // Grow with the text rather than making the consultant scroll a four-line
  // box; a rationale runs long and is read back more than it is written.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [body])

  const narrowCount = note.workIds.length

  return (
    <div className={`note-card${note.share === 'private' ? ' private' : ''}${borrowed ? ' borrowed' : ''}`}>
      <div className="note-card-head">
        {borrowed && (
          <span
            className="note-borrowed"
            title={`Written on ${ANCHOR_META[note.anchor].label}. Changing it here changes it there.`}
          >
            From {ANCHOR_META[note.anchor].label}
          </span>
        )}
        <select
          className="note-role-select"
          value={note.role}
          onChange={e => onChange({ role: e.target.value as NoteRole })}
          title={ROLE_META[note.role]?.blurb}
        >
          {roles.map(r => <option key={r} value={r}>{ROLE_META[r].label}</option>)}
          {/* A role the picker no longer offers here, kept so changing an
              anchor's roles later cannot silently relabel existing notes. */}
          {!roles.includes(note.role) && (
            <option value={note.role}>{ROLE_META[note.role]?.label ?? note.role}</option>
          )}
        </select>

        <button
          type="button"
          className={`note-share${note.share === 'private' ? ' on' : ''}`}
          title={note.share === 'private'
            ? 'Private — kept out of the export'
            : 'Goes into the export'}
          onClick={() => onChange({ share: note.share === 'private' ? 'proposal' : 'private' })}
        >
          {note.share === 'private' ? 'Private' : 'In proposal'}
        </button>

        <div className="note-card-actions">
          {narrowableWorks && narrowableWorks.length > 0 && (
            <button
              type="button"
              className={`note-narrow-btn${narrowCount > 0 ? ' on' : ''}`}
              onClick={() => setNarrowing(v => !v)}
              title="Limit this note to some of the artist's works"
            >
              {narrowCount > 0 ? `${narrowCount} of ${narrowableWorks.length}` : 'All works'}
            </button>
          )}
          {/* No Remove on a borrowed note. "Remove" here would read as
              "take it off this work" and would in fact delete the shared
              note; it is removed where it lives. */}
          {!borrowed && (confirmDelete ? (
            <>
              <button type="button" className="note-del confirm" onClick={onDelete}>Delete</button>
              <button type="button" className="note-del" onClick={() => setConfirmDelete(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="note-del" onClick={() => setConfirmDelete(true)}>Remove</button>
          ))}
        </div>
      </div>

      {narrowing && narrowableWorks && (
        <div className="note-narrow">
          <div className="note-narrow-title">
            Which works is this about? None ticked means all of them.
          </div>
          {narrowableWorks.map(w => (
            <label key={w.id} className="note-narrow-row">
              <input
                type="checkbox"
                checked={note.workIds.includes(w.id)}
                onChange={e => {
                  const next = e.target.checked
                    ? [...note.workIds, w.id]
                    : note.workIds.filter(id => id !== w.id)
                  onChange({ workIds: next })
                }}
              />
              <span>{w.name}</span>
            </label>
          ))}
        </div>
      )}

      <textarea
        ref={taRef}
        className="note-body"
        value={body}
        placeholder={ROLE_META[note.role]?.blurb ?? ''}
        onChange={e => setBody(e.target.value)}
        onBlur={commit}
      />
    </div>
  )
}
