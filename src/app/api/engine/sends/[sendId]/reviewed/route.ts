/** POST { lesson } — the look back is done; what this proposal teaches. */
import { jsonBody } from '@/lib/proposals/engineRoute'
import { engineReviewed } from '@/lib/proposals/sends'
import { engineSendRoute } from '@/lib/proposals/sendRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await ctx.params
  const body = await jsonBody(request)
  return engineSendRoute(request, sendId, (db, send) => engineReviewed(db, send, body.lesson))
}
