/**
 * Where "Edit on budget" lands.
 *
 * A budget note is written only on the budget page, next to the figures it
 * talks about (Tom, 2026-09-28). The Index and the Notes screen list it and
 * jump here to change it. Pure, so it can be tested without a screen.
 */
import type { BudgetElevationData } from './budgetCalc'

/** A line on the budget: an option, and optionally one work's line inside it. */
export interface BudgetLine {
  elevationId: string
  optionKey: string
  workId?: string
}

/** A jump request. `nonce` makes a second jump to the same line fire again. */
export interface BudgetFocus extends BudgetLine {
  nonce: number
}

/**
 * Whether an option appears on the budget at all. Once the client has picked,
 * the budget shows only the picked option — for the consultant too.
 */
export function optionOnBudget(
  elevation: Pick<BudgetElevationData, 'clientPickedOption'>,
  optionKey: string,
): boolean {
  return !elevation.clientPickedOption || elevation.clientPickedOption === optionKey
}

/**
 * The first line on the budget that carries this work, in the budget's own
 * order. A work's note is one note shown on every line it hangs on, so any of
 * them edits it. Null when the work is on no line the budget shows.
 */
export function budgetLineForWork(
  elevations: Pick<BudgetElevationData, 'id' | 'clientPickedOption' | 'options'>[],
  workId: string,
): BudgetLine | null {
  for (const e of elevations) {
    for (const o of e.options) {
      if (!optionOnBudget(e, o.key)) continue
      if (o.artworks.some(a => a.workId === workId)) {
        return { elevationId: e.id, optionKey: o.key, workId }
      }
    }
  }
  return null
}

/** The attribute a budget option carries, so a jump can find it. */
export function budgetOptionAnchor(elevationId: string, optionKey: string): string {
  return `${elevationId}:${optionKey}`
}
