/** POST — a run has the job: the pack, the brief, the conversation, the version to edit. */
import { engineRoute } from '@/lib/proposals/engineRoute'
import { engineStart } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return engineRoute(request, id, (db, proposal) => engineStart(db, proposal!))
}
