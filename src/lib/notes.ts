/**
 * Notes, in one place.
 *
 * A note is a body of text attached to something: the project, its budget,
 * an elevation, an option, a work, or an artist. That attachment is the only
 * structure a note carries.
 *
 * An earlier version also made the consultant classify each note — brief,
 * rationale, sourcing, commercial — so the export would know which part of a
 * proposal it belonged in. That was the wrong trade. Working out what a note
 * is for is cheap for a language model reading the export and expensive for
 * the person writing it, and the picker stood between them and the first
 * word. What a note is attached to cannot be inferred from prose; what it is
 * for can be. The vocabulary survives as the prompt under each heading,
 * where it invites writing rather than interrupting it.
 *
 * Nothing here talks to the database or the DOM, so `node --test` can run it
 * and every screen can share it.
 *
 * Artists are anchored by id, not by name. They were anchored by normalised
 * name until 032, which meant renaming an artist left their notes pointing at
 * a name nothing had any more — see src/lib/artists.ts.
 */

/** What a note is about. */
export const NOTE_ANCHORS = ['project', 'budget', 'elevation', 'option', 'work', 'artist'] as const
export type NoteAnchor = typeof NOTE_ANCHORS[number]

/** Whether a note may leave the studio. */
export const NOTE_SHARES = ['proposal', 'private'] as const
export type NoteShare = typeof NOTE_SHARES[number]

/**
 * The heading, and what is worth writing under it.
 *
 * `prompt` is the whole of the old role vocabulary, repurposed. It shows as
 * placeholder text in an empty note and as the hint under each heading, so
 * it is answering "what goes here?" at the moment that question is being
 * asked.
 */
export const ANCHOR_META: Record<NoteAnchor, {
  /** Heading on the screen. */
  label: string
  /** Referring to it mid-sentence: "nothing written about …". */
  inline: string
  prompt: string
}> = {
  project: {
    label: 'The project',
    inline: 'the project',
    prompt: 'What the job is, and who it is for. The building, the scope, the timeline. Who the client is — the organisation, the people, their taste, anything to be careful of. What they asked for, and what they ruled out.',
  },
  budget: {
    label: 'Budget',
    inline: 'the budget',
    prompt: 'The shape of the money rather than the figures — the ceiling, how it is structured, what is in and what is out, terms. Per-work pricing lives on the Budget screen.',
  },
  elevation: {
    label: 'Elevation',
    inline: 'this elevation',
    prompt: 'The space this wall is in. Light, how the room is used, traffic, ceiling height, what is already there, anything that constrains hanging.',
  },
  option: {
    label: 'Option',
    inline: 'this option',
    prompt: 'Why this arrangement — what it does for the room, and how it differs from the alternatives.',
  },
  work: {
    label: 'Work',
    inline: 'this work',
    prompt: 'Why this piece, and why here. Or why it was declined.',
  },
  artist: {
    label: 'Artist',
    inline: 'this artist',
    prompt: 'Why this artist for this client, and what the proposal should say about them.',
  },
}

/**
 * The standing note about an artist, which is a different question from the
 * one above: this is true of them wherever they hang, and carries into every
 * project.
 */
export const ARTIST_STANDING_PROMPT =
  'Who represents them, lead times, editions policy, your history with the gallery — anything true of this artist wherever they hang.'

export function isNoteAnchor(v: unknown): v is NoteAnchor {
  return typeof v === 'string' && (NOTE_ANCHORS as readonly string[]).includes(v)
}

export interface Note {
  id: string
  projectId: string
  anchor: NoteAnchor
  elevationId: string | null
  optionId: string | null
  workId: string | null
  artistId: string | null
  body: string
  share: NoteShare
  /**
   * The works this note is about, when it covers several. Set by picking
   * works and saying "note about these" — the set is made by pointing at
   * things rather than by ticking boxes inside a note.
   */
  workIds: string[]
  displayOrder: number
  updatedAt: string | null
}

/** Shape of a row as the database returns it. */
export interface NoteRow {
  id: string
  project_id: string
  anchor_type: string
  elevation_id: string | null
  option_id: string | null
  work_id: string | null
  artist_id: string | null
  body: string
  share: string
  display_order: number
  updated_at?: string | null
  note_works?: Array<{ work_id: string }> | null
}

