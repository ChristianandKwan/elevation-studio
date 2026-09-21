import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  ANCHOR_META, ARTIST_STANDING_PROMPT, NOTE_ANCHORS,
  noteRow, notesForExport, notesMentioning, notesOn,
  rowToNote, workSetLabel, writtenCount,
  type Note, type NoteRow,
} from './notes.ts'

function note(over: Partial<Note> = {}): Note {
  return {
    id: 'n1', projectId: 'p1', anchor: 'project',
    elevationId: null, optionId: null, workId: null, artistId: null,
    body: 'because', share: 'proposal',
    workIds: [], displayOrder: 0, updatedAt: null,
    ...over,
  }
}

describe('the anchors', () => {
  test('every anchor has a heading, an inline name and a prompt', () => {
    for (const a of NOTE_ANCHORS) {
      assert.ok(ANCHOR_META[a]?.label, `${a} has no label`)
      assert.ok(ANCHOR_META[a]?.inline, `${a} has no inline name`)
      // The prompt is the whole of the old role vocabulary, repurposed: it
      // has to answer "what goes here?" on its own.
      assert.ok(ANCHOR_META[a].prompt.length > 40, `${a}'s prompt is too thin to replace a picker`)
    }
    assert.ok(ARTIST_STANDING_PROMPT.length > 40)
  })

  test('budget is project-scoped, like the project itself', () => {
    // Both carry no foreign key; the constraint in 031 enforces it.
    const row = noteRow({
      projectId: 'p1', anchor: 'budget',
      elevationId: 'e1', optionId: 'o1', workId: 'w1', artistId: 'artist-9',
      body: 'ceiling is 40k', share: 'proposal', displayOrder: 0,
    })
    assert.equal(row.anchor_type, 'budget')
    assert.equal(row.elevation_id, null)
    assert.equal(row.option_id, null)
    assert.equal(row.work_id, null)
    assert.equal(row.artist_id, null)
  })

  test('the budget prompt sends per-line pricing elsewhere', () => {
    // The distinction that would otherwise be got wrong: this is the shape of
    // the money, not the figures.
    assert.match(ANCHOR_META.budget.prompt, /Budget screen/)
  })

  test('the elevation prompt talks about the space', () => {
    // The label stays "Elevation" — it is the word the product is named for
    // and the one clients already see — while the prompt uses the natural
    // word, so precision labels and plain language explains.
    assert.equal(ANCHOR_META.elevation.label, 'Elevation')
    assert.match(ANCHOR_META.elevation.prompt, /space|room/i)
  })
})

describe('artists are anchored by id, not by name', () => {
  test('a note points at the artist row', () => {
    const row = noteRow({
      projectId: 'p1', anchor: 'artist',
      elevationId: null, optionId: null, workId: null, artistId: 'artist-1',
      body: 'Represented by X', share: 'proposal', displayOrder: 0,
    })
    assert.equal(row.artist_id, 'artist-1')
    assert.ok(!('artist_key' in row), 'artist_key was dropped in 032')
  })

  test('renaming an artist cannot orphan their notes', () => {
    // The whole reason 032 exists. The note refers to the artist's row, so
    // whatever that row is called today is irrelevant to finding it.
    const n = [note({ id: 'x', anchor: 'artist', artistId: 'artist-1' })]
    assert.deepEqual(notesOn(n, 'artist', 'artist-1').map(v => v.id), ['x'])
  })
})

describe('rows in and out', () => {
  test('a row becomes a note', () => {
    const row: NoteRow = {
      id: 'n9', project_id: 'p1', anchor_type: 'artist',
      elevation_id: null, option_id: null, work_id: null, artist_id: 'artist-1',
      body: 'Represented by X', share: 'private',
      display_order: 2, updated_at: '2026-09-20T10:00:00Z',
      note_works: [{ work_id: 'w1' }, { work_id: 'w2' }],
    }
    const n = rowToNote(row)
    assert.equal(n.anchor, 'artist')
    assert.equal(n.share, 'private')
    assert.deepEqual(n.workIds, ['w1', 'w2'])
  })

  test('an unrecognised anchor is filed oddly rather than lost', () => {
    const n = rowToNote({
      id: 'n1', project_id: 'p1', anchor_type: 'nonsense',
      elevation_id: null, option_id: null, work_id: null, artist_id: null,
      body: 'still text', share: 'whatever', display_order: 0,
    })
    assert.equal(n.body, 'still text')
    assert.equal(n.anchor, 'project')
    assert.equal(n.share, 'proposal')
  })

  test('writing a note clears the anchors it is not', () => {
    const row = noteRow({
      projectId: 'p1', anchor: 'option',
      elevationId: 'e1', optionId: 'o1', workId: 'w1', artistId: 'artist-9',
      body: 'paired', share: 'proposal', displayOrder: 0,
    })
    assert.equal(row.option_id, 'o1')
    assert.equal(row.elevation_id, null)
    assert.equal(row.work_id, null)
    assert.equal(row.artist_id, null)
  })

  test('a note carries no role any more', () => {
    const row = noteRow({
      projectId: 'p1', anchor: 'project',
      elevationId: null, optionId: null, workId: null, artistId: null,
      body: 'x', share: 'proposal', displayOrder: 0,
    })
    assert.ok(!('role' in row), 'role was dropped in 031 and must not be written')
  })
})

