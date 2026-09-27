/** POST { body, answering } — Claude's reply in the chat. */
import { engineRoute, jsonBody } from '@/lib/proposals/engineRoute'
import { engineReply } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await jsonBody(request)
  return engineRoute(request, id, db => engineReply(db, id, body.body, body.answering))
}
