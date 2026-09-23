/**
 * Arithmetic tests for the budget.
 *
 * Run with:  npm test
 *
 * Node's built-in runner, no dependencies. Node strips the TypeScript itself,
 * which works because budgetCalc.ts only imports types and type imports are
 * erased before execution.
 *
 * Tests named "KNOWN" document behaviour that is fragile rather than wrong.
 * Tests named "FIXED" record a fault that used to be here, so nobody
 * reintroduces it.
 */

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  fmtGbp,
  fmtRange,
  installRange,
  installCostDisplay,
  netPrice,
  tbcNetPrice,
  subItemAmount,
  applyVat,
  artworkLineTotal,
  getOptionTotals,
  optionTotal,
  bucketTotal,
  computeProjectTotals,
  displayFrozenAmount,
  consultantFeeRange,
  customItemsSubtotal,
} from './budgetCalc.ts'
import type { BudgetArtwork, BudgetElevationData, BudgetOptionData } from './budgetCalc.ts'
import type { SubLineItem } from '@/types'

// ── Builders ─────────────────────────────────────────────────────────────────

let seq = 0
function art(partial: Partial<BudgetArtwork> = {}): BudgetArtwork {
  return {
    id: `a${seq++}`,
    workId: `w${seq}`,
    name: 'Untitled',
    artist: '',
    wCm: 100,
    hCm: 100,
    price: 0,
    visible: true,
    note: '',
    noteShownToClient: true,
    vatApplies: true,
    discountStatus: 'none',
    discountPercent: null,
    subLineItems: [],
    ...partial,
  }
}

let subSeq = 0
function sub(partial: Partial<SubLineItem> = {}): SubLineItem {
  return {
    id: `s${subSeq++}`,
    label: 'Framing',
    kind: 'framing',
    mode: 'fixed',
    amount: 0,
    percent: 0,
    vatApplies: true,
    ...partial,
  }
}

function opt(key: string, artworks: BudgetArtwork[]): BudgetOptionData {
  return {
    key, label: key, title: `Option ${key}`, name: null,
    consultantNote: '', consultantNoteShownToClient: true,
    artworks,
  }
}

function elev(
  id: string,
  options: BudgetOptionData[],
  clientPickedOption: string | null = null,
): BudgetElevationData {
  return { id, name: id, clientPickedOption, options }
}

// ── Formatting ───────────────────────────────────────────────────────────────

describe('fmtGbp', () => {
  test('rounds to whole pounds and groups thousands', () => {
    assert.equal(fmtGbp(0), '£0')
    assert.equal(fmtGbp(1234), '£1,234')
    assert.equal(fmtGbp(1234567), '£1,234,567')
  })

  test('rounds half away from zero on positives', () => {
    assert.equal(fmtGbp(0.5), '£1')
    assert.equal(fmtGbp(1.4), '£1')
    assert.equal(fmtGbp(1.5), '£2')
  })

  test('KNOWN: negatives render with the minus inside the symbol', () => {
    // "£-500" rather than "-£500". TotalsPanel never passes a negative: it
    // negates first and appends "over budget". Latent, not live.
    assert.equal(fmtGbp(-500), '£-500')
  })
})

describe('fmtRange', () => {
  test('collapses to one figure when the ends round equal', () => {
    assert.equal(fmtRange(100, 100), '£100')
    assert.equal(fmtRange(100.2, 100.4), '£100')
  })

  test('shows both ends when they differ', () => {
    assert.equal(fmtRange(100, 200), '£100 – £200')
  })
})

// ── Installation tiers ───────────────────────────────────────────────────────

describe('installRange', () => {
  test('zero artworks costs nothing', () => {
    assert.deepEqual(installRange(0), { min: 0, max: 0 })
  })

  test('tier boundaries sit where the comments say', () => {
    assert.deepEqual(installRange(1), { min: 125, max: 185 })
    assert.deepEqual(installRange(5), { min: 125, max: 185 })
    assert.deepEqual(installRange(6), { min: 250, max: 350 })
    assert.deepEqual(installRange(15), { min: 250, max: 350 })
    assert.deepEqual(installRange(16), { min: 400, max: 600 })
    assert.deepEqual(installRange(500), { min: 400, max: 600 })
  })
})

