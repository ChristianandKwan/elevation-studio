/**
 * GET — what a run should be working from: the current version and the pack.
 * studio.mjs asks whenever messages arrive, so a Start again or a Refresh
 * figures made while it listened reaches it (see engineState).
 */
import { engineRoute } from '@/lib/proposals/engineRoute'
import { engineState } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return engineRoute(request, id, (db, proposal) => engineState(db, proposal!))
}
