/**
 * Notes, in one place.
 *
 * A note is one body of text with two independent properties: what it is
 * about (its anchor) and what it is for (its role). Keeping those apart is
 * the whole design. "Why this pair is discounted" and "why this pair suits
 * the room" are both notes on an option and differ only in their role; if
 * they were modelled as two kinds of note they would need two tables, two
 * editors, and would drift apart the way the frame colour table did.
 *
 * Nothing here talks to the database or the DOM, so `node --test` can run it
 * and every renderer can share it.
 */

/** What a note is about. */
export const NOTE_ANCHORS = ['project', 'elevation', 'option', 'work', 'artist'] as const
export type NoteAnchor = typeof NOTE_ANCHORS[number]

/** What a note is for. */
export const NOTE_ROLES = ['brief', 'space', 'rationale', 'sourcing', 'commercial', 'logistics'] as const
export type NoteRole = typeof NOTE_ROLES[number]

/** Whether a note may leave the studio. */
export const NOTE_SHARES = ['proposal', 'private'] as const
export type NoteShare = typeof NOTE_SHARES[number]

/**
 * The six roles, in the order a proposal reads. The blurb is what the
 * consultant sees under the label when choosing — these are guessable but
 * not obvious, and the difference between sourcing and logistics is exactly
 * the kind of thing that gets filed wrong without a prompt.
 */
export const ROLE_META: Record<NoteRole, { label: string; blurb: string }> = {
  brief: {
    label: 'Brief',
    blurb: 'What the client asked for, and what they ruled out.',
  },
  space: {
    label: 'The space',
    blurb: 'The building, the light, the room and how it is used.',
  },
  rationale: {
    label: 'Rationale',
    blurb: 'Why this work, why this wall — or why it was declined.',
  },
  sourcing: {
    label: 'Sourcing',
    blurb: 'Gallery, representation, availability, lead time, provenance.',
  },
  commercial: {
    label: 'Commercial',
    blurb: 'How a price is put together — pairing, conditions, what is included.',
  },
  logistics: {
    label: 'Logistics',
    blurb: 'Delivery, access, installation, insurance.',
  },
}

export const ANCHOR_META: Record<NoteAnchor, { label: string }> = {
  project: { label: 'the project' },
  elevation: { label: 'this elevation' },
  option: { label: 'this option' },
  work: { label: 'this work' },
  artist: { label: 'this artist' },
}

/**
 * Which roles are offered on which anchor.
 *
 * A brief note on a single work would be meaningless, and the export would
 * have nowhere to put it. The picker is narrowed rather than the database:
 * the constraint in 030 allows any pairing, so a role can be opened up later
 * without a migration.
 */
const ROLES_BY_ANCHOR: Record<NoteAnchor, readonly NoteRole[]> = {
  project:   ['brief', 'space', 'rationale', 'commercial', 'logistics'],
  elevation: ['space', 'rationale', 'logistics'],
  option:    ['rationale', 'commercial', 'logistics'],
  work:      ['rationale', 'sourcing', 'commercial', 'logistics'],
  artist:    ['sourcing', 'rationale', 'commercial', 'logistics'],
}

export function rolesFor(anchor: NoteAnchor): readonly NoteRole[] {
  return ROLES_BY_ANCHOR[anchor] ?? NOTE_ROLES
}

/** The role a new note on this anchor starts as — the commonest one there. */
export function defaultRoleFor(anchor: NoteAnchor): NoteRole {
  return rolesFor(anchor)[0]
}

export function isNoteRole(v: unknown): v is NoteRole {
  return typeof v === 'string' && (NOTE_ROLES as readonly string[]).includes(v)
}

export function isNoteAnchor(v: unknown): v is NoteAnchor {
  return typeof v === 'string' && (NOTE_ANCHORS as readonly string[]).includes(v)
}

/**
 * How an artist's name becomes a key.
 *
 * Artists are a text field on works, not a table, so "Agnes Martin",
 * "agnes martin" and "Agnes  Martin " have to resolve to one artist. This is
 * the same normalisation the artist picker already groups on; anything
 * writing artist_key or artist_profiles.name_key must go through it or the
 * unique constraint will let a second spelling in.
 */