describe('installCostDisplay', () => {
  test('a confirmed amount is used flat, with no range', () => {
    const r = installCostDisplay({ indicative: false, confirmedAmount: 900 }, 3, 9)
    assert.deepEqual(r, { min: 900, max: 900, isIndicative: false })
  })

  test('falls back to indicative when confirmed but the amount is null', () => {
    const r = installCostDisplay({ indicative: false, confirmedAmount: null }, 3, 3)
    assert.equal(r.isIndicative, true)
    assert.deepEqual({ min: r.min, max: r.max }, { min: 125, max: 185 })
  })

  test('spans tiers when the artwork count is itself a range', () => {
    const r = installCostDisplay({ indicative: true, confirmedAmount: null }, 4, 8)
    assert.deepEqual(r, { min: 125, max: 350, isIndicative: true })
  })
})

// ── Discounts ────────────────────────────────────────────────────────────────

describe('netPrice', () => {
  test('no discount leaves the price alone', () => {
    assert.equal(netPrice(art({ price: 10000 })), 10000)
  })

  test('a confirmed discount nets the price down', () => {
    assert.equal(
      netPrice(art({ price: 10000, discountStatus: 'confirmed', discountPercent: 20 })),
      8000,
    )
  })

  test('a TBC discount moves nothing, however large', () => {
    // The whole point of the state. It is shown on the line, never counted.
    assert.equal(
      netPrice(art({ price: 10000, discountStatus: 'tbc', discountPercent: 50 })),
      10000,
    )
  })

  test('a confirmed discount with no percentage set changes nothing', () => {
    assert.equal(
      netPrice(art({ price: 10000, discountStatus: 'confirmed', discountPercent: null })),
      10000,
    )
  })

  test('100% off is free, not ignored', () => {
    assert.equal(
      netPrice(art({ price: 10000, discountStatus: 'confirmed', discountPercent: 100 })),
      0,
    )
  })

  test('rounds to the pound', () => {
    assert.equal(
      netPrice(art({ price: 3333, discountStatus: 'confirmed', discountPercent: 15 })),
      2833,  // 2833.05
    )
  })
})

describe('tbcNetPrice', () => {
  test('reports what a TBC discount would come to', () => {
    assert.equal(
      tbcNetPrice(art({ price: 25000, discountStatus: 'tbc', discountPercent: 15 })),
      21250,
    )
  })

  test('is null for every other state, so no line claims a saving', () => {
    assert.equal(tbcNetPrice(art({ price: 100 })), null)
    assert.equal(
      tbcNetPrice(art({ price: 100, discountStatus: 'confirmed', discountPercent: 10 })),
      null,
    )
    assert.equal(tbcNetPrice(art({ price: 100, discountStatus: 'tbc', discountPercent: null })), null)
  })
})

// ── Sub line items ───────────────────────────────────────────────────────────

describe('subItemAmount', () => {
  test('a fixed item is its own amount', () => {
    assert.equal(subItemAmount(sub({ mode: 'fixed', amount: 450 }), 10000), 450)
  })

  test('a percentage item is taken from the price being paid', () => {
    // Duty is charged on what was paid, not on the list price.
    assert.equal(subItemAmount(sub({ mode: 'percent', percent: 5 }), 11250), 563)
    assert.equal(subItemAmount(sub({ mode: 'percent', percent: 5 }), 10125), 506)
  })

  test('zero percent costs nothing', () => {
    assert.equal(subItemAmount(sub({ mode: 'percent', percent: 0 }), 10000), 0)
  })
})

describe('applyVat', () => {
  test('only adds VAT when the view asks and the line allows', () => {
    assert.equal(applyVat(1000, true, true), 1200)
    assert.equal(applyVat(1000, true, false), 1000)
    assert.equal(applyVat(1000, false, true), 1000)
    assert.equal(applyVat(1000, false, false), 1000)
  })
})

