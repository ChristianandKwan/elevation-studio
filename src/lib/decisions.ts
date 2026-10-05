/**
 * What the client still has to decide, and whether the project is approved.
 *
 * A project is approved once every elevation the client can see has its
 * option approved and every budget choice they are offered is picked (041).
 * The portal's checklist, the lock on a choice and the server's
 * "project approved" all read this one rule, so they cannot disagree.
 *
 * Pure, so it is tested without a database (decisions.test.ts).
 */

import type { BudgetChoice, BudgetChoicePicks } from '@/types'
import { clientChoices, pickedAlternative, type PlayElevation } from '../components/budget/choices.ts'

export interface DecisionElevation extends PlayElevation {
  id: string
  name: string
  /** In display order. */
  options: ReadonlyArray<{
    key: string
    /** A photograph or a blank wall. An option with neither is not shown to the client. */
    hasWall?: boolean
    approved?: boolean
    artworks: ReadonlyArray<{ workId: string; visible: boolean }>
  }>
}

/** More than one option with a wall: the client must pick before approving. */
export function needsPick(elev: DecisionElevation): boolean {
  return elev.options.filter(o => o.hasWall).length > 1
}

/** The option the client is deciding on: their pick, or the only one there is. */
export function resolvedOption(elev: DecisionElevation): string | null {
  const withWalls = elev.options.filter(o => o.hasWall)
  if (withWalls.length > 1) return elev.clientPickedOption
  return elev.clientPickedOption ?? withWalls[0]?.key ?? null
}

export function elevationApproved(elev: DecisionElevation): boolean {
  const key = resolvedOption(elev)
  if (!key) return false
  return elev.options.find(o => o.key === key)?.approved ?? false
}

export interface Decision {
  kind: 'elevation' | 'choice'
  id: string
  name: string
  done: boolean
  /** What is left, in the client's words, while not done. */
  todo: 'choose' | 'approve'
}

/** Every decision the client has, walls first, in order. Pass only what the client can see. */
export function decisionsFor(
  elevations: readonly DecisionElevation[],
  choices: readonly BudgetChoice[],
  picks: BudgetChoicePicks,
): Decision[] {
  return [
    ...elevations.map<Decision>(e => ({
      kind: 'elevation',
      id: e.id,
      name: e.name,
      done: elevationApproved(e),
      todo: needsPick(e) && !e.clientPickedOption ? 'choose' : 'approve',
    })),
    ...clientChoices(choices, elevations, picks).map<Decision>(c => ({
      kind: 'choice',
      id: c.id,
      name: c.name.trim() || 'Choice',
      done: pickedAlternative(c, picks) !== null,
      todo: 'choose',
    })),
  ]
}

/**
 * Every decision made. A project with no elevations is never approved: there
 * is nothing yet to have said yes to.
 */
export function allDecided(
  elevations: readonly DecisionElevation[],
  choices: readonly BudgetChoice[],
  picks: BudgetChoicePicks,
): boolean {
  if (elevations.length === 0) return false
  return decisionsFor(elevations, choices, picks).every(d => d.done)
}
