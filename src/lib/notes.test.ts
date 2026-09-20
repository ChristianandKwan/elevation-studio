import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  NOTE_ANCHORS, NOTE_ROLES, ROLE_META, ANCHOR_META,
  artistKey, defaultRoleFor, groupNotesByRole, noteLabel, noteRow,
  notesForExport, notesMentioning, notesOn, rolesFor, rowToNote,
  type Note, type NoteRow,
} from './notes.ts'

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1', projectId: 'p1', anchor: 'project',
    elevationId: null, optionId: null, workId: null, artistKey: null,
    role: 'rationale', body: 'because', share: 'proposal',
    workIds: [], displayOrder: 0, updatedAt: null,
    ...over,
  }
}

describe('the vocabulary', () => {
  test('every role and anchor has a label', () => {
    for (const r of NOTE_ROLES) assert.ok(ROLE_META[r]?.label, `${r} has no label`)
    for (const a of NOTE_ANCHORS) assert.ok(ANCHOR_META[a]?.label, `${a} has no label`)
  })

  test('every role carries a blurb — the picker is not self-explanatory', () => {
    // Sourcing vs logistics is exactly the distinction people file wrong.
    for (const r of NOTE_ROLES) assert.ok(ROLE_META[r].blurb.length > 10, `${r} blurb too thin`)
  })

  test('every anchor offers at least one role, and only real ones', () => {
    for (const a of NOTE_ANCHORS) {
      const roles = rolesFor(a)
      assert.ok(roles.length > 0, `${a} offers no roles`)
      for (const r of roles) assert.ok(NOTE_ROLES.includes(r), `${a} offers unknown role ${r}`)
      assert.ok(roles.includes(defaultRoleFor(a)), `${a}'s default is not among its roles`)
    }
  })

  test('brief and space are project-shaped, not work-shaped', () => {
    assert.ok(rolesFor('project').includes('brief'))
    assert.ok(!rolesFor('work').includes('brief'), 'a brief note on one work has nowhere to go')
    assert.ok(!rolesFor('artist').includes('space'))
  })

  test('sourcing is offered where an artist or a work is', () => {
    assert.ok(rolesFor('artist').includes('sourcing'))
    assert.ok(rolesFor('work').includes('sourcing'))
  })
})

describe('artistKey', () => {
  test('two spellings of one artist are one artist', () => {
    assert.equal(artistKey('Agnes Martin'), artistKey('agnes martin'))
    assert.equal(artistKey('  Agnes   Martin '), 'agnes martin')
  })

  test('nothing in, empty out', () => {
    assert.equal(artistKey(null), '')
    assert.equal(artistKey(undefined), '')
    assert.equal(artistKey('   '), '')
  })

  test('an empty key is falsy, which is what the screens guard on', () => {
    // Works with no artist group under a placeholder label in the index. The
    // key has to come from the artist field, not that label, or the
    // placeholder becomes an artist with notes and a standing profile.
    assert.ok(!artistKey(''), 'empty key must be falsy')
    assert.ok(artistKey('Unattributed'), 'a real artist of that name still keys')
  })
})

describe('rows in and out', () => {
  test('a row becomes a note', () => {
    const row: NoteRow = {
      id: 'n9', project_id: 'p1', anchor_type: 'artist',
      elevation_id: null, option_id: null, work_id: null, artist_key: 'agnes martin',
      role: 'sourcing', body: 'Represented by X', share: 'private',
      display_order: 2, updated_at: '2026-09-20T10:00:00Z',
      note_works: [{ work_id: 'w1' }, { work_id: 'w2' }],
    }
    const n = rowToNote(row)
    assert.equal(n.anchor, 'artist')
    assert.equal(n.role, 'sourcing')
    assert.equal(n.share, 'private')
    assert.deepEqual(n.workIds, ['w1', 'w2'])
  })

  test('an unrecognised role is filed oddly rather than lost', () => {
    // Somebody wrote this text. Dropping it silently would be worse.
    const n = rowToNote({
      id: 'n1', project_id: 'p1', anchor_type: 'nonsense',
      elevation_id: null, option_id: null, work_id: null, artist_key: null,
      role: 'gibberish', body: 'still text', share: 'whatever',
      display_order: 0,
    })
    assert.equal(n.body, 'still text')
    assert.equal(n.anchor, 'project')
    assert.equal(n.role, 'rationale')
    assert.equal(n.share, 'proposal')
  })

  test('writing a note clears the anchors it is not', () => {
    // A note that claims to be about an elevation while carrying a work id
    // is rejected by the constraint in 030; this is what keeps it from
    // getting that far.
    const row = noteRow({
      projectId: 'p1', anchor: 'option',
      elevationId: 'e1', optionId: 'o1', workId: 'w1', artistKey: 'someone',
      role: 'commercial', body: 'paired', share: 'proposal', displayOrder: 0,
    })
    assert.equal(row.option_id, 'o1')
    assert.equal(row.elevation_id, null)
    assert.equal(row.work_id, null)
    assert.equal(row.artist_key, null)
  })
})