/**
 * A row as the app uses it. An unrecognised anchor falls back rather than
 * being dropped: a note is text somebody wrote, and losing it silently would
 * be worse than filing it oddly.
 */
export function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    projectId: r.project_id,
    anchor: isNoteAnchor(r.anchor_type) ? r.anchor_type : 'project',
    elevationId: r.elevation_id,
    optionId: r.option_id,
    workId: r.work_id,
    artistId: r.artist_id,
    body: r.body ?? '',
    share: r.share === 'private' ? 'private' : 'proposal',
    workIds: (r.note_works ?? []).map(w => w.work_id),
    displayOrder: r.display_order ?? 0,
    updatedAt: r.updated_at ?? null,
  }
}

/** The columns a write sends. The work set is handled separately. */
export function noteRow(n: Omit<Note, 'id' | 'workIds' | 'updatedAt'>): Record<string, unknown> {
  return {
    project_id:    n.projectId,
    anchor_type:   n.anchor,
    elevation_id:  n.anchor === 'elevation' ? n.elevationId : null,
    option_id:     n.anchor === 'option'    ? n.optionId    : null,
    work_id:       n.anchor === 'work'      ? n.workId      : null,
    artist_id:     n.anchor === 'artist'    ? n.artistId    : null,
    body:          n.body,
    share:         n.share,
    display_order: n.displayOrder,
  }
}

/** Every note attached to one thing, in the order they were written. */
export function notesOn(
  notes: Note[],
  anchor: NoteAnchor,
  id: string | null = null,
): Note[] {
  return notes
    .filter(n => {
      if (n.anchor !== anchor) return false
      switch (anchor) {
        case 'project':
        case 'budget':    return true
        case 'elevation': return n.elevationId === id
        case 'option':    return n.optionId === id
        case 'work':      return n.workId === id
        case 'artist':    return n.artistId === id
      }
    })
    .sort((a, b) => a.displayOrder - b.displayOrder)
}

/**
 * The notes a thing's own panel shows: the ones anchored to it, less any
 * that were narrowed to a set of works.
 *
 * A note covering several works is anchored to their artist — or to the
 * project, when the works have no artist between them — and read on each
 * work it covers rather than again on the artist. This is that exclusion,
 * named once. It used to be written out at both call sites, and the bug it
 * caused was not that they disagreed but that they agreed: a set note was
 * excluded from its own panel, and shown on its works as a borrowed note
 * with no Remove, so no screen anywhere could delete it.
 *
 * Keep it paired with `notesMentioning`: between them every note has at
 * least one panel that shows it and can delete it. A test pins that.
 */
export function notesOwnedBy(
  notes: Note[],
  anchor: NoteAnchor,
  id: string | null = null,
): Note[] {
  return notesOn(notes, anchor, id).filter(n => n.workIds.length === 0)
}

/**
 * Notes that mention a work: the ones written on it, plus any note covering
 * a set it belongs to. A consignment note is about this work as much as one
 * written on it directly.
 */
export function notesMentioning(notes: Note[], workId: string): Note[] {
  return notes
    .filter(n => n.workId === workId || n.workIds.includes(workId))
    .sort((a, b) => a.displayOrder - b.displayOrder)
}

/**
 * What the export is allowed to see.
 *
 * Private notes are dropped here, once, rather than at each place the export
 * assembles a section — a filter that has to be remembered in six places is
 * a filter that will be forgotten in one. Empty notes go too: a note that
 * was opened and never written in should not become a blank heading in a
 * client proposal.
 */
export function notesForExport(notes: Note[]): Note[] {
  return notes.filter(n => n.share === 'proposal' && n.body.trim().length > 0)
}

/** How many notes here actually say something. */
export function writtenCount(notes: Note[]): number {
  return notes.filter(n => n.body.trim().length > 0).length
}

/**
 * "About 3 works" / "About Sprinters 1" — what a multi-work note covers,
 * named rather than counted where naming fits. A count alone gives no way to
 * tell two sets apart.
 */
export function workSetLabel(
  workIds: string[],
  nameOf: (id: string) => string | undefined,
): string {
  const names = workIds.map(nameOf).filter((n): n is string => !!n)
  if (names.length === 0) return ''
  if (names.length <= 2) return names.join(' and ')
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`
}
