/**
 * Currencies on the budget (042).
 *
 * A work's price is held in the currency it was quoted in; every other cost
 * is in pounds. To show the budget in one currency, every amount is moved
 * into that currency first and the budget's own arithmetic then runs
 * unchanged. Working in the currency on screen means the figures that were
 * quoted in it come out exact: a $10,000 work shows as $10,000 in dollars,
 * never as the $9,999 of a pound figure converted back.
 *
 * Pure, so it is tested without a screen (currency.test.ts).
 */

import type { BudgetChoice, Currency, ProjectBudget } from '@/types'
import type { BudgetArtwork, BudgetElevationData } from './budgetCalc.ts'
import { CURRENCY_CODES } from '../../lib/lineItems.ts'

/** The currencies, in the order a menu lists them. One list, kept with the code that reads them off a row. */
export const CURRENCIES: readonly Currency[] = CURRENCY_CODES

/**
 * How each is written. Dollars are plain "$", as a Nepean client reads them;
 * the others carry the short form that tells them apart (HK$, CA$, A$), and
 * yen and yuan, which share a sign, are told apart the same way.
 */
export const CURRENCY_META: Record<Currency, { symbol: string; name: string; inSentence: string }> = {
  GBP: { symbol: '£', name: 'Pounds', inSentence: 'pounds' },
  EUR: { symbol: '€', name: 'Euros', inSentence: 'euros' },
  USD: { symbol: '$', name: 'US dollars', inSentence: 'US dollars' },
  JPY: { symbol: '¥', name: 'Japanese yen', inSentence: 'Japanese yen' },
  CNY: { symbol: 'CN¥', name: 'Chinese yuan', inSentence: 'Chinese yuan' },
  HKD: { symbol: 'HK$', name: 'Hong Kong dollars', inSentence: 'Hong Kong dollars' },
  CHF: { symbol: 'CHF ', name: 'Swiss francs', inSentence: 'Swiss francs' },
  CAD: { symbol: 'CA$', name: 'Canadian dollars', inSentence: 'Canadian dollars' },
  AUD: { symbol: 'A$', name: 'Australian dollars', inSentence: 'Australian dollars' },
}

export interface FxRate {
  /** Units of each currency to one pound. Pounds themselves are always 1. */
  perGbp: Partial<Record<Currency, number>>
  /** The day the source published them for, YYYY-MM-DD. */
  date: string
  /** Who publishes them, for the line under the totals. */
  source: string
}

/**
 * What one unit of `from` is worth in `to`, or null when that needs a rate
 * and there is none.
 */
export function rateBetween(from: Currency, to: Currency, rate: FxRate | null): number | null {
  if (from === to) return 1
  const perGbp = (c: Currency) => (c === 'GBP' ? 1 : rate?.perGbp[c])
  const f = perGbp(from), t = perGbp(to)
  if (!(f && f > 0) || !(t && t > 0)) return null
  return t / f
}

/** "£1,234", "$1,234", "CHF 1,234". Whole units: the budget never shows pence or cents. */
export function fmtMoney(n: number, currency: Currency): string {
  return CURRENCY_META[currency].symbol + Math.round(n).toLocaleString('en-GB')
}

export function fmtMoneyRange(min: number, max: number, currency: Currency): string {
  if (Math.round(min) === Math.round(max)) return fmtMoney(min, currency)
  return `${fmtMoney(min, currency)} – ${fmtMoney(max, currency)}`
}

/** "5 Oct 2026". */
export function fmtRateDate(date: string): string {
  const t = Date.parse(`${date}T12:00:00Z`)
  if (Number.isNaN(t)) return date
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(t)
}

/** "£1 = $1.3225", "£1 = ¥196.12": four significant decimals for the small units, two for the large. */
export function fmtRate(rate: FxRate, currency: Currency): string {
  const r = rateBetween('GBP', currency, rate)
  if (r == null) return ''
  const digits = r >= 20 ? 2 : 4
  return `£1 = ${CURRENCY_META[currency].symbol}${r.toFixed(digits)}`
}

// ── Moving the budget into one currency ───────────────────────────────────────

/**
 * One work in the view's currency. Its own fixed costs (framing, duty) are in
 * pounds; a percentage cost follows the converted price by itself.
 *
 * `quotedPrice` keeps the price as quoted when it was converted, so the line
 * can say so and the editor edits what the gallery gave rather than a
 * converted figure. A price that cannot be converted for want of a rate
 * counts as nothing and is marked, rather than being shown in the wrong
 * currency.
 */
export function artworkIn(a: BudgetArtwork, view: Currency, rate: FxRate | null): BudgetArtwork {
  const from = a.priceCurrency ?? 'GBP'
  const priceRate = rateBetween(from, view, rate)
  const poundRate = rateBetween('GBP', view, rate) ?? 0
  return {
    ...a,
    price: priceRate == null ? 0 : a.price * priceRate,
    ...(from !== view ? { quotedPrice: a.price } : {}),
    ...(priceRate == null ? { priceUnconverted: true } : {}),
    subLineItems: poundRate === 1
      ? a.subLineItems
      : a.subLineItems.map(i => (i.mode === 'fixed' ? { ...i, amount: i.amount * poundRate } : i)),
  }
}

export function elevationsIn(
  elevations: readonly BudgetElevationData[], view: Currency, rate: FxRate | null,
): BudgetElevationData[] {
  return elevations.map(e => ({
    ...e,
    options: e.options.map(o => ({ ...o, artworks: o.artworks.map(a => artworkIn(a, view, rate)) })),
  }))
}

/** Choices are priced in pounds. */
export function choicesIn(choices: readonly BudgetChoice[], view: Currency, rate: FxRate | null): BudgetChoice[] {
  const r = rateBetween('GBP', view, rate)
  if (r === 1 || r == null) return [...choices]
  return choices.map(c => ({
    ...c,
    groups: c.groups.map(g => ({
      ...g,
      alternatives: g.alternatives.map(alt => ({
        ...alt,
        prices: Object.fromEntries(Object.entries(alt.prices).map(([k, v]) => [k, v * r])),
        amount: alt.amount == null ? null : alt.amount * r,
      })),
    })),
  }))
}

/**
 * The budget row's own money, all in pounds: a confirmed installation, a
 * flat fee, the custom lines. Indicative installation is a pound range
 * worked out later; it takes the same factor where it is drawn.
 */
export function budgetIn(budget: ProjectBudget, view: Currency, rate: FxRate | null): ProjectBudget {
  const r = rateBetween('GBP', view, rate)
  if (r === 1 || r == null) return budget
  return {
    ...budget,
    installation: {
      ...budget.installation,
      confirmedAmount: budget.installation.confirmedAmount == null ? null : budget.installation.confirmedAmount * r,
    },
    consultantFee: budget.consultantFee && budget.consultantFee.mode === 'flat'
      ? { ...budget.consultantFee, amount: budget.consultantFee.amount * r }
      : budget.consultantFee,
    customLineItems: budget.customLineItems.map(i => ({ ...i, amount: i.amount * r })),
    choices: choicesIn(budget.choices, view, rate),
  }
}

/** The currencies works are quoted in other than `view`: the budget needs a rate for each. */
export function quotedCurrencies(elevations: readonly BudgetElevationData[], view: Currency): Currency[] {
  const seen = new Set<Currency>()
  for (const e of elevations) for (const o of e.options) for (const a of o.artworks) {
    const c = a.priceCurrency ?? 'GBP'
    if (c !== view) seen.add(c)
  }
  return [...seen]
}
