/**
 * Budget choices: the arithmetic (choices.ts).
 *
 * Run with:  npm test
 *
 * The worked example is the mockup's: Nepean's three Paula Scher works at
 * £7,200 each, two framers with three alternatives apiece, installation
 * apart.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  alternativeSpan, choicesForClient, clientChoices, computeBudgetTotals, doubleFramedWorks,
  missingPrices, offeredAlternatives, priceElevations, readChoices, readPicks, worksInPlay,
} from './choices.ts'
import { bucketTotal, getOptionTotals, optionSpan } from './budgetCalc.ts'
import type { BudgetArtwork, BudgetElevationData, BudgetOptionData } from './budgetCalc.ts'
import type { BudgetChoice, BudgetChoiceAlternative, BudgetChoicePicks } from '@/types'

// ── Builders ─────────────────────────────────────────────────────────────────

function art(workId: string, price: number, partial: Partial<BudgetArtwork> = {}): BudgetArtwork {
  return {
    id: `p-${workId}-${Math.random()}`, workId, name: workId, artist: 'Paula Scher', wCm: 100, hCm: 100,
    price, visible: true, note: '', noteShownToClient: true, vatApplies: true,
    discountStatus: 'none', discountPercent: null, subLineItems: [], ...partial,
  }
}

function opt(key: string, artworks: BudgetArtwork[]): BudgetOptionData {
  return { key, label: key, title: `Option ${key}`, name: null, consultantNote: '', consultantNoteShownToClient: true, artworks }
}

function elev(id: string, picked: string | null, options: BudgetOptionData[], hidden = false): BudgetElevationData {
  return { id, name: id, clientPickedOption: picked, hiddenFromClient: hidden, options }
}

function alt(id: string, prices: Record<string, number>, partial: Partial<BudgetChoiceAlternative> = {}): BudgetChoiceAlternative {
  return { id, name: id, description: '', vatApplies: true, prices, amount: null, ...partial }
}

const LONDON = 'london', PARIS = 'paris', ROME = 'rome', BERLIN = 'berlin'

function framing(partial: Partial<BudgetChoice> = {}): BudgetChoice {
  return {
    id: 'framing', name: 'Framing', kind: 'framing', pricing: 'per_work', shownToClient: true,
    groups: [
      { id: 'f1', label: 'Framer 1', internalNote: 'Real firm, quote Q-2214', alternatives: [
        alt('f1a', { [LONDON]: 380, [PARIS]: 410, [ROME]: 405 }),
        alt('f1b', { [LONDON]: 520, [PARIS]: 560, [ROME]: 555 }),
        alt('f1c', { [LONDON]: 790, [PARIS]: 850, [ROME]: 840 }),
      ] },
      { id: 'f2', label: 'Framer 2', internalNote: '', alternatives: [
        alt('f2a', { [LONDON]: 340, [PARIS]: 365, [ROME]: 360 }),
        alt('f2b', { [LONDON]: 610, [PARIS]: 650, [ROME]: 645 }),
        alt('f2c', { [LONDON]: 960, [PARIS]: 1030, [ROME]: 1020 }),
      ] },
    ],
    ...partial,
  }
}

/** Nepean as it stands: the client picked option B, with three works. */
function nepean(): BudgetElevationData[] {
  return [elev('conference', 'B', [
    opt('A', [art(BERLIN, 9000)]),
    opt('B', [art(LONDON, 7200), art(PARIS, 7200), art(ROME, 7200)]),
  ])]
}

const NO_PICKS: BudgetChoicePicks = {}
const pick = (alternativeId: string): BudgetChoicePicks => ({ framing: { alternativeId, by: 'client', at: '2026-10-03T10:00:00Z' } })

// ── What is in play ──────────────────────────────────────────────────────────

describe('works in play', () => {
  test('a picked wall puts only its own works in play', () => {
    assert.deepEqual([...worksInPlay(nepean())].sort(), [LONDON, PARIS, ROME])
  })

  test('an undecided wall puts every option in play', () => {
    const e = nepean(); e[0].clientPickedOption = null
    assert.deepEqual([...worksInPlay(e)].sort(), [BERLIN, LONDON, PARIS, ROME])
  })

  test('hidden walls and works the client hid are not in play', () => {
    const e = [
      elev('shown', null, [opt('A', [art(LONDON, 1), art(PARIS, 1, { visible: false })])]),
      elev('hidden', null, [opt('A', [art(ROME, 1)])], true),
    ]
    assert.deepEqual([...worksInPlay(e)], [LONDON])
  })
})