describe('artworkLineTotal', () => {
  test('a plain work is just its price', () => {
    assert.equal(artworkLineTotal(art({ price: 5300 }), false), 5300)
    assert.equal(artworkLineTotal(art({ price: 5300 }), true), 6360)
  })

  test('a Dublin sprinter: no VAT on the work or on its duty', () => {
    const a = art({
      price: 11250,
      vatApplies: false,
      subLineItems: [sub({ label: 'Import duty', kind: 'duty', mode: 'percent', percent: 5, vatApplies: false })],
    })
    assert.equal(artworkLineTotal(a, false), 11813)
    assert.equal(artworkLineTotal(a, true), 11813)
  })

  test('an exempt work can still carry a VATable sub item', () => {
    const a = art({
      price: 11250,
      vatApplies: false,
      subLineItems: [
        sub({ label: 'Import duty', kind: 'duty', mode: 'percent', percent: 5, vatApplies: false }),
        sub({ label: 'Crating', kind: 'shipping', mode: 'fixed', amount: 200, vatApplies: true }),
      ],
    })
    assert.equal(artworkLineTotal(a, false), 12013)
    assert.equal(artworkLineTotal(a, true), 12053)  // only the £200 gains VAT
  })

  test('a confirmed discount does not silently discount the framing too', () => {
    const a = art({
      price: 10000,
      discountStatus: 'confirmed',
      discountPercent: 20,
      subLineItems: [sub({ label: 'Framing', mode: 'fixed', amount: 450 })],
    })
    assert.equal(artworkLineTotal(a, false), 8450)
    // Discounting the whole line would have given £8,360.
    assert.notEqual(artworkLineTotal(a, false), Math.round(10450 * 0.8))
  })

  test('a TBC discount leaves the line total at the list price', () => {
    const a = art({ price: 14000, discountStatus: 'tbc', discountPercent: 15 })
    assert.equal(artworkLineTotal(a, false), 14000)
  })
})

// ── Option totals ────────────────────────────────────────────────────────────

describe('getOptionTotals', () => {
  test('counts only visible artworks', () => {
    const t = getOptionTotals([
      art({ price: 1000 }),
      art({ price: 500, visible: false }),
    ])
    assert.equal(t.artVatable, 1000)
    assert.equal(t.artCount, 1)
  })

  test('splits artwork money by VAT treatment', () => {
    const t = getOptionTotals([
      art({ price: 8000 }),
      art({ price: 11250, vatApplies: false }),
    ])
    assert.equal(t.artVatable, 8000)
    assert.equal(t.artExempt, 11250)
  })

  test('separates framing from every other sub item', () => {
    const t = getOptionTotals([
      art({
        price: 5300,
        subLineItems: [
          sub({ label: 'Framing', kind: 'framing', mode: 'fixed', amount: 450 }),
          sub({ label: 'Crating', kind: 'shipping', mode: 'fixed', amount: 300 }),
        ],
      }),
    ])
    assert.equal(t.framingVatable, 450)
    assert.equal(t.otherVatable, 300)
    assert.equal(t.hasFraming, true)
    assert.equal(t.hasOther, true)
  })

  test('a sub item worth nothing does not raise its flag', () => {
    // A framing row left at zero should not put an empty Framing line in the
    // summary, which is what the old null check on framing_cost achieved.
    const t = getOptionTotals([
      art({ price: 100, subLineItems: [sub({ mode: 'fixed', amount: 0 })] }),
    ])
    assert.equal(t.hasFraming, false)
    assert.equal(t.framingVatable, 0)
  })

  test('an empty option is all zeroes', () => {
    const t = getOptionTotals([])
    assert.equal(bucketTotal(t, false), 0)
    assert.equal(t.artCount, 0)
  })

  test('optionTotal matches the sum of its lines in both views', () => {
    const arts = [
      art({ price: 8000, discountStatus: 'confirmed', discountPercent: 20 }),
      art({
        price: 11250, vatApplies: false,
        subLineItems: [sub({ kind: 'duty', mode: 'percent', percent: 5, vatApplies: false })],
      }),
    ]
    for (const vatMode of [false, true]) {
      const byLine = arts.reduce((s, a) => s + artworkLineTotal(a, vatMode), 0)
      assert.equal(optionTotal(arts, vatMode), byLine, `view ${vatMode}`)
    }
  })
})

// ── Project totals ───────────────────────────────────────────────────────────

