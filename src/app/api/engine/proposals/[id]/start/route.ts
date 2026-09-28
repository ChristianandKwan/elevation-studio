/**
 * POST — a run has the job: the pack, the brief, the conversation, the version
 * to edit, and the latest proposals C&K sent to clients, as examples (040).
 */
import { engineRoute } from '@/lib/proposals/engineRoute'
import { engineStart } from '@/lib/proposals/store'
import { examplesForEngine } from '@/lib/proposals/sends'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return engineRoute(request, id, async (db, proposal) => {
    const job = await engineStart(db, proposal!)
    // An example that cannot be fetched is no reason to stop the proposal.
    const examples = await examplesForEngine(db, proposal!.id).catch(() => [])
    return { ...job, examples }
  })
}
