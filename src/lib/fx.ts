/**
 * Rates against the pound, for budgets that show or are quoted in another
 * currency (042).
 *
 * Server only. The rate is the European Central Bank's daily reference rate,
 * published each working day at about 4pm in Frankfurt, read through
 * Frankfurter (frankfurter.dev): free, no key, and the same figure a bank
 * quotes as "mid-market". A budget's dollar figures are indicative until the
 * client pays, at whatever their bank's rate is that day, so a daily rate is
 * as exact as the page needs to be.
 *
 * Fetched at most once an hour per server (Next keeps the response), and the
 * last good rate is kept in `exchange_rates`, so a budget still opens if the
 * source cannot be reached. It then says which day its rate is from.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { CURRENCIES, type FxRate } from '@/components/budget/currency'
import type { Currency } from '@/types'

const SOURCE = 'European Central Bank'
const OTHERS: readonly Currency[] = CURRENCIES.filter(c => c !== 'GBP')
// Every currency in one answer, so one cached fetch serves every budget.
const URL = `https://api.frankfurter.dev/v1/latest?base=GBP&symbols=${OTHERS.join(',')}`

async function fetchLive(): Promise<FxRate | null> {
  try {
    const res = await fetch(URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    })
    if (!res.ok) return null
    const body = await res.json() as { date?: unknown; rates?: Record<string, unknown> }
    const date = typeof body.date === 'string' ? body.date : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    const perGbp: Partial<Record<Currency, number>> = {}
    for (const c of OTHERS) {
      const r = Number(body.rates?.[c])
      if (r > 0) perGbp[c] = r
    }
    if (Object.keys(perGbp).length === 0) return null
    return { perGbp, date, source: SOURCE }
  } catch {
    return null
  }
}

/** Rates against the pound: live if the source answers, else the last good ones, else null. */
export async function getRates(): Promise<FxRate | null> {
  const svc = createServiceClient()
  const live = await fetchLive()
  if (live) {
    // Best-effort: the rates are shown either way.
    const fetchedAt = new Date().toISOString()
    const { error } = await svc.from('exchange_rates').upsert(
      Object.entries(live.perGbp).map(([quote, rate]) => ({
        base: 'GBP', quote, rate, rate_date: live.date, fetched_at: fetchedAt,
      })),
      { onConflict: 'base,quote' },
    )
    if (error) console.warn('[fx] could not keep the rates:', error.message)
    return live
  }
  const { data } = await svc.from('exchange_rates').select('quote, rate, rate_date').eq('base', 'GBP')
  const perGbp: Partial<Record<Currency, number>> = {}
  let date = ''
  for (const row of data ?? []) {
    const r = Number(row.rate)
    if (!(r > 0) || !OTHERS.includes(row.quote as Currency)) continue
    perGbp[row.quote as Currency] = r
    // The oldest of them, so the page never claims a rate is newer than it is.
    if (typeof row.rate_date === 'string' && (!date || row.rate_date < date)) date = row.rate_date
  }
  if (!date || Object.keys(perGbp).length === 0) return null
  return { perGbp, date, source: SOURCE }
}