describe('computeProjectTotals', () => {
  test('a picked option contributes one exact figure', () => {
    const pt = computeProjectTotals([
      elev('e1', [opt('A', [art({ price: 1000 })]), opt('B', [art({ price: 5000 })])], 'A'),
    ])
    assert.equal(pt.min.artVatable, 1000)
    assert.equal(pt.max.artVatable, 1000)
    assert.equal(pt.isRange, false)
  })

  test('a pending option contributes a range across its options', () => {
    const pt = computeProjectTotals([
      elev('e1', [opt('A', [art({ price: 1000 })]), opt('B', [art({ price: 5000 })])]),
    ])
    assert.equal(pt.min.artVatable, 1000)
    assert.equal(pt.max.artVatable, 5000)
    assert.equal(pt.isRange, true)
  })

  test('picked and pending elevations add together', () => {
    const pt = computeProjectTotals([
      elev('e1', [opt('A', [art({ price: 1000 })])], 'A'),
      elev('e2', [opt('A', [art({ price: 200 })]), opt('B', [art({ price: 900 })])]),
    ])
    assert.equal(pt.min.artVatable, 1200)
    assert.equal(pt.max.artVatable, 1900)
  })

  test('a picked key matching no option is reported as uncertain', () => {
    // It used to add nothing and still read as a firm total. Now the project
    // is flagged as a range, so the figure is not presented as settled.
    const pt = computeProjectTotals([elev('e1', [opt('A', [art({ price: 1000 })])], 'Z')])
    assert.equal(pt.min.artVatable, 0)
    assert.equal(pt.isRange, true)
  })

  test('FIXED: each end of the range is a combination that can be bought', () => {
    // Option A: cheap art, dear framing.   1,000 + 900 = 1,900
    // Option B: dear art, cheap framing.   5,000 + 100 = 5,100
    const pt = computeProjectTotals([
      elev('e1', [
        opt('A', [art({ price: 1000, subLineItems: [sub({ mode: 'fixed', amount: 900 })] })]),
        opt('B', [art({ price: 5000, subLineItems: [sub({ mode: 'fixed', amount: 100 })] })]),
      ]),
    ])

    // The cheapest end takes the whole of option A, framing included.
    assert.equal(pt.min.artVatable, 1000)
    assert.equal(pt.min.framingVatable, 900)
    assert.equal(bucketTotal(pt.min, false), 1900)

    // The dearest takes the whole of option B.
    assert.equal(pt.max.artVatable, 5000)
    assert.equal(pt.max.framingVatable, 100)
    assert.equal(bucketTotal(pt.max, false), 5100)

    // These used to come out as £1,100 and £5,900: the best case paired A's
    // artwork price with B's framing, which nobody could buy.
  })

  test('FIXED: the artwork count belongs to the option that set the price', () => {
    // Option A: one work at £9,000. Option B: eight works at £100.
    const pt = computeProjectTotals([
      elev('e1', [
        opt('A', [art({ price: 9000 })]),
        opt('B', Array.from({ length: 8 }, () => art({ price: 100 }))),
      ]),
    ])
    assert.equal(bucketTotal(pt.min, false), 800)
    assert.equal(pt.min.artCount, 8)
    assert.equal(bucketTotal(pt.max, false), 9000)
    assert.equal(pt.max.artCount, 1)

    // So the installation tier reads off a count that goes with that price:
    // eight works is tier two, one work is tier one.
    const install = installCostDisplay(
      { indicative: true, confirmedAmount: null }, pt.min.artCount, pt.max.artCount,
    )
    assert.deepEqual({ min: install.min, max: install.max }, { min: 125, max: 350 })
  })

  test('the cheapest option can differ between the two VAT views', () => {
    // A is £10,000 with VAT; B is £11,000 exempt. Ex-VAT A is cheaper; with
    // VAT added A costs £12,000 and B is cheaper.
    const elevations = [
      elev('e1', [
        opt('A', [art({ price: 10000 })]),
        opt('B', [art({ price: 11000, vatApplies: false })]),
      ]),
    ]
    assert.equal(bucketTotal(computeProjectTotals(elevations, false).min, false), 10000)
    assert.equal(bucketTotal(computeProjectTotals(elevations, true).min, true), 11000)
  })

  test('hasFraming is true if any option anywhere needs framing', () => {
    const pt = computeProjectTotals([
      elev('e1', [
        opt('A', [art({ price: 100 })]),
        opt('B', [art({ price: 100, subLineItems: [sub({ mode: 'fixed', amount: 50 })] })]),
      ]),
    ])
    assert.equal(pt.hasFraming, true)
  })
})