export function artistKey(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export interface Note {
  id: string
  projectId: string
  anchor: NoteAnchor
  elevationId: string | null
  optionId: string | null
  workId: string | null
  artistKey: string | null
  role: NoteRole
  body: string
  share: NoteShare
  /** Works an artist note is narrowed to. Empty means the artist generally. */
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
  artist_key: string | null
  role: string
  body: string
  share: string
  display_order: number
  updated_at?: string | null
  note_works?: Array<{ work_id: string }> | null
}

/**
 * A row as the app uses it. Anything unrecognised falls back rather than
 * being dropped: a note whose role no longer exists is still text somebody
 * wrote, and losing it silently would be worse than filing it oddly.
 */
export function rowToNote(r: NoteRow): Note {
  return {
    id: r.id,
    projectId: r.project_id,
    anchor: isNoteAnchor(r.anchor_type) ? r.anchor_type : 'project',
    elevationId: r.elevation_id,
    optionId: r.option_id,
    workId: r.work_id,
    artistKey: r.artist_key,
    role: isNoteRole(r.role) ? r.role : 'rationale',
    body: r.body ?? '',
    share: r.share === 'private' ? 'private' : 'proposal',
    workIds: (r.note_works ?? []).map(w => w.work_id),
    displayOrder: r.display_order ?? 0,
    updatedAt: r.updated_at ?? null,
  }
}

/** The columns a write sends. The join table is handled separately. */
export function noteRow(n: Omit<Note, 'id' | 'workIds' | 'updatedAt'>): Record<string, unknown> {
  return {
    project_id:    n.projectId,
    anchor_type:   n.anchor,
    elevation_id:  n.anchor === 'elevation' ? n.elevationId : null,
    option_id:     n.anchor === 'option'    ? n.optionId    : null,
    work_id:       n.anchor === 'work'      ? n.workId      : null,
    artist_key:    n.anchor === 'artist'    ? n.artistKey   : null,
    role:          n.role,
    body:          n.body,
    share:         n.share,
    display_order: n.displayOrder,
  }
}

/** Every note attached to one thing, in the order they should read. */
export function notesOn(
  notes: Note[],
  anchor: NoteAnchor,
  id: string | null = null,
): Note[] {
  return notes
    .filter(n => {
      if (n.anchor !== anchor) return false
      switch (anchor) {
        case 'project':   return true
        case 'elevation': return n.elevationId === id
        case 'option':    return n.optionId === id
        case 'work':      return n.workId === id
        case 'artist':    return n.artistKey === id
      }
    })
    .sort(byRoleThenOrder)
}

/**
 * Notes that mention a work: the ones anchored to it, plus any artist note
 * narrowed to a set it belongs to. The work's own page wants both — the
 * consignment note is about this work as much as the note written on it.
 */
export function notesMentioning(notes: Note[], workId: string): Note[] {
  return notes
    .filter(n => n.workId === workId || n.workIds.includes(workId))
    .sort(byRoleThenOrder)
}

function byRoleThenOrder(a: Note, b: Note): number {
  const ra = NOTE_ROLES.indexOf(a.role)
  const rb = NOTE_ROLES.indexOf(b.role)
  if (ra !== rb) return ra - rb
  return a.displayOrder - b.displayOrder
}

/**
 * What the export is allowed to see.
 *
 * Private notes are dropped here, once, rather than at each place the export
 * assembles a section — a filter that has to be remembered in six places is
 * a filter that will be forgotten in one. Empty notes go too: a note the
 * consultant opened and never wrote in should not become a blank heading in
 * a client proposal.
 */
export function notesForExport(notes: Note[]): Note[] {
  return notes.filter(n => n.share === 'proposal' && n.body.trim().length > 0)
}

/** Grouped by role, roles in proposal order, empty roles left out. */
export function groupNotesByRole(notes: Note[]): Array<{ role: NoteRole; notes: Note[] }> {
  return NOTE_ROLES
    .map(role => ({ role, notes: notes.filter(n => n.role === role).sort((a, b) => a.displayOrder - b.displayOrder) }))
    .filter(g => g.notes.length > 0)
}

/** "Sourcing · private", for a note's header line. */
export function noteLabel(n: Note): string {
  const role = ROLE_META[n.role]?.label ?? n.role
  return n.share === 'private' ? `${role} · private` : role
}
