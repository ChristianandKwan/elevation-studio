'use client'

import NotePanel, { type NoteChangeHandler } from './NotePanel'
import BudgetNoteRef from './BudgetNoteRef'
import { optionOnBudget } from '@/components/budget/budgetFocus'
import { ANCHOR_META, notesForPortal, notesOn, notesOwnedBy, writtenCount, type Note, type NoteAnchor } from '@/lib/notes'
import { labelOptions } from '@/lib/options'

interface NotesElevation {
  id: string
  name: string
  /** The client's pick. Once there is one, the budget shows only that option. */
  clientPickedOption: string | null
  elevation_options: Array<{
    id: string
    option: string
    sort_order?: number | null
    name?: string | null
    thumbnailUrl?: string | null
    /** The option's budget note: written on the budget, quoted here. */
    consultantNote?: string
    consultantNoteShownToClient?: boolean
  }>
}

interface Props {
  projectName: string
  clientName: string
  notes: Note[]
  elevations: NotesElevation[]
  onAdd: (anchor: NoteAnchor, id: string | null) => void
  onChange: NoteChangeHandler
  onDelete: (noteId: string) => void
  /** Opens the budget at an option's note. */
  onEditOnBudget: (elevationId: string, optionKey: string) => void
  /** Changes an option's budget note here, when the budget has no line for it. */
  onBudgetNoteChange: (elevationId: string, optionKey: string, note: string, shownToClient: boolean) => void
}

/**
 * What is true of the project as a whole, and of each wall in it.
 *
 * Notes about artists and about individual works are deliberately not here —
 * they live in the index, beside the works they are about. A project with
 * two dozen works would otherwise bury the four things this screen is for
 * under two dozen headings.
 */
export default function NotesScreen({
  projectName, clientName, notes, elevations, onAdd, onChange, onDelete, onEditOnBudget, onBudgetNoteChange,
}: Props) {
  const written = writtenCount(notes)
  const shownToClient = notesForPortal(notes).length

  return (
    <div className="index-view">
      <div className="index-content notes-content">
        <div className="index-head">
          <div>
            <h1 className="index-title">{projectName}</h1>
            <p className="index-sub">
              {clientName && <>{clientName} · </>}
              {written} note{written === 1 ? '' : 's'} written
              {shownToClient > 0 && <> · {shownToClient} shown to the client</>}
            </p>
          </div>
        </div>

        <p className="notes-preamble">
          What the proposal pack is built from — every note here goes into
          it. A note on an option is also shown to the client in the portal,
          unless it is set to C&amp;K. Notes about artists and about
          individual works are in the index, beside the works themselves.
          Notes about prices are written on the Budget page, and quoted here.
        </p>

        <Section
          anchor="project"
          suffix={projectName}
          // A note covering a set of works can be anchored to the project
          // when those works have no artist. It belongs to them, not here.
          notes={notesOwnedBy(notes, 'project')}
          onAdd={() => onAdd('project', null)}
          onChange={onChange}
          onDelete={onDelete}
        />

        <Section
          anchor="budget"
          notes={notesOn(notes, 'budget')}
          onAdd={() => onAdd('budget', null)}
          onChange={onChange}
          onDelete={onDelete}
        />

        {elevations.map(elev => {
          // labelOptions is the one place option order and naming are decided
          // (src/lib/options.ts) — this screen must not invent its own.
          const options = labelOptions(elev.elevation_options ?? [])
          const picked = options.find(o => o.option === elev.clientPickedOption)
          // An option's budget note, quoted with the way back to its line. Once
          // the client has picked, the budget shows only their pick, so the
          // other options' notes have no line to go to, and are edited here.
          const budgetNote = (opt: typeof options[number]) => {
            const onBudget = optionOnBudget(elev, opt.option)
            return (
              <BudgetNoteRef
                note={opt.consultantNote ?? ''}
                shownToClient={opt.consultantNoteShownToClient ?? true}
                onEdit={onBudget ? () => onEditOnBudget(elev.id, opt.option) : null}
                offBudget={`Not on the budget: the client picked ${picked?.title ?? 'another option'}`}
                onChange={(note, shown) => onBudgetNoteChange(elev.id, opt.option, note, shown)}
              />
            )
          }
          return (
            <section key={elev.id} className="index-group">
              <div className="budget-section-kicker index-kicker">
                <span>{elev.name}</span>
              </div>
              <p className="notes-hint">{ANCHOR_META.elevation.prompt}</p>
              <NotePanel
                notes={notesOn(notes, 'elevation', elev.id)}
                anchor="elevation"
                hintAbove
                onAdd={() => onAdd('elevation', elev.id)}
                onChange={onChange}
                onDelete={onDelete}
              />
              {/* A single option is the wall, so its budget note reads here. */}
              {options.length === 1 && budgetNote(options[0])}

              {/* Options only get their own heading when there is a choice to
                  explain. A single option is the wall, and a note about it is
                  a note about the elevation. */}
              {options.length > 1 && options.map(opt => (
                <div key={opt.id} className="notes-suborder">
                  {/* The wall as it stands. An option letter on its own says
                      nothing about which arrangement is being written about,
                      and these are already composited for the dashboard. */}
                  <div className="notes-option-head">
                    {opt.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="notes-option-thumb" src={opt.thumbnailUrl} alt="" />
                    )}
                    <div className="notes-sub-kicker">{opt.title}</div>
                  </div>
                  <NotePanel
                    notes={notesOn(notes, 'option', opt.id)}
                    anchor="option"
                    onAdd={() => onAdd('option', opt.id)}
                    onChange={onChange}
                    onDelete={onDelete}
                    compact
                  />
                  {budgetNote(opt)}
                </div>
              ))}
            </section>
          )
        })}

        {elevations.length === 0 && (
          <div className="index-empty">
            <p>No elevations yet.</p>
            <p>Add a wall in the studio and it will appear here with somewhere to write about it.</p>
          </div>
        )}
      </div>
    </div>
  )
}

/** A project-level heading: its prompt, and the notes under it. */
function Section({
  anchor, suffix, notes, onAdd, onChange, onDelete,
}: {
  anchor: NoteAnchor
  /** Named after the heading — "The project · Nepean". */
  suffix?: string
  notes: Note[]
  onAdd: () => void
  onChange: NoteChangeHandler
  onDelete: (noteId: string) => void
}) {
  return (
    <section className="index-group">
      <div className="budget-section-kicker index-kicker">
        <span>
          {ANCHOR_META[anchor].label}
          {suffix && <span className="notes-section-suffix"> · {suffix}</span>}
        </span>
      </div>
      <p className="notes-hint">{ANCHOR_META[anchor].prompt}</p>
      <NotePanel
        notes={notes}
        anchor={anchor}
        hintAbove
        onAdd={onAdd}
        onChange={onChange}
        onDelete={onDelete}
      />
    </section>
  )
}
