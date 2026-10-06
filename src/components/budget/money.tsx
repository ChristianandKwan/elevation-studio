'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { fmtMoney, fmtMoneyRange } from './currency'
import type { Currency } from '@/types'

/**
 * The currency the budget is drawn in, for every figure on it.
 *
 * The amounts are already in this currency by the time a component sees them
 * (currency.ts); this only says which symbol to print, and carries the
 * pounds-to-screen factor for the few figures worked out in pounds on the
 * spot (indicative installation, the client's budget). Outside a budget it is
 * pounds, which is what every figure there is.
 */
export interface Money {
  currency: Currency
  /** One pound in the currency on screen. */
  factor: number
  fmt: (n: number) => string
  fmtRange: (min: number, max: number) => string
}

function moneyFor(currency: Currency, factor: number): Money {
  return {
    currency,
    factor,
    fmt: n => fmtMoney(n, currency),
    fmtRange: (min, max) => fmtMoneyRange(min, max, currency),
  }
}

const MoneyContext = createContext<Money>(moneyFor('GBP', 1))

export function MoneyProvider({ currency, factor, children }: { currency: Currency; factor: number; children: ReactNode }) {
  return <MoneyContext.Provider value={moneyFor(currency, factor)}>{children}</MoneyContext.Provider>
}

export function useMoney(): Money {
  return useContext(MoneyContext)
}
