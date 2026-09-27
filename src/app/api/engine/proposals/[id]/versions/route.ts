/** POST { files } — open a new version; returns a signed upload link per file. */
import { engineRoute, jsonBody } from '@/lib/proposals/engineRoute'
import { engineOpenVersion } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await jsonBody(request)
  return engineRoute(request, id, db => engineOpenVersion(db, id, body.files))
}
