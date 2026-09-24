import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildDigest, type DigestAction, type DigestElevation, type DigestProject } from './clientActivity.ts'

const project: DigestProject = { name: 'Nepean', status: 'sent' }
const url = 'https://studio.example/projects/p1'

function living(over: Partial<DigestElevation> = {}): DigestElevation {
  return {
    id: 'e1', name: 'Living Room', pickedOptionId: 'o2',
    options: [
      { id: 'o1', title: 'Option A', approved: false },
      { id: 'o2', title: 'Option B', approved: false },
    ],
    ...over,
  }
}

function act(kind: DigestAction['kind'], optionId: string | null, at = '2026-09-23T13:02:00Z', elevationId = 'e1'): DigestAction {
  return { kind, elevationId, optionId, createdAt: at }
}

/** A message the client sent (038): the action carries its words. */
function said(optionId: string, message: string, at = '2026-09-23T13:02:00Z'): DigestAction {
  return { ...act('note', optionId, at), message }
}

describe('buildDigest', () => {
  test('one burst of a choice, an approval and a message is one email about all three', () => {
    const elev = living({
      options: [
        { id: 'o1', title: 'Option A', approved: false },
        { id: 'o2', title: 'Option B', approved: true },
      ],
    })
    const d = buildDigest(project, [elev], [
      act('pick', null, '2026-09-23T13:02:00Z'),
      said('o2', 'Could the large one go higher?', '2026-09-23T13:05:00Z'),
      act('approve', 'o2', '2026-09-23T13:09:00Z'),
    ], url)!
    assert.equal(d.subject, 'Nepean: 1 choice, 1 approval and 1 message from the client')
    assert.match(d.text, /^The client was active in the Nepean proposal between 14:02 and 14:09\./)
    assert.match(d.text, /Chose Option B/)
    assert.match(d.text, /Approved Option B/)
    assert.match(d.text, /Sent a message on Option B/)
    assert.match(d.text, /Could the large one go higher\?/)
    assert.match(d.text, new RegExp(url))
  })

  test('each message is quoted as sent, in the order sent', () => {
    const d = buildDigest(project, [living()], [
      said('o1', 'Second thought', '2026-09-23T13:04:00Z'),
      said('o1', 'Love this one', '2026-09-23T13:02:00Z'),
    ], url)!
    assert.equal(d.subject, 'Nepean: 2 messages from the client')
    assert.ok(d.text.indexOf('Love this one') < d.text.indexOf('Second thought'))
    assert.equal(d.text.match(/Sent a message on Option A/g)?.length, 2)
  })

  test('a note recorded before 038 is reported once per option, without words', () => {
    // The old box was recorded on every autosave, and its words are gone.
    const d = buildDigest(project, [living()], [act('note', 'o1'), act('note', 'o1'), act('note', 'o1')], url)!
    assert.equal(d.subject, 'Nepean: 1 message from the client')
    assert.equal(d.text.match(/Left a note on Option A/g)?.length, 1)
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
      options: [{ id: 'o1', title: 'Option A', approved: true }],
    }
    const d = buildDigest(project, [elev], [act('approve', 'o1'), said('o1', 'Perfect')], url)!
    assert.doesNotMatch(d.text, /Option A/)
    assert.match(d.text, /• Approved\n/)
    assert.match(d.text, /• Sent a message\n/)
  })

  test('walls follow the project order and each lists only its own actions', () => {
    const kitchen: DigestElevation = {
      id: 'e2', name: 'Kitchen', pickedOptionId: null,
      options: [{ id: 'k1', title: 'Option A', approved: true }],
    }
    const d = buildDigest(project, [living(), kitchen], [
      act('approve', 'k1', '2026-09-23T13:00:00Z', 'e2'),
      act('pick', null, '2026-09-23T13:01:00Z', 'e1'),
    ], url)!
    assert.ok(d.text.indexOf('Living Room') < d.text.indexOf('Kitchen'))
    assert.equal(d.subject, 'Nepean: 1 choice and 1 approval from the client')
  })

  test('the last approval says the whole project is now approved', () => {
    const elev = living({ options: [{ id: 'o2', title: 'Option B', approved: true }] })
    const d = buildDigest({ ...project, status: 'approved' }, [elev], [act('approve', 'o2')], url)!
    assert.match(d.text, /Every elevation is now approved\./)
  })

  test('a single moment is "at", not "between" the same time twice', () => {
    const d = buildDigest(project, [living()], [act('pick', null)], url)!
    assert.match(d.text, /proposal at 14:02\./)
  })

  test('the opening says "the client", which is singular however many people they are', () => {
    const d = buildDigest(project, [living()], [act('pick', null)], url)!
    assert.match(d.text.split('\n')[0], /^The client was active in the Nepean proposal/)
  })

  test('nothing to say about walls that are gone: no email', () => {
    assert.equal(buildDigest(project, [living()], [act('pick', null, undefined, 'gone')], url), null)
  })

  test('what the client typed cannot become markup in the email', () => {
    const d = buildDigest(project, [living()], [said('o1', '<a href="x">hi</a>')], url)!
    assert.doesNotMatch(d.html, /<a href="x">/)
    assert.match(d.html, /&lt;a href=&quot;x&quot;&gt;hi&lt;\/a&gt;/)
  })
})