describe('finding the notes on a thing', () => {
  const notes = [
    note({ id: 'a', anchor: 'option', optionId: 'o1', role: 'commercial' }),
    note({ id: 'b', anchor: 'option', optionId: 'o1', role: 'rationale' }),
    note({ id: 'c', anchor: 'option', optionId: 'o2', role: 'rationale' }),
    note({ id: 'd', anchor: 'work',   workId: 'w1',   role: 'sourcing' }),
    note({ id: 'e', anchor: 'project', role: 'brief' }),
  ]

  test('only the thing asked for', () => {
    assert.deepEqual(notesOn(notes, 'option', 'o1').map(n => n.id), ['b', 'a'])
    assert.deepEqual(notesOn(notes, 'option', 'o2').map(n => n.id), ['c'])
    assert.deepEqual(notesOn(notes, 'work', 'w1').map(n => n.id), ['d'])
    assert.deepEqual(notesOn(notes, 'project').map(n => n.id), ['e'])
  })

  test('they come back in the order a proposal reads', () => {
    // rationale before commercial, whatever order they were written in.
    assert.deepEqual(notesOn(notes, 'option', 'o1').map(n => n.role), ['rationale', 'commercial'])
  })

  test('an anchor with nothing on it is empty, not undefined', () => {
    assert.deepEqual(notesOn(notes, 'elevation', 'nope'), [])
  })
})

describe('a note narrowed to some of an artist’s works', () => {
  const consignment = note({
    id: 'set', anchor: 'artist', artistKey: 'agnes martin',
    role: 'sourcing', workIds: ['w1', 'w2'],
  })
  const onTheWork = note({ id: 'own', anchor: 'work', workId: 'w1', role: 'rationale' })
  const notes = [consignment, onTheWork]

  test('a work sees both its own note and the set it belongs to', () => {
    assert.deepEqual(notesMentioning(notes, 'w1').map(n => n.id), ['own', 'set'])
  })

  test('a work in the set but with no note of its own still sees the set', () => {
    assert.deepEqual(notesMentioning(notes, 'w2').map(n => n.id), ['set'])
  })

  test('a work outside the set sees nothing', () => {
    assert.deepEqual(notesMentioning(notes, 'w3'), [])
  })

  test('the set note is still an artist note', () => {
    assert.deepEqual(notesOn(notes, 'artist', 'agnes martin').map(n => n.id), ['set'])
  })
})

describe('what the export may see', () => {
  test('private notes never leave', () => {
    const notes = [
      note({ id: 'ok', share: 'proposal', body: 'for the client' }),
      note({ id: 'no', share: 'private', body: 'the gallery owes us one' }),
    ]
    assert.deepEqual(notesForExport(notes).map(n => n.id), ['ok'])
  })

  test('a note opened and never written in does not become a blank heading', () => {
    const notes = [note({ id: 'empty', body: '   ' }), note({ id: 'real', body: 'text' })]
    assert.deepEqual(notesForExport(notes).map(n => n.id), ['real'])
  })

  test('filtering happens once, so it cannot be forgotten in one of six places', () => {
    const notes = [note({ share: 'private', body: 'x' })]
    assert.equal(notesForExport(notes).length, 0)
    assert.equal(groupNotesByRole(notesForExport(notes)).length, 0)
  })
})

describe('grouping for the export', () => {
  test('roles come out in proposal order, empty ones left out', () => {
    const notes = [
      note({ id: 'c', role: 'commercial' }),
      note({ id: 'b', role: 'brief' }),
      note({ id: 'r', role: 'rationale' }),
    ]
    assert.deepEqual(groupNotesByRole(notes).map(g => g.role), ['brief', 'rationale', 'commercial'])
  })

  test('several notes in one role keep their own order', () => {
    const notes = [
      note({ id: 'second', role: 'brief', displayOrder: 1 }),
      note({ id: 'first', role: 'brief', displayOrder: 0 }),
    ]
    assert.deepEqual(groupNotesByRole(notes)[0].notes.map(n => n.id), ['first', 'second'])
  })
})

describe('the label', () => {
  test('says the role', () => {
    assert.equal(noteLabel(note({ role: 'sourcing' })), 'Sourcing')
  })

  test('says so when a note is private', () => {
    // It has to be visible at a glance which notes will not reach the client.
    assert.equal(noteLabel(note({ role: 'sourcing', share: 'private' })), 'Sourcing · private')
  })
})