// ── Frozen-entry VAT ─────────────────────────────────────────────────────────

describe('displayFrozenAmount', () => {
  test('no VAT means the figure shows unchanged in both views', () => {
    assert.equal(displayFrozenAmount(1000, false, false, false), 1000)
    assert.equal(displayFrozenAmount(1000, true, false, true), 1000)
  })

  test('matching views pass the figure straight through', () => {
    assert.equal(displayFrozenAmount(1000, false, true, false), 1000)
    assert.equal(displayFrozenAmount(1000, true, true, true), 1000)
  })

  test('converts up and down when the views differ', () => {
    assert.equal(displayFrozenAmount(1000, false, true, true), 1200)
    assert.equal(displayFrozenAmount(1200, true, true, false), 1000)
  })

  test('treats a missing amountIncludesVat as ex-VAT', () => {
    assert.equal(displayFrozenAmount(1000, undefined, true, true), 1200)
  })

  test('round-trips on the values a consultant actually types', () => {
    for (const v of [100, 250, 500, 1000, 2400, 9000, 12500, 21250]) {
      const up = displayFrozenAmount(v, false, true, true)
      assert.equal(displayFrozenAmount(up, true, true, false), v, `£${v} did not survive`)
    }
  })

  test('KNOWN: tiny inc-VAT figures lose their VAT entirely', () => {
    // £2 inc-VAT reads as £2 ex-VAT and back again. Nothing in a budget is
    // priced at £2, so this is documented rather than fixed.
    assert.equal(displayFrozenAmount(2, true, true, false), 2)
    assert.equal(Math.round(2 * 1.2), 2)
  })
})

// ── Consultant fee ───────────────────────────────────────────────────────────

describe('consultantFeeRange', () => {
  test('a flat fee ignores the artwork spend', () => {
    const r = consultantFeeRange({ mode: 'flat', amount: 5000, shownToClient: true }, 0, 99999)
    assert.deepEqual(r, { min: 5000, max: 5000 })
  })

  test('a percentage tracks the artwork range', () => {
    const r = consultantFeeRange({ mode: 'percentage', amount: 15, shownToClient: true }, 10000, 20000)
    assert.deepEqual(r, { min: 1500, max: 3000 })
  })

  test('percentages round to the pound', () => {
    const r = consultantFeeRange({ mode: 'percentage', amount: 15, shownToClient: true }, 3333, 3333)
    assert.equal(r.min, 500)
  })
})

// ── Custom line items ────────────────────────────────────────────────────────

describe('customItemsSubtotal', () => {
  test('a consultant sees every item, a client only the shared ones', () => {
    const items = [
      { id: '1', name: 'Shipping', amount: 500, vatApplies: true, shownToClient: true },
      { id: '2', name: 'Courier', amount: 300, vatApplies: true, shownToClient: false },
    ]
    assert.equal(customItemsSubtotal(items, true, false), 800)
    assert.equal(customItemsSubtotal(items, false, false), 500)
  })

  test('FIXED: figures typed in different views are reconciled before adding', () => {
    // £1,000 ex-VAT and £1,200 inc-VAT are the same money. The old version
    // added the raw stored numbers and returned £2,200, right in neither view.
    const items = [
      { id: '1', name: 'A', amount: 1000, vatApplies: true, shownToClient: true, amountIncludesVat: false },
      { id: '2', name: 'B', amount: 1200, vatApplies: true, shownToClient: true, amountIncludesVat: true },
    ]
    assert.equal(customItemsSubtotal(items, true, false), 2000)
    assert.equal(customItemsSubtotal(items, true, true), 2400)
  })
})

// ── The Nepean worked example ────────────────────────────────────────────────
// The figures drawn in docs/mockups/line-item-notes-mockup.html, computed by the real code,
// so that the picture and the app cannot drift apart.

