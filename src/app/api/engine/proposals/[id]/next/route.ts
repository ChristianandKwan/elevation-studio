/**
 * GET ?wait=25 — the consultant's new messages, holding the request open for
 * up to 25 seconds until one arrives (the cloud's proxy cuts off at ~30).
 * The engine calls this in a loop while it waits, which is also how the
 * studio knows a run is still listening; it acknowledges what it receives
 * through /ack, so nothing is lost if a response is.
 */
import { engineRoute } from '@/lib/proposals/engineRoute'
import { engineNext } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'
export const maxDuration = 40

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const wait = Number(new URL(request.url).searchParams.get('wait') ?? 0)
  return engineRoute(request, id, async db => ({ messages: await engineNext(db, id, Number.isFinite(wait) ? wait : 0) }))
}