describe('which alternatives are offered', () => {
  test('one with a price missing on a work in play is held back', () => {
    const c = framing()
    delete c.groups[1].alternatives[2].prices[ROME]
    const inPlay = worksInPlay(nepean())
    assert.deepEqual(missingPrices(c, c.groups[1].alternatives[2], inPlay), [ROME])
    assert.equal(offeredAlternatives(c, inPlay).length, 5)
  })

  test('a price missing on a work on an unpicked option does not matter', () => {
    // Berlin hangs only on option A, which the client did not pick.
    assert.equal(offeredAlternatives(framing(), worksInPlay(nepean())).length, 6)
  })

  test('a choice priced as one figure waits for the figure', () => {
    const c: BudgetChoice = { ...framing(), pricing: 'whole' }
    assert.deepEqual(missingPrices(c, c.groups[0].alternatives[0], new Set()), ['whole'])
  })

  test('a hidden choice, or one with nothing fully priced, is not the client\'s', () => {
    assert.equal(clientChoices([framing({ shownToClient: false })], nepean(), NO_PICKS).length, 0)
    const bare = framing()
    bare.groups.forEach(g => g.alternatives.forEach(a => { a.prices = {} }))
    assert.equal(clientChoices([bare], nepean(), NO_PICKS).length, 0)
  })

  test('a picked choice stays the client\'s even if a price later goes missing', () => {
    const c = framing()
    c.groups[0].alternatives.forEach(a => { delete a.prices[ROME] })
    c.groups[1].alternatives.forEach(a => { delete a.prices[ROME] })
    assert.equal(clientChoices([c], nepean(), pick('f1b')).length, 1)
  })
})

// ── Money ────────────────────────────────────────────────────────────────────

describe('totals', () => {
  test('open: From is the cheapest alternative, Up to the dearest', () => {
    const t = computeBudgetTotals(nepean(), [framing()], NO_PICKS)
    assert.equal(t.isRange, true)
    assert.equal(bucketTotal(t.min, false), 21600 + 1065)
    assert.equal(bucketTotal(t.max, false), 21600 + 3010)
    assert.equal(t.hasFraming, true)
  })

  test('picked: one figure, in the framing row', () => {
    const t = computeBudgetTotals(nepean(), [framing()], pick('f1b'))
    assert.equal(t.isRange, false)
    assert.equal(bucketTotal(t.min, false), 21600 + 1635)
    assert.equal(t.min.framingVatable, 1635)
  })

  test('a hidden choice is in nobody\'s total', () => {
    const t = computeBudgetTotals(nepean(), [framing({ shownToClient: false })], pick('f1b'))
    assert.equal(bucketTotal(t.min, false), 21600)
    assert.equal(t.isRange, false)
  })

  test('one alternative across every wall: never one framer here and the other there', () => {
    // Two walls, both undecided-free. Framer X is cheap on the first wall and
    // dear on the second; Y the reverse. The cheapest real pick is 150, not
    // the 100 that taking each wall's cheapest separately would claim.
    const e = [
      elev('one', null, [opt('A', [art('w1', 0)])]),
      elev('two', null, [opt('A', [art('w2', 0)])]),
    ]
    const c: BudgetChoice = {
      ...framing(), groups: [{ id: 'g', label: '', internalNote: '', alternatives: [
        alt('x', { w1: 50, w2: 100 }), alt('y', { w1: 100, w2: 50 }),
      ] }],
    }
    const t = computeBudgetTotals(e, [c], NO_PICKS)
    assert.equal(bucketTotal(t.min, false), 150)
    assert.equal(bucketTotal(t.max, false), 150)
  })

  test('an undecided wall and an open choice: each end is a combination the client could buy', () => {
    const e = nepean(); e[0].clientPickedOption = null
    const c = framing()
    c.groups.forEach(g => g.alternatives.forEach(a => { a.prices[BERLIN] = 300 }))
    const t = computeBudgetTotals(e, [c], NO_PICKS)
    // Cheapest: option A (Berlin 9,000) with 300 framing = 9,300.
    assert.equal(bucketTotal(t.min, false), 9300)
    // Dearest: option B with Framer 2's museum acrylic = 21,600 + 3,010.
    assert.equal(bucketTotal(t.max, false), 24610)
  })

  test('VAT follows each alternative', () => {
    const c = framing()
    c.groups[0].alternatives[1].vatApplies = false
    const t = computeBudgetTotals(nepean(), [c], pick('f1b'), true)
    assert.equal(t.min.framingExempt, 1635)
    assert.equal(bucketTotal(t.min, true), Math.round(21600 * 1.2) + 1635)
  })

  test('a choice priced as one figure joins the other costs', () => {
    const ship: BudgetChoice = {
      id: 'ship', name: 'Shipping', kind: 'shipping', pricing: 'whole', shownToClient: true,
      groups: [
        { id: 's1', label: 'Shipper 1', internalNote: '', alternatives: [alt('road', {}, { amount: 850 })] },
        { id: 's2', label: 'Shipper 2', internalNote: '', alternatives: [alt('van', {}, { amount: 1450 })] },
      ],
    }
    const open = computeBudgetTotals(nepean(), [ship], NO_PICKS)
    assert.equal(bucketTotal(open.min, false), 21600 + 850)
    assert.equal(bucketTotal(open.max, false), 21600 + 1450)
    assert.equal(open.hasOther, true)
    const picked = computeBudgetTotals(nepean(), [ship], { ship: { alternativeId: 'van', by: 'us', at: '' } })
    assert.equal(picked.min.otherVatable, 1450)
  })

  test('two open choices are tried together', () => {
    const ship: BudgetChoice = {
      id: 'ship', name: 'Shipping', kind: 'shipping', pricing: 'whole', shownToClient: true,
      groups: [{ id: 's', label: '', internalNote: '', alternatives: [alt('road', {}, { amount: 850 }), alt('van', {}, { amount: 1450 })] }],
    }
    const t = computeBudgetTotals(nepean(), [framing(), ship], NO_PICKS)
    assert.equal(bucketTotal(t.min, false), 21600 + 1065 + 850)
    assert.equal(bucketTotal(t.max, false), 21600 + 3010 + 1450)
  })
})