describe('finding the notes on a thing', () => {
  const notes = [
    note({ id: 'a', anchor: 'option', optionId: 'o1', displayOrder: 1 }),
    note({ id: 'b', anchor: 'option', optionId: 'o1', displayOrder: 0 }),
    note({ id: 'c', anchor: 'option', optionId: 'o2' }),
    note({ id: 'd', anchor: 'work', workId: 'w1' }),
    note({ id: 'e', anchor: 'project' }),
    note({ id: 'f', anchor: 'budget' }),
  ]

  test('only the thing asked for', () => {
    assert.deepEqual(notesOn(notes, 'option', 'o1').map(n => n.id), ['b', 'a'])
    assert.deepEqual(notesOn(notes, 'option', 'o2').map(n => n.id), ['c'])
    assert.deepEqual(notesOn(notes, 'work', 'w1').map(n => n.id), ['d'])
  })

  test('project and budget are separate sections, not one', () => {
    assert.deepEqual(notesOn(notes, 'project').map(n => n.id), ['e'])
    assert.deepEqual(notesOn(notes, 'budget').map(n => n.id), ['f'])
  })

  test('they come back in the order they were written', () => {
    assert.deepEqual(notesOn(notes, 'option', 'o1').map(n => n.displayOrder), [0, 1])
  })

  test('an anchor with nothing on it is empty, not undefined', () => {
    assert.deepEqual(notesOn(notes, 'elevation', 'nope'), [])
  })
})

describe('a note covering several works', () => {
  const consignment = note({
    id: 'set', anchor: 'artist', artistId: 'artist-1', workIds: ['w1', 'w2'],
  })
  const onTheWork = note({ id: 'own', anchor: 'work', workId: 'w1' })
  const aboutTheArtist = note({ id: 'artist', anchor: 'artist', artistId: 'artist-1' })
  const notes = [consignment, onTheWork, aboutTheArtist]

  test('a work sees both its own note and the set it belongs to', () => {
    assert.deepEqual(notesMentioning(notes, 'w1').sort((a, b) => a.id.localeCompare(b.id)).map(n => n.id), ['own', 'set'])
  })

  test('a work in the set but with no note of its own still sees the set', () => {
    assert.deepEqual(notesMentioning(notes, 'w2').map(n => n.id), ['set'])
  })

  test('a work outside the set sees nothing', () => {
    assert.deepEqual(notesMentioning(notes, 'w3'), [])
  })

  test('a general artist note is not pulled onto every work', () => {
    // It has no work set, so it belongs to the artist and is read there.
    assert.ok(!notesMentioning(notes, 'w1').some(n => n.id === 'artist'))
  })

  test('a set note is still an artist note', () => {
    assert.deepEqual(
      notesOn(notes, 'artist', 'artist-1').map(n => n.id).sort(),
      ['artist', 'set'],
    )
  })
})

describe('naming what a set covers', () => {
  const names: Record<string, string> = { w1: 'Sprinters 1', w2: 'Sprinters 2', w3: 'Sprinters 3', w4: 'Street 2' }
  const nameOf = (id: string) => names[id]

  test('two works are both named', () => {
    assert.equal(workSetLabel(['w1', 'w2'], nameOf), 'Sprinters 1 and Sprinters 2')
  })

  test('more than two name the first two and count the rest', () => {
    // A bare count gives no way to tell two sets apart at a glance.
    assert.equal(workSetLabel(['w1', 'w2', 'w3', 'w4'], nameOf), 'Sprinters 1, Sprinters 2 and 2 more')
  })

  test('a work that has since been deleted is skipped, not printed as undefined', () => {
    assert.equal(workSetLabel(['w1', 'gone'], nameOf), 'Sprinters 1')
  })

  test('nothing to name is empty', () => {
    assert.equal(workSetLabel([], nameOf), '')
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
})

describe('counting what is actually written', () => {
  test('blank notes are not counted', () => {
    assert.equal(writtenCount([note({ body: 'x' }), note({ body: '  ' }), note({ body: '' })]), 1)
  })
})
