/**
 * Currencies on the budget (currency.ts).
 *
 * Run with:  npm test
 *
 * The worked example is Nepean: works quoted by a US gallery in dollars,
 * framing quoted in pounds, a client who pays in dollars.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  artworkIn, budgetIn, choicesIn, elevationsIn, fmtMoney, fmtMoneyRange, fmtRate, quotedCurrencies, rateBetween,
  type FxRate,
} from './currency.ts'
import { bucketTotal, computeProjectTotals, installCostDisplay } from './budgetCalc.ts'
import type { BudgetArtwork, BudgetElevationData } from './budgetCalc.ts'
import type { BudgetChoice, ProjectBudget } from '@/types'

const RATES: FxRate = { perGbp: { USD: 1.3225, EUR: 1.15, JPY: 196.12 }, date: '2026-10-05', source: 'European Central Bank' }

function art(partial: Partial<BudgetArtwork> = {}): BudgetArtwork {
  return {
    id: 'p', workId: 'w', name: 'London', artist: 'Paula Scher', wCm: 100, hCm: 100, price: 0, visible: true,
    note: '', noteShownToClient: true, vatApplies: true, discountStatus: 'none', discountPercent: null,
    subLineItems: [], ...partial,
  }
}

function nepean(): BudgetElevationData[] {
  return [{ id: 'conf', name: 'Main Conference Room', clientPickedOption: 'B', options: [{
    key: 'B', label: 'B', title: 'Paula Scher 2', name: null, consultantNote: '', consultantNoteShownToClient: true,
    artworks: [
      art({ workId: 'london', price: 10000, priceCurrency: 'USD', subLineItems: [
        { id: 'f', label: 'Framing', kind: 'framing', mode: 'fixed', amount: 520, percent: 0, vatApplies: true },
      ] }),
      art({ workId: 'paris', price: 10000, priceCurrency: 'USD' }),
      art({ workId: 'rome', price: 10000, priceCurrency: 'USD' }),
    ],
  }] }]
}

describe('rates', () => {
  test('pounds to dollars, dollars to pounds, and across through the pound', () => {
    assert.equal(rateBetween('GBP', 'USD', RATES), 1.3225)
    assert.equal(rateBetween('USD', 'GBP', RATES), 1 / 1.3225)
    assert.equal(rateBetween('EUR', 'USD', RATES), 1.3225 / 1.15)
    assert.equal(rateBetween('USD', 'USD', null), 1)
  })

  test('no rate, no conversion: null, never a guess', () => {
    assert.equal(rateBetween('GBP', 'USD', null), null)
    assert.equal(rateBetween('GBP', 'CHF', RATES), null)
  })
})

describe('one work', () => {
  test('a dollar price shown in dollars is exactly what the gallery quoted', () => {
    const a = artworkIn(art({ price: 10000, priceCurrency: 'USD' }), 'USD', RATES)
    assert.equal(a.price, 10000)
    assert.equal(a.quotedPrice, undefined)
  })

  test('a dollar price shown in pounds is converted, and remembers the quote', () => {
    const a = artworkIn(art({ price: 10000, priceCurrency: 'USD' }), 'GBP', RATES)
    assert.equal(Math.round(a.price), 7561)
    assert.equal(a.quotedPrice, 10000)
  })

  test('its own fixed costs are pounds; a percentage follows the converted price', () => {
    const a = artworkIn(art({ price: 7200, subLineItems: [
      { id: 'f', label: 'Framing', kind: 'framing', mode: 'fixed', amount: 520, percent: 0, vatApplies: true },
      { id: 'd', label: 'Duty', kind: 'duty', mode: 'percent', amount: 0, percent: 5, vatApplies: false },
    ] }), 'USD', RATES)
    assert.equal(a.price, 7200 * 1.3225)
    assert.equal(a.subLineItems[0].amount, 520 * 1.3225)
    assert.equal(a.subLineItems[1].percent, 5)
  })

  test('no rate: the price counts as nothing and says so, rather than showing in the wrong currency', () => {
    const a = artworkIn(art({ price: 10000, priceCurrency: 'USD' }), 'GBP', null)
    assert.equal(a.price, 0)
    assert.equal(a.priceUnconverted, true)
  })
})

describe('the whole budget', () => {
  test('in dollars: the works add up to exactly what was quoted, framing converted', () => {
    const t = computeProjectTotals(elevationsIn(nepean(), 'USD', RATES))
    assert.equal(t.min.artVatable, 30000)
    assert.equal(t.min.framingVatable, Math.round(520 * 1.3225))
  })

  test('in pounds: the works converted, framing as quoted', () => {
    const t = computeProjectTotals(elevationsIn(nepean(), 'GBP', RATES))
    assert.equal(Math.round(t.min.artVatable), Math.round(30000 / 1.3225))
    assert.equal(t.min.framingVatable, 520)
    assert.equal(Math.round(bucketTotal(t.min, false)), Math.round(30000 / 1.3225) + 520)
  })

  test("the budget row's pound amounts move; a percentage fee does not", () => {
    const budget: ProjectBudget = {
      id: 'b', projectId: 'p',
      installation: { indicative: false, confirmedAmount: 300 },
      consultantFee: { mode: 'flat', amount: 1000, shownToClient: true },
      customLineItems: [{ id: 'c', name: 'Crating', amount: 200, vatApplies: true, shownToClient: true }],
      choices: [], choicePicks: {}, clientCurrency: 'USD', vatIncludedDefault: false, createdAt: '', updatedAt: '',
    }
    const usd = budgetIn(budget, 'USD', RATES)
    assert.equal(usd.installation.confirmedAmount, 300 * 1.3225)
    assert.equal(usd.consultantFee?.amount, 1000 * 1.3225)
    assert.equal(usd.customLineItems[0].amount, 200 * 1.3225)
    const pct = budgetIn({ ...budget, consultantFee: { mode: 'percentage', amount: 15, shownToClient: true } }, 'USD', RATES)
    assert.equal(pct.consultantFee?.amount, 15)
    assert.equal(budgetIn(budget, 'GBP', RATES), budget)
  })

  test('choices are priced in pounds and convert with everything else', () => {
    const c: BudgetChoice = {
      id: 'f', name: 'Framing', kind: 'framing', pricing: 'per_work', shownToClient: true,
      groups: [{ id: 'g', label: 'Framer 1', internalNote: '', alternatives: [
        { id: 'a', name: 'Museum', description: '', vatApplies: true, prices: { london: 800 }, amount: null },
      ] }],
    }
    const [usd] = choicesIn([c], 'USD', RATES)
    assert.equal(usd.groups[0].alternatives[0].prices.london, 800 * 1.3225)
  })

  test('indicative installation tiers move with the currency', () => {
    const d = installCostDisplay({ indicative: true, confirmedAmount: null }, 3, 3, 1.3225)
    assert.deepEqual([d.min, d.max], [Math.round(125 * 1.3225), Math.round(185 * 1.3225)])
  })

  test('which quoted currencies need a rate in the view on screen', () => {
    assert.deepEqual(quotedCurrencies(nepean(), 'GBP'), ['USD'])
    assert.deepEqual(quotedCurrencies(nepean(), 'USD'), [])
  })
})

describe('how it is written', () => {
  test('symbols tell the dollars and the yens apart', () => {
    assert.equal(fmtMoney(10000, 'USD'), '$10,000')
    assert.equal(fmtMoney(10000, 'HKD'), 'HK$10,000')
    assert.equal(fmtMoney(10000, 'CNY'), 'CN¥10,000')
    assert.equal(fmtMoney(10000, 'CHF'), 'CHF 10,000')
    assert.equal(fmtMoneyRange(1000, 1000, 'EUR'), '€1,000')
  })

  test('the rate line: four places for a dollar, two for a yen', () => {
    assert.equal(fmtRate(RATES, 'USD'), '£1 = $1.3225')
    assert.equal(fmtRate(RATES, 'JPY'), '£1 = ¥196.12')
  })
})
