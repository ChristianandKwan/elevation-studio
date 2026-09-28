/** GET — a proposal sent to the client, for a run to look back over (040). */
import { engineReviewJob } from '@/lib/proposals/sends'
import { engineSendRoute } from '@/lib/proposals/sendRoute'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await ctx.params
  return engineSendRoute(request, sendId, (db, send) => engineReviewJob(db, send))
}
