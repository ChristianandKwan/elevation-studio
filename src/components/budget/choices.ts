/**
 * Budget choices: lines the client picks one alternative of, once for the
 * whole project (migration 041). Framing from two framers at three levels
 * each is the first; two shippers at different speeds the next.
 *
 * This module turns the choices into money the rest of the budget already
 * understands. A picked choice becomes a line on each work it prices, counted
 * like any of the work's own costs. An open one becomes a range: every figure
 * it touches has a lowest and a highest end, and both are an alternative the
 * client could really pick.
 *
 * Pure, so the arithmetic is tested without a screen (choices.test.ts).
 */

import type {
  BudgetChoice, BudgetChoiceAlternative, BudgetChoiceGroup, BudgetChoicePicks,
} from '@/types'
import {
  addBuckets, applyVat, bucketTotal, computeProjectTotals, emptyBucket,
} from './budgetCalc.ts'
import type {
  BudgetElevationData, ChoiceAmount, ChoiceLine, ProjectTotals, TotalsBucket,
} from './budgetCalc.ts'

// ── What is in play ───────────────────────────────────────────────────────────

/** The shape the in-play rules read. BudgetElevationData has it. */
export interface PlayElevation {
  clientPickedOption: string | null
  hiddenFromClient?: boolean
  options: ReadonlyArray<{ key: string; artworks: ReadonlyArray<{ workId: string; visible: boolean }> }>
}

/** The options the client could still end up with: the pick, or all of them. */
export function optionsInPlay<E extends PlayElevation>(elev: E): E['options'] {
  if (!elev.clientPickedOption) return elev.options
  return elev.options.filter(o => o.key === elev.clientPickedOption)
}

/**
 * Every work that could end up being bought: on an option still in play, on
 * a wall the client can see, and not hidden by the client. These are the
 * works an alternative needs a price for before the client is offered it.
 */
export function worksInPlay(elevations: readonly PlayElevation[]): Set<string> {
  const ids = new Set<string>()
  for (const elev of elevations) {
    if (elev.hiddenFromClient) continue
    for (const opt of optionsInPlay(elev)) {
      for (const a of opt.artworks) if (a.visible) ids.add(a.workId)
    }
  }
  return ids
}

// ── Alternatives ──────────────────────────────────────────────────────────────

export interface PlacedAlternative {
  group: BudgetChoiceGroup
  alt: BudgetChoiceAlternative
}

export function alternativesOf(choice: BudgetChoice): PlacedAlternative[] {
  return choice.groups.flatMap(group => group.alternatives.map(alt => ({ group, alt })))
}

