import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  artistKey, canRenameTo, findArtistByName, nearDuplicateOf,
  rowToArtist, sortArtists, tidyArtistName, type Artist,
} from './artists.ts'

const artist = (id: string, name: string): Artist => ({
  id, name, nameKey: artistKey(name), note: '',
})

describe('artistKey', () => {
  test('case and spacing do not make a second artist', () => {
    // Both of these pairs are in the live data and are one artist each.
    assert.equal(artistKey('Paula Scher'), artistKey('Paula scher'))
    assert.equal(artistKey('Nathan'), artistKey('Nathan '))
  })

  test('runs of whitespace collapse', () => {
    assert.equal(artistKey('Agnes   Martin'), 'agnes martin')
    assert.equal(artistKey(' Agnes\tMartin '), 'agnes martin')
  })

  test('names that differ by more than spelling stay apart', () => {
    // 'Nathan' and 'Nathan I' may well be two people. Merging them is a
    // judgement for a consultant, not for a normalisation rule.
    assert.notEqual(artistKey('Nathan'), artistKey('Nathan I'))
  })

  test('nothing in, empty out', () => {
    assert.equal(artistKey(null), '')
    assert.equal(artistKey(undefined), '')
    assert.equal(artistKey('   '), '')
  })

  test('matches what migration 032 does in SQL', () => {
    // 032 defines artist_name_key() as
    //   lower(btrim(regexp_replace(name, '\\s+', ' ', 'g')))
    // These are the cases where a mismatch would let a duplicate through.
    const cases: Array<[string, string]> = [
      ['Julian Opie', 'julian opie'],
      ['  Julian   Opie  ', 'julian opie'],
      ['PAULA SCHER', 'paula scher'],
      ['Nathan ', 'nathan'],
      ['', ''],
    ]
    for (const [input, expected] of cases) {
      assert.equal(artistKey(input), expected, `artistKey(${JSON.stringify(input)})`)
    }
  })
})

describe('tidyArtistName', () => {
  test('keeps the capitals but fixes the spacing', () => {
    assert.equal(tidyArtistName('  Paula   Scher '), 'Paula Scher')
  })
})

describe('finding an artist', () => {
  const artists = [artist('a', 'Julian Opie'), artist('b', 'Paula Scher')]

  test('however it was spelled', () => {
    assert.equal(findArtistByName(artists, 'julian  OPIE')?.id, 'a')
  })

  test('an unknown name finds nobody', () => {
    assert.equal(findArtistByName(artists, 'Nobody At All'), undefined)
  })

  test('an empty name finds nobody rather than the first artist', () => {
    assert.equal(findArtistByName(artists, '   '), undefined)
  })
})

describe('catching a near-duplicate as it is typed', () => {
  const artists = [artist('b', 'Paula Scher')]

  test('different capitals is a near-miss worth warning about', () => {
    assert.equal(nearDuplicateOf(artists, 'Paula scher')?.id, 'b')
  })

  test('different spacing is not a warning — it tidies to the same name', () => {
    // Spacing is normalised on the way in, so "Paula  Scher" becomes exactly
    // the name already stored. There is nothing to ask about: it is that
    // artist. Only a difference that survives tidying, like capitals, is
    // worth stopping for.
    assert.equal(nearDuplicateOf(artists, 'Paula  Scher'), undefined)
    assert.equal(findArtistByName(artists, 'Paula  Scher')?.id, 'b')
  })

  test('the exact same spelling is not a warning', () => {
    assert.equal(nearDuplicateOf(artists, 'Paula Scher'), undefined)
  })

  test('a genuinely new artist is not a warning', () => {
    assert.equal(nearDuplicateOf(artists, 'Agnes Martin'), undefined)
  })
})

describe('renaming', () => {
  const artists = [artist('a', 'Julian Opie'), artist('b', 'Paula Scher')]

  test('a new spelling of the same artist is allowed', () => {
    // The whole point: Nathan → Nathan Isaac, notes and all.
    assert.deepEqual(canRenameTo(artists, 'a', 'Julian Opie RA'), { ok: true })
  })

  test('fixing your own capitals is allowed', () => {
    assert.deepEqual(canRenameTo(artists, 'b', 'Paula SCHER'), { ok: true })
  })

  test('taking another artist’s name is refused', () => {
    const r = canRenameTo(artists, 'a', 'paula scher')
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /already in the list/)
  })

  test('an empty name is refused', () => {
    const r = canRenameTo(artists, 'a', '   ')
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.reason, /needs a name/)
  })
})

describe('sorting', () => {
  test('alphabetical, ignoring case', () => {
    const list = [artist('c', 'paula scher'), artist('a', 'Agnes Martin'), artist('b', 'Julian Opie')]
    assert.deepEqual(sortArtists(list).map(a => a.id), ['a', 'b', 'c'])
  })

  test('does not mutate the list it was given', () => {
    const list = [artist('b', 'Zed'), artist('a', 'Alpha')]
    sortArtists(list)
    assert.deepEqual(list.map(a => a.id), ['b', 'a'])
  })
})

describe('rows', () => {
  test('a row with no note becomes an artist with an empty one', () => {
    const a = rowToArtist({ id: 'x', name: 'Agnes Martin', name_key: 'agnes martin', note: null })
    assert.equal(a.note, '')
  })
})
