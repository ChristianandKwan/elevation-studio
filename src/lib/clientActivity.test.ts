import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildDigest, type DigestAction, type DigestElevation, type DigestProject } from './clientActivity.ts'

const project: DigestProject = { name: 'Nepean', clientName: 'Mr & Mrs Hamilton', status: 'sent' }
const url = 'https://studio.example/projects/p1'

function living(over: Partial<DigestElevation> = {}): DigestElevation {
  return {
    id: 'e1', name: 'Living Room', pickedOptionId: 'o2',
    options: [
      { id: 'o1', title: 'Option A', approved: false, clientNotes: '' },
      { id: 'o2', title: 'Option B', approved: false, clientNotes: '' },
    ],
    ...over,
  }
}

function act(kind: DigestAction['kind'], optionId: string | null, at = '2026-09-23T13:02:00Z', elevationId = 'e1'): DigestAction {
  return { kind, elevationId, optionId, createdAt: at }
}

describe('buildDigest', () => {
  test('one burst of a choice, an approval and a note is one email about all three', () => {
    const elev = living({
      options: [
        { id: 'o1', title: 'Option A', approved: false, clientNotes: '' },
        { id: 'o2', title: 'Option B', approved: true, clientNotes: 'Could the large one go higher?' },
      ],
    })
    const d = buildDigest(project, [elev], [
      act('pick', null, '2026-09-23T13:02:00Z'),
      act('note', 'o2', '2026-09-23T13:05:00Z'),
      act('approve', 'o2', '2026-09-23T13:09:00Z'),
    ], url)!
    assert.equal(d.subject, 'Nepean: 1 choice, 1 approval and 1 note from the client')
    assert.match(d.text, /Mr & Mrs Hamilton was in the Nepean proposal between 14:02 and 14:09\./)
    assert.match(d.text, /Chose Option B/)
    assert.match(d.text, /Approved Option B/)
    assert.match(d.text, /Left a note on Option B/)
    assert.match(d.text, /Could the large one go higher\?/)
    assert.match(d.text, new RegExp(url))
  })

  test('a note saved many times while typing is one note, as it reads now', () => {
    const elev = living({
      options: [
        { id: 'o1', title: 'Option A', approved: false, clientNotes: 'Love this one' },
        { id: 'o2', title: 'Option B', approved: false, clientNotes: '' },
      ],
    })
    const d = buildDigest(project, [elev], [
      act('note', 'o1'), act('note', 'o1'), act('note', 'o1'),
    ], url)!
    assert.equal(d.subject, 'Nepean: 1 note from the client')
    assert.equal(d.text.match(/Left a note/g)?.length, 1)
    assert.match(d.text, /Love this one/)
  })

  test('a choice made and then cleared says so, rather than reporting the first click', () => {
    const d = buildDigest(project, [living({ pickedOptionId: null })], [act('pick', null)], url)!
    assert.match(d.text, /Chose an option, then cleared the choice/)
  })

  test('an approval the consultant has since taken back is not reported as standing', () => {
    const d = buildDigest(project, [living()], [act('approve', 'o2')], url)!
    assert.match(d.text, /Approved Option B \(since withdrawn\)/)
  })

  test('a wall with one option is not given an option name the client never saw', () => {
    const elev: DigestElevation = {
      id: 'e1', name: 'Hall', pickedOptionId: null,
      options: [{ id: 'o1', title: 'Option A', approved: true, clientNotes: 'Perfect' }],
    }
    const d = buildDigest(project, [elev], [act('approve', 'o1'), act('note', 'o1')], url)!
    assert.doesNotMatch(d.text, /Option A/)
    assert.match(d.text, /• Approved\n/)
    assert.match(d.text, /• Left a note/)
  })

  test('an emptied note is reported as cleared', () => {
    const d = buildDigest(project, [living()], [act('note', 'o1')], url)!
    assert.match(d.text, /Cleared their note on Option A/)
  })

  test('walls follow the project order and each lists only its own actions', () => {
    const kitchen: DigestElevation = {
      id: 'e2', name: 'Kitchen', pickedOptionId: null,
      options: [{ id: 'k1', title: 'Option A', approved: true, clientNotes: '' }],
    }
    const d = buildDigest(project, [living(), kitchen], [
      act('approve', 'k1', '2026-09-23T13:00:00Z', 'e2'),
      act('pick', null, '2026-09-23T13:01:00Z', 'e1'),
    ], url)!
    assert.ok(d.text.indexOf('Living Room') < d.text.indexOf('Kitchen'))
    assert.equal(d.subject, 'Nepean: 1 choice and 1 approval from the client')
  })

  test('the last approval says the whole project is now approved', () => {
    const elev = living({ options: [{ id: 'o2', title: 'Option B', approved: true, clientNotes: '' }] })
    const d = buildDigest({ ...project, status: 'approved' }, [elev], [act('approve', 'o2')], url)!
    assert.match(d.text, /Every elevation is now approved\./)
  })

  test('a single moment is "at", not "between" the same time twice', () => {
    const d = buildDigest(project, [living()], [act('pick', null)], url)!
    assert.match(d.text, /proposal at 14:02\./)
  })

  test('an unnamed client is "the client", not "Unnamed client"', () => {
    const d = buildDigest({ ...project, clientName: 'Unnamed client' }, [living()], [act('pick', null)], url)!
    assert.match(d.text, /^The client was in/)
  })

  test('nothing to say about walls that are gone: no email', () => {
    assert.equal(buildDigest(project, [living()], [act('pick', null, undefined, 'gone')], url), null)
  })

  test('what the client typed cannot become markup in the email', () => {
    const elev = living({
      options: [{ id: 'o1', title: 'Option A', approved: false, clientNotes: '<a href="x">hi</a>' },
        { id: 'o2', title: 'Option B', approved: false, clientNotes: '' }],
    })
    const d = buildDigest(project, [elev], [act('note', 'o1')], url)!
    assert.doesNotMatch(d.html, /<a href="x">/)
    assert.match(d.html, /&lt;a href=&quot;x&quot;&gt;hi&lt;\/a&gt;/)
  })
})