describe('on the works', () => {
  test('picked: each work carries the alternative\'s price, counted in its option', () => {
    const [e] = priceElevations(nepean(), [framing()], pick('f2c'))
    const b = e.options[1]
    assert.deepEqual(b.artworks[0].choiceLines?.[0].picked, { amount: 960, vatApplies: true })
    assert.equal(b.artworks[0].choiceLines?.[0].label, 'Framing · f2c, Framer 2')
    assert.equal(bucketTotal(getOptionTotals(b.artworks), false), 21600 + 3010)
  })

  test('open: the option shows a range, each end a whole alternative', () => {
    const [e] = priceElevations(nepean(), [framing()], NO_PICKS)
    const b = e.options[1]
    assert.equal(b.artworks[0].choiceLines?.[0].open?.length, 6)
    // Not counted until picked.
    assert.equal(bucketTotal(getOptionTotals(b.artworks), false), 21600)
    assert.deepEqual(optionSpan(b.artworks, false), { min: 21600 + 1065, max: 21600 + 3010 })
  })

  test('an alternative\'s own figure: for the works on each wall\'s pick', () => {
    const c = framing()
    assert.deepEqual(alternativeSpan(c, c.groups[0].alternatives[1], nepean(), false), { min: 1635, max: 1635 })
  })
})

describe('framing counted twice', () => {
  test('a work in play with its own framing line is named', () => {
    const e = nepean()
    e[0].options[1].artworks[0].subLineItems = [{ id: 's', label: 'Frame', kind: 'framing', mode: 'fixed', amount: 450, percent: 0, vatApplies: true }]
    assert.deepEqual(doubleFramedWorks(e, [framing()], NO_PICKS), [{ workId: LONDON, name: LONDON }])
  })

  test('not while the framing choice is hidden', () => {
    const e = nepean()
    e[0].options[1].artworks[0].subLineItems = [{ id: 's', label: 'Frame', kind: 'framing', mode: 'fixed', amount: 450, percent: 0, vatApplies: true }]
    assert.deepEqual(doubleFramedWorks(e, [framing({ shownToClient: false })], NO_PICKS), [])
  })
})

describe('reading and sending', () => {
  test('the portal is never sent a hidden choice or C&K\'s notes', () => {
    const sent = choicesForClient([framing(), { ...framing(), id: 'secret', shownToClient: false }])
    assert.deepEqual(sent.map(c => c.id), ['framing'])
    assert.equal(sent[0].groups[0].internalNote, '')
  })

  test('rows read safely, and picks key by choice', () => {
    assert.deepEqual(readChoices(null), [])
    const [c] = readChoices([{ id: 'x', groups: [{ id: 'g', alternatives: [{ id: 'a', prices: { w: 5 } }] }] }])
    assert.equal(c.pricing, 'per_work')
    assert.equal(c.shownToClient, true)
    assert.equal(c.groups[0].alternatives[0].amount, null)
    assert.deepEqual(readPicks([{ choice_id: 'x', alternative_id: 'a', picked_by: 'us', picked_at: 't' }]),
      { x: { alternativeId: 'a', by: 'us', at: 't' } })
  })
})
