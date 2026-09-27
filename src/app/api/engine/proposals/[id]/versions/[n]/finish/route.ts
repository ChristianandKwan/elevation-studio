/** POST { summary, answering, pageCount, warnings } — the files are up; show it. */
import { engineRoute, jsonBody } from '@/lib/proposals/engineRoute'
import { engineFinishVersion } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await ctx.params
  const body = await jsonBody(request)
  return engineRoute(request, id, db => engineFinishVersion(db, id, Number(n), body))
}
