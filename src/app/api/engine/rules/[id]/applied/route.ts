/** POST { commit } — the rule is in the design system at this commit. */
import { engineRoute, jsonBody } from '@/lib/proposals/engineRoute'
import { markRuleApplied } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await jsonBody(request)
  return engineRoute(request, null, db => markRuleApplied(db, id, body.commit))
}
