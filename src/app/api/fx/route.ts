/**
 * GET /api/fx — rates against the pound, for the studio's Budget page (042).
 *
 * The portal reads the rates on the server as it builds the page; the studio
 * is drawn in the browser, so it asks here. Rates are public information
 * and the answer is the same for everyone, so no sign-in is needed. See
 * src/lib/fx.ts for where it comes from.
 */
import { NextResponse } from 'next/server'
import { getRates } from '@/lib/fx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const rates = await getRates()
  if (!rates) return NextResponse.json({ error: 'No exchange rate is available' }, { status: 503 })
  return NextResponse.json(rates, { headers: { 'Cache-Control': 'private, max-age=600' } })
}