function hasPrice(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * The works in play this alternative has no price for. A choice priced as one
 * figure reports `['whole']` until the figure is entered.
 */
export function missingPrices(
  choice: BudgetChoice, alt: BudgetChoiceAlternative, inPlay: ReadonlySet<string>,
): string[] {
  if (choice.pricing === 'whole') return hasPrice(alt.amount) ? [] : ['whole']
  return [...inPlay].filter(id => !hasPrice(alt.prices[id]))
}

/**
 * The alternatives the client may pick from: every one with a price for each
 * work in play. One with a price missing would show a total that is too low,
 * so it stays with C&K until it is filled in.
 */
export function offeredAlternatives(choice: BudgetChoice, inPlay: ReadonlySet<string>): PlacedAlternative[] {
  return alternativesOf(choice).filter(({ alt }) => missingPrices(choice, alt, inPlay).length === 0)
}

/** The picked alternative, or null while the choice is open (or its pick was deleted). */
export function pickedAlternative(choice: BudgetChoice, picks: BudgetChoicePicks): PlacedAlternative | null {
  const pick = picks[choice.id]
  if (!pick) return null
  return alternativesOf(choice).find(p => p.alt.id === pick.alternativeId) ?? null
}

/**
 * The choices the client sees, and so the only ones the totals count. The
 * consultant's figure and the client's are always the same number, as with
 * hidden elevations.
 */
export function clientChoices(
  choices: readonly BudgetChoice[], elevations: readonly PlayElevation[], picks: BudgetChoicePicks,
): BudgetChoice[] {
  const inPlay = worksInPlay(elevations)
  return choices.filter(c =>
    c.shownToClient && (pickedAlternative(c, picks) !== null || offeredAlternatives(c, inPlay).length > 0),
  )
}

/** "Framing · Conservation, Framer 1", for a work's line once picked. */
export function pickedLabel(choice: BudgetChoice, { group, alt }: PlacedAlternative): string {
  const what = [alt.name.trim() || 'Untitled', group.label.trim()].filter(Boolean).join(', ')
  return `${choice.name.trim() || 'Choice'} · ${what}`
}

// ── Money on the works ────────────────────────────────────────────────────────

/** For each open choice, the alternative to price it as. Used to try every combination. */
export type Scenario = Record<string, string>

/**
 * The elevations with each counted choice's cost written onto the works it
 * prices. A picked choice (or one the scenario settles) becomes a fixed line;
 * an open one carries each offered alternative's figure for the work.
 *
 * A price missing on a picked alternative counts as nothing, and the Budget
 * page tells the consultant. An open choice only ever offers alternatives
 * with every price in play, so its figures are whole.
 */
export function priceElevations(
  elevations: readonly BudgetElevationData[],
  choices: readonly BudgetChoice[],
  picks: BudgetChoicePicks,
  scenario: Scenario = {},
): BudgetElevationData[] {
  const perWork = choices.filter(c => c.pricing === 'per_work')
  if (perWork.length === 0) return [...elevations]
  const inPlay = worksInPlay(elevations)

  const settled = perWork.map(choice => {
    const fixed = pickedAlternative(choice, picks)
      ?? alternativesOf(choice).find(p => p.alt.id === scenario[choice.id])
      ?? null
    return { choice, fixed, offered: fixed ? [] : offeredAlternatives(choice, inPlay) }
  })

  return elevations.map(elev => ({
    ...elev,
    options: elev.options.map(opt => ({
      ...opt,
      artworks: opt.artworks.map(a => {
        const lines: ChoiceLine[] = []
        for (const { choice, fixed, offered } of settled) {
          if (fixed) {
            const amount = fixed.alt.prices[a.workId]
            if (!hasPrice(amount) || amount === 0) continue
            lines.push({
              choiceId: choice.id, kind: choice.kind, label: pickedLabel(choice, fixed),
              picked: { amount, vatApplies: fixed.alt.vatApplies },
            })
          } else {
            const open: ChoiceAmount[] = offered.map(({ alt }) => ({
              amount: hasPrice(alt.prices[a.workId]) ? alt.prices[a.workId] : 0,
              vatApplies: alt.vatApplies,
            }))
            if (!open.some(c => c.amount > 0)) continue
            lines.push({ choiceId: choice.id, kind: choice.kind, label: choice.name.trim() || 'Choice', open })
          }
        }
        return lines.length ? { ...a, choiceLines: lines } : a
      }),
    })),
  }))
}

/** The project-level money from choices priced as one figure, settled by pick or scenario. */
function wholeJobBucket(choices: readonly BudgetChoice[], picks: BudgetChoicePicks, scenario: Scenario): TotalsBucket {
  const bucket = emptyBucket()
  for (const choice of choices) {
    if (choice.pricing !== 'whole') continue
    const placed = pickedAlternative(choice, picks)
      ?? alternativesOf(choice).find(p => p.alt.id === scenario[choice.id])
    if (!placed || !hasPrice(placed.alt.amount)) continue
    const amount = Math.round(placed.alt.amount)
    if (choice.kind === 'framing') {
      if (placed.alt.vatApplies) bucket.framingVatable += amount
      else bucket.framingExempt += amount
    } else if (placed.alt.vatApplies) bucket.otherVatable += amount
    else bucket.otherExempt += amount
  }
  return bucket
}

// ── What one alternative costs ────────────────────────────────────────────────

/**
 * What picking this alternative would add, in the current view: for the
 * works on each wall's pick, or between the cheapest and dearest option
 * where a wall is still undecided.
 */
export function alternativeSpan(
  choice: BudgetChoice,
  alt: BudgetChoiceAlternative,
  elevations: readonly PlayElevation[],
  vatMode: boolean,
): { min: number; max: number } {
  if (choice.pricing === 'whole') {
    const v = hasPrice(alt.amount) ? applyVat(alt.amount, alt.vatApplies, vatMode) : 0
    return { min: v, max: v }
  }
  let min = 0, max = 0
  for (const elev of elevations) {
    if (elev.hiddenFromClient) continue
    const sums = optionsInPlay(elev).map(opt => opt.artworks
      .filter(a => a.visible)
      .reduce((s, a) => s + (hasPrice(alt.prices[a.workId]) ? applyVat(alt.prices[a.workId], alt.vatApplies, vatMode) : 0), 0))
    if (sums.length === 0) continue
    min += Math.min(...sums)
    max += Math.max(...sums)
  }
  return { min, max }
}

// ── Project totals ────────────────────────────────────────────────────────────

/** Beyond this many combinations, each open choice is tried at its two ends only. */
const MAX_SCENARIOS = 512

function scenariosFor(
  open: readonly BudgetChoice[],
  inPlay: ReadonlySet<string>,
  elevations: readonly PlayElevation[],
  vatMode: boolean,
): Scenario[] {
  let lists = open.map(c => offeredAlternatives(c, inPlay).map(p => p.alt))
  const count = lists.reduce((n, l) => n * Math.max(l.length, 1), 1)
  if (count > MAX_SCENARIOS) {
    lists = lists.map((alts, i) => {
      if (alts.length <= 2) return alts
      const spans = alts.map(alt => ({ alt, span: alternativeSpan(open[i], alt, elevations, vatMode) }))
      const cheapest = spans.reduce((a, b) => (b.span.min < a.span.min ? b : a))
      const dearest = spans.reduce((a, b) => (b.span.max > a.span.max ? b : a))
      return [...new Set([cheapest.alt, dearest.alt])]
    })
  }
  let out: Scenario[] = [{}]
  open.forEach((choice, i) => {
    if (lists[i].length === 0) return
    out = out.flatMap(s => lists[i].map(alt => ({ ...s, [choice.id]: alt.id })))
  })
  return out
}

/**
 * The project's totals with the choices counted.
 *
 * Picked choices count as picked. Open ones are tried at every alternative
 * on offer, together with every combination of the other open choices, and
 * `min` and `max` are the cheapest and dearest of those. Because a choice is
 * picked once for the whole project, the same alternative is used on every
 * wall in any one combination: the client cannot have one framer's prices
 * on one wall and the other's on the next.
 *
 * Pass the elevations the client sees: hidden ones stay out of every total.
 */
export function computeBudgetTotals(
  elevations: readonly BudgetElevationData[],
  choices: readonly BudgetChoice[],
  picks: BudgetChoicePicks,
  vatMode = false,
): ProjectTotals {
  const counted = clientChoices(choices, elevations, picks)
  const open = counted.filter(c => !pickedAlternative(c, picks))
  const inPlay = worksInPlay(elevations)

  let low: ProjectTotals | null = null
  let high: ProjectTotals | null = null
  let isRange = open.length > 0
  let hasFraming = false
  let hasOther = false

  for (const scenario of scenariosFor(open, inPlay, elevations, vatMode)) {
    const pt = computeProjectTotals(priceElevations(elevations, counted, picks, scenario), vatMode)
    const whole = wholeJobBucket(counted, picks, scenario)
    const t: ProjectTotals = {
      ...pt,
      min: addBuckets(pt.min, whole),
      max: addBuckets(pt.max, whole),
    }
    if (pt.isRange) isRange = true
    if (pt.hasFraming || whole.framingVatable + whole.framingExempt > 0) hasFraming = true
    if (pt.hasOther || whole.otherVatable + whole.otherExempt > 0) hasOther = true
    if (!low || bucketTotal(t.min, vatMode) < bucketTotal(low.min, vatMode)) low = t
    if (!high || bucketTotal(t.max, vatMode) > bucketTotal(high.max, vatMode)) high = t
  }

  return {
    min: low!.min,
    max: high!.max,
    isRange,
    hasFraming,
    hasOther,
  }
}

// ── Framing counted twice ─────────────────────────────────────────────────────

/**
 * Works in play that carry their own framing line while a framing choice is
 * counted. Their framing would be paid for twice. The Budget page names them
 * and offers to take the old lines off; nothing is removed without asking.
 */
export function doubleFramedWorks(
  elevations: readonly BudgetElevationData[],
  choices: readonly BudgetChoice[],
  picks: BudgetChoicePicks,
): Array<{ workId: string; name: string }> {
  const framingChoice = clientChoices(choices, elevations, picks)
    .some(c => c.kind === 'framing' && c.pricing === 'per_work')
  if (!framingChoice) return []
  const seen = new Map<string, string>()
  for (const elev of elevations) {
    if (elev.hiddenFromClient) continue
    for (const opt of optionsInPlay(elev)) {
      for (const a of opt.artworks) {
        if (!a.visible) continue
        if (a.subLineItems.some(i => i.kind === 'framing')) seen.set(a.workId, a.name)
      }
    }
  }
  return [...seen].map(([workId, name]) => ({ workId, name }))
}

// ── New pieces ────────────────────────────────────────────────────────────────

export function newAlternative(name = ''): BudgetChoiceAlternative {
  return { id: crypto.randomUUID(), name, description: '', vatApplies: true, prices: {}, amount: null }
}

export function newGroup(label: string): BudgetChoiceGroup {
  return { id: crypto.randomUUID(), label, internalNote: '', alternatives: [newAlternative()] }
}

/**
 * A fresh choice of the kind asked for. Framing is quoted per work, shipping
 * for the whole job; either can be switched in the editor.
 */
export function newChoice(kind: BudgetChoice['kind']): BudgetChoice {
  const name = kind === 'framing' ? 'Framing' : kind === 'shipping' ? 'Shipping' : ''
  const supplier = kind === 'framing' ? 'Framer 1' : kind === 'shipping' ? 'Shipper 1' : 'Supplier 1'
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    pricing: kind === 'framing' ? 'per_work' : 'whole',
    shownToClient: true,
    groups: [newGroup(supplier)],
  }
}

