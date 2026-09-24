'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ANCHOR_META, NOTE_SHARES, SHARE_META, showsInPortal, workSetLabel,
  type Note, type NoteAnchor, type NoteShare,
} from '@/lib/notes'

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
  /**
   * The work this panel belongs to, where it belongs to one.
   *
   * A note covering several works is anchored to their artist (or to the
   * project) and read on each work it covers. Without knowing which work it
   * is being read on, the card cannot offer to take it off this one — and
   * for a long time it could not offer to delete it either, which left those
   * notes with no way out at all.
   */
  onWork?: string
  /**
   * Show what this note is for on the card itself, beside its buttons, for
   * the places with no section heading above to carry it.
   */
  promptInline?: boolean
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
  notes, anchor, onAdd, onChange, onDelete, workName, onWork,
  promptInline = false, compact = false,
}: Props) {
  return (
    <div className={`note-panel${compact ? ' compact' : ''}`}>
      {notes.map(n => (
        <NoteCard
          key={n.id}
          note={n}
          anchor={anchor}
          workName={workName}
          promptInline={promptInline}
          // A note can show up somewhere it is not anchored — a note covering
          // several works appears on each of them. It is the same note, so
          // editing it here changes it everywhere; saying so is the
          // difference between a shortcut and a trap.
          borrowed={n.anchor !== anchor}
          onWork={onWork}
          onChange={patch => onChange(n.id, patch)}
          onDelete={() => onDelete(n.id)}
        />
      ))}

      {/* A quiet line rather than a button. Every section on the Notes screen
          has one, and a column of hard-edged buttons down an otherwise calm
          page made the page look like a form to fill in rather than a place
          to write. What each one is for is already said above it. */}
      <button type="button" className="note-add" onClick={onAdd}>+ Note</button>
    </div>
  )
}

function NoteCard({
  note, anchor, workName, onWork, promptInline = false, borrowed = false,
  onChange, onDelete,
}: {
  note: Note
  anchor: NoteAnchor
  workName?: (workId: string) => string | undefined
  promptInline?: boolean
  /** Shown here but written elsewhere — editing it changes it there too. */
  borrowed?: boolean
  onWork?: string
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

  /**
   * Whether taking this note off the work it is being read on would leave it
   * covering anything. When it would not, there is only one sensible action
   * and offering two would be a choice without a difference.
   */
  const coversOthers = !!onWork
    && note.workIds.includes(onWork)
    && note.workIds.length > 1

  const inPortal = showsInPortal(note.anchor)

  return (
    <div className={`note-card${inPortal && note.share === 'studio' ? ' ck-only' : ''}${borrowed ? ' borrowed' : ''}`}>
      <div className="note-card-head">
        {covers && (
          <span className="note-covers" title={note.workIds.map(id => workName?.(id)).filter(Boolean).join(', ')}>
            About {covers}
          </span>
        )}
        {borrowed && !covers && (
          <span className="note-borrowed">From {ANCHOR_META[note.anchor].inline}</span>
        )}
        {promptInline && !covers && !borrowed && (
          <span className="note-prompt">{ANCHOR_META[anchor].prompt}</span>
        )}

        <div className="note-card-actions">
          {/* Only where the portal has a place for the note: elsewhere every
              note goes into the pack and nowhere else, and a switch would
              change nothing. */}
          {inPortal && (
            <div className="note-share" role="radiogroup" aria-label="Who can see this note">
              {NOTE_SHARES.map(share => (
                <button
                  key={share}
                  type="button"
                  role="radio"
                  aria-checked={note.share === share}
                  className={note.share === share ? 'on' : ''}
                  title={SHARE_META[share].title}
                  onClick={() => { if (note.share !== share) onChange({ share }) }}
                >
                  {SHARE_META[share].label}
                </button>
              ))}
            </div>
          )}

          {/* A plain "Remove" on a note being read somewhere it is not
              anchored would say one thing and do another: it looks like
              taking it off this work and would in fact delete a note several
              works share. So the covering case asks which is meant.

              It used to show nothing at all, which was worse — the note was
              filtered out of its own artist's panel as well, so there was no
              screen anywhere that would delete it. */}
          {confirmDelete ? (
            <>
              {coversOthers && (
                <button
                  type="button"
                  className="note-del"
                  onClick={() => {
                    onChange({ workIds: note.workIds.filter(id => id !== onWork) })
                    setConfirmDelete(false)
                  }}
                >
                  Just this work
                </button>
              )}
              <button type="button" className="note-del confirm" onClick={onDelete}>
                {coversOthers ? 'Delete for all' : 'Delete'}
              </button>
              <button type="button" className="note-del" onClick={() => setConfirmDelete(false)}>Keep</button>
            </>
          ) : (
            <button type="button" className="note-del" onClick={() => setConfirmDelete(true)}>Remove</button>
          )}
        </div>
      </div>

      <textarea
        ref={taRef}
        className="note-body"
        value={body}
        placeholder={promptInline ? '' : ANCHOR_META[anchor].prompt}
        onChange={e => setBody(e.target.value)}
        onBlur={commit}
        autoFocus={note.body === '' && !borrowed}
      />
    </div>
  )
}
