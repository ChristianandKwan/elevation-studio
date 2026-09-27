import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { readBrief, defaultPages, defaultSubtitle, briefForEngine } from './brief.ts'
import { engineIsAlive, ENGINE_ALIVE_MS } from './fire.ts'
import { isVersionFile } from './bucket.ts'

describe('the brief', () => {
  test('a new client gets the intro pages and About Us; an existing one does not', () => {
    // The design system's own rule, now a default the consultant can change.
    assert.deepEqual(defaultPages('new'), {
      intro: true, aboutUs: true, notesAndBudget: true, wallSpecs: true, priceLists: true,
    })
    assert.equal(defaultPages('existing').aboutUs, false)
    assert.equal(defaultPages('existing').intro, false)
  })

  test('what the consultant ticked wins over the default', () => {
    const b = readBrief({ optionIds: ['o1'], clientType: 'existing', pages: { aboutUs: true } })
    assert.equal(b?.pages.aboutUs, true)
    assert.equal(b?.pages.intro, false)
  })

  test('a brief with no options is refused', () => {
    assert.equal(readBrief({ optionIds: [] }), null)
    assert.equal(readBrief({ optionIds: [3] }), null)
    assert.equal(readBrief(null), null)
  })

  test('the subtitle is C&K’s own date form', () => {
    assert.equal(defaultSubtitle(new Date(2026, 8, 17)), 'Curated Options | 17.9.26')
    assert.match(readBrief({ optionIds: ['o1'] })!.subtitle, /^Curated Options \| \d+\.\d+\.\d{2}$/)
  })

  test('free text is trimmed and capped', () => {
    const b = readBrief({ optionIds: ['o1'], instructions: '  ' + 'x'.repeat(5000) })
    assert.equal(b?.instructions.length, 2000)
  })

  test('the engine is told the cover by name, or to choose', () => {
    const b = readBrief({ optionIds: ['o1'], coverWorkId: 'w9' })!
    assert.deepEqual(briefForEngine(b, 'Dance Synced 5').cover, { work: 'Dance Synced 5' })
    assert.equal(briefForEngine({ ...b, coverWorkId: null }, null).cover, 'choose by the house rules')
  })
})

describe('whether a run already has the proposal', () => {
  const now = Date.parse('2026-09-27T12:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  test('a run started a minute ago is alive, even before it checks in', () => {
    // Building the first draft takes minutes, with no check-in; a message
    // sent then must not start a second run on the same proposal.
    assert.equal(engineIsAlive('queued', null, ago(60_000), now), true)
  })

  test('one heard from recently is alive', () => {
    assert.equal(engineIsAlive('ready', ago(30_000), ago(20 * 60_000), now), true)
  })

  test('one that has gone quiet, or said it is resting, is not', () => {
    assert.equal(engineIsAlive('ready', ago(ENGINE_ALIVE_MS + 1000), null, now), false)
    assert.equal(engineIsAlive('resting', ago(1000), null, now), false)
    assert.equal(engineIsAlive('failed', ago(1000), null, now), false)
  })
})

describe('what the engine may upload', () => {
  test('the proposal, its PDF and page pictures', () => {
    for (const ok of ['proposal.html', 'proposal.pdf', 'pages/page-01.png', 'pages/page-112.png']) {
      assert.equal(isVersionFile(ok), true, ok)
    }
  })

  test('and nothing else', () => {
    for (const bad of ['../pack.zip', 'pages/../../x.png', 'proposal.exe', 'pages/page-1.png', '/proposal.pdf']) {
      assert.equal(isVersionFile(bad), false, bad)
    }
  })
})

describe('the address the engine calls back', () => {
  const deployment = 'elevation-studio-b0p8xo6t5-christianandkwans-projects.vercel.app'
  const req = new Request(`https://${deployment}/api/proposals`, {
    // What Vercel actually sent on the second real run: the deployment, both ways.
    headers: { 'x-forwarded-host': deployment, host: deployment },
  })

  test('on the live site it is the studio’s own domain, whatever the request says', async () => {
    const { studioUrlFor } = await import('./fire.ts')
    assert.equal(studioUrlFor(req, { VERCEL_ENV: 'production' }), 'https://studio.christianandkwan.com')
  })

  test('PROPOSAL_STUDIO_URL wins over everything', async () => {
    const { studioUrlFor } = await import('./fire.ts')
    assert.equal(studioUrlFor(req, { VERCEL_ENV: 'production', PROPOSAL_STUDIO_URL: 'https://x.example/' }), 'https://x.example')
  })

  test('elsewhere, the host that was asked for', async () => {
    const { studioUrlFor } = await import('./fire.ts')
    assert.equal(studioUrlFor(req, {}), `https://${deployment}`)
  })
})