/** A choice row as stored, made safe to read: older or hand-edited rows may lack fields. */
export function readChoices(raw: unknown): BudgetChoice[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(c => c && typeof c === 'object' && typeof c.id === 'string').map(c => ({
    id: c.id,
    name: typeof c.name === 'string' ? c.name : '',
    kind: c.kind === 'framing' || c.kind === 'shipping' ? c.kind : 'other',
    pricing: c.pricing === 'whole' ? 'whole' : 'per_work',
    shownToClient: c.shownToClient !== false,
    groups: (Array.isArray(c.groups) ? c.groups : []).filter((g: unknown) => g && typeof g === 'object').map((g: Record<string, unknown>) => ({
      id: String(g.id ?? crypto.randomUUID()),
      label: typeof g.label === 'string' ? g.label : '',
      internalNote: typeof g.internalNote === 'string' ? g.internalNote : '',
      alternatives: (Array.isArray(g.alternatives) ? g.alternatives : []).filter((a: unknown) => a && typeof a === 'object').map((a: Record<string, unknown>) => ({
        id: String(a.id ?? crypto.randomUUID()),
        name: typeof a.name === 'string' ? a.name : '',
        description: typeof a.description === 'string' ? a.description : '',
        vatApplies: a.vatApplies !== false,
        prices: a.prices && typeof a.prices === 'object' ? a.prices as Record<string, number> : {},
        amount: hasPrice(a.amount as number) ? a.amount as number : null,
      })),
    })),
  }))
}

/**
 * The choices as the portal may receive them. Whatever the page is given
 * reaches the client's browser, so a hidden choice and C&K's own notes on a
 * supplier (the real firm, the quote reference) are taken out here, on the
 * server, rather than merely not drawn.
 */
export function choicesForClient(choices: readonly BudgetChoice[]): BudgetChoice[] {
  return choices
    .filter(c => c.shownToClient)
    .map(c => ({ ...c, groups: c.groups.map(g => ({ ...g, internalNote: '' })) }))
}

/** Pick rows (041) keyed by choice. */
export function readPicks(rows: ReadonlyArray<Record<string, unknown>> | null | undefined): BudgetChoicePicks {
  const picks: BudgetChoicePicks = {}
  for (const r of rows ?? []) {
    if (typeof r.choice_id !== 'string' || typeof r.alternative_id !== 'string') continue
    picks[r.choice_id] = {
      alternativeId: r.alternative_id,
      by: r.picked_by === 'us' ? 'us' : 'client',
      at: typeof r.picked_at === 'string' ? r.picked_at : '',
    }
  }
  return picks
}
