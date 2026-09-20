'use client'

import { useEffect, useRef, useState } from 'react'
import { ANCHOR_META, workSetLabel, type Note, type NoteAnchor, type NoteShare } from '@/lib/notes'

export interface NotePatch {
  body?: string
  share?: NoteShare
  workIds?: string[]
}

interface Props {
  /** Already narrowed to this anchor, in the order they should read. */
  notes: Note[]
  anchor: NoteAnchor
  onAdd: () => void
  onChange: (noteId: string, patch: NotePatch) => void
  onDelete: (noteId: string) => void
  /** Names a multi-work note's set, so it reads as more than a count. */
  workName?: (workId: string) => string | undefined
  /** Tightens spacing for the studio sidebar and the index, which have none to spare. */
  compact?: boolean
}

/**
 * Every note on one thing, and the way to write another.
 *
 * Adding one is a single click. There used to be a role to choose first —
 * a filing decision standing between the consultant and the first word —
 * and dropping it is most of what this panel is now.
 */
export default function NotePanel({
  notes, anchor, onAdd, onChange, onDelete, workName, compact = false,
}: Props) {
  return (
    <div className={`note-panel${compact ? ' compact' : ''}`}>
      {notes.map(n => (
        <NoteCard
          key={n.id}
          note={n}
          anchor={anchor}
          workName={workName}
          // A note can show up somewhere it is not anchored — a note covering
          // several works appears on each of them. It is the same note, so
          // editing it here changes it everywhere; saying so is the
          // difference between a shortcut and a trap.
          borrowed={n.anchor !== anchor}
          onChange={patch => onChange(n.id, patch)}
          onDelete={() => onDelete(n.id)}
        />
      ))}

      <button type="button" className="btn btn-sm note-add" onClick={onAdd}>
        {notes.length === 0
          ? `Write about ${ANCHOR_META[anchor].inline}`
          : '+ Add another note'}
      </button>
    </div>
  )
}

function NoteCard({
  note, anchor, workName, borrowed = false, onChange, onDelete,
}: {
  note: Note
  anchor: NoteAnchor
  workName?: (workId: string) => string | undefined
  /** Shown here but written elsewhere — editing it changes it there too. */
  borrowed?: boolean
  onChange: (patch: NotePatch) => void
  onDelete: () => void
}) {
  // The textarea holds its own text between saves: every keystroke going
  // through the parent's state would re-render every panel on the screen.
  const [body, setBody] = useState(note.body)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)

  // A note written elsewhere — the same note shown on two works — must not be
  // overwritten by a stale textarea. Adjusted during render rather than in an
  // effect, so the box never flashes the old text.
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
  // box; these run long and are read back more than they are written.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [body])

  const covers = note.workIds.length > 1 && workName
    ? workSetLabel(note.workIds, workName)
    : ''

  return (
    <div className={`note-card${note.share === 'private' ? ' private' : ''}${borrowed ? ' borrowed' : ''}`}>
      <div className="note-card-head">
        {covers && (
          <span className="note-covers" title={note.workIds.map(id => workName?.(id)).filter(Boolean).join(', ')}>
            About {covers}
          </span>
        )}
        {borrowed && !covers && (
          <span className="note-borrowed">From {ANCHOR_META[note.anchor].inline}</span>
        )}

        <div className="note-card-actions">
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

          {/* No Remove on a borrowed note. "Remove" here would read as taking
              it off this work and would in fact delete the shared note; it is
              removed where it was written. */}
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

      <textarea
        ref={taRef}
        className="note-body"
        value={body}
        placeholder={ANCHOR_META[anchor].prompt}
        onChange={e => setBody(e.target.value)}
        onBlur={commit}
        autoFocus={note.body === '' && !borrowed}
      />
    </div>
  )
}