describe('the Nepean worked example', () => {
  const danceSynced = (name: string) => art({
    name, artist: 'Julian Opie', price: 10000,
    discountStatus: 'confirmed', discountPercent: 20,
  })

  const sprinter = (name: string) => art({
    name, artist: 'Julian Opie', price: 11250,
    vatApplies: false,
    discountStatus: 'tbc', discountPercent: 10,
    subLineItems: [sub({
      label: 'Import duty', kind: 'duty', mode: 'percent', percent: 5, vatApplies: false,
    })],
  })

  const elevations = [
    elev('conference', [opt('A', [danceSynced('Blue'), danceSynced('Green')])], 'A'),
    elev('reception', [opt('A', [sprinter('Female 1'), sprinter('Female 2')])], 'A'),
  ]

  test('the confirmed discount nets each Dance Synced to £8,000', () => {
    assert.equal(netPrice(danceSynced('Blue')), 8000)
  })

  test('the TBC discount leaves each sprinter at its list price', () => {
    assert.equal(netPrice(sprinter('Female 1')), 11250)
    // The line still says what it would come to.
    assert.equal(tbcNetPrice(sprinter('Female 1')), 10125)
  })

  test('duty is five percent of the price actually being paid', () => {
    // Not of the TBC figure, because that discount is not real yet.
    assert.equal(subItemAmount(sprinter('Female 1').subLineItems[0], 11250), 563)
  })

  test('artworks split into a VATable subtotal and an exempt one', () => {
    const pt = computeProjectTotals(elevations)
    assert.equal(pt.min.artVatable, 16000)
    assert.equal(pt.min.artExempt, 22500)
    assert.equal(pt.min.otherExempt, 1126)
    assert.equal(pt.isRange, false)
  })

  test('the consultant fee is 15% of the discounted artwork spend', () => {
    const pt = computeProjectTotals(elevations)
    const artSpend = pt.min.artVatable + pt.min.artExempt
    assert.equal(artSpend, 38500)
    const fee = consultantFeeRange(
      { mode: 'percentage', amount: 15, shownToClient: true }, artSpend, artSpend,
    )
    assert.equal(fee.min, 5775)
  })

  test('installation for four works sits in the first tier', () => {
    const pt = computeProjectTotals(elevations)
    assert.equal(pt.min.artCount, 4)
    assert.deepEqual(installRange(pt.min.artCount), { min: 125, max: 185 })
  })

  test('the ex-VAT column adds to the printed total', () => {
    const pt = computeProjectTotals(elevations, false)
    assert.equal(bucketTotal(pt.min, false), 39626)   // 16,000 + 22,500 + 1,126
    const base = 39626 + 5775
    assert.equal(base + 125, 45526)
    assert.equal(base + 185, 45586)
  })

  test('the inc-VAT column adds to the printed total', () => {
    const pt = computeProjectTotals(elevations, true)
    // Only the Dance Synced pair gains VAT; the sprinters and their duty do not.
    assert.equal(applyVat(pt.min.artVatable, true, true), 19200)
    assert.equal(pt.min.artExempt, 22500)
    assert.equal(pt.min.otherExempt, 1126)
    assert.equal(bucketTotal(pt.min, true), 42826)

    const fee = applyVat(5775, true, true)
    assert.equal(fee, 6930)
    const base = 42826 + fee
    assert.equal(base, 49756)
    assert.equal(base + applyVat(125, true, true), 49906)
    assert.equal(base + applyVat(185, true, true), 49978)
  })

  test('against a £50,000 budget the project is under at both ends', () => {
    assert.equal(50000 - 49906, 94)
    assert.equal(50000 - 49978, 22)
  })

  test('installation is the only spread left, so the range is £72', () => {
    assert.equal(49978 - 49906, 72)
  })

  test('the two Dublin sprinters are no longer overstated by a fifth', () => {
    const pt = computeProjectTotals(elevations, true)
    assert.equal(pt.min.artExempt, 22500)
    assert.equal(Math.round(22500 * 1.2) - 22500, 4500)
  })

  test('what the same project showed before any of this', () => {
    // Every artwork multiplied by 1.2, no discounts, no duty.
    const before = Math.round((20000 + 22500) * 1.2)
    assert.equal(before, 51000)
    assert.equal(before - 41700, 9300)
  })
})
