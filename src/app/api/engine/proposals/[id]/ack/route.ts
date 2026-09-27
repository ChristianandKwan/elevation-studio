/** POST { ids } — the engine has these messages; stop handing them over. */
import { engineRoute, jsonBody } from '@/lib/proposals/engineRoute'
import { engineAck } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await jsonBody(request)
  return engineRoute(request, id, db => engineAck(db, id, body.ids))
}
