/** POST { rule, why } — a house-style rule the look back found, for C&K to decide on. */
import { jsonBody } from '@/lib/proposals/engineRoute'
import { engineReviewSuggest } from '@/lib/proposals/sends'
import { engineSendRoute } from '@/lib/proposals/sendRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await ctx.params
  const body = await jsonBody(request)
  return engineSendRoute(request, sendId, (db, send) => engineReviewSuggest(db, send, body.rule, body.why))
}
