/** POST { status: 'resting' | 'failed', error? } — the run has stopped, and why. */
import { engineRoute, jsonBody } from '@/lib/proposals/engineRoute'
import { engineStatus } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await jsonBody(request)
  return engineRoute(request, id, db => engineStatus(db, id, body.status, body.error))
}
