/** POST { rule, why } — a preference the consultant said applies always, for approval. */
import { engineRoute, jsonBody } from '@/lib/proposals/engineRoute'
import { engineSuggest } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await jsonBody(request)
  return engineRoute(request, id, (db, proposal) => engineSuggest(db, proposal!, body.rule, body.why))
}
