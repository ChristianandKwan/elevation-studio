/**
 * POST { decision: 'approve' | 'reject' } — decide on a house-style rule.
 * Any consultant may: the house style belongs to the practice (039). An
 * approved rule is written into the design system by the engine's next run.
 */
import { NextResponse } from 'next/server'
import { consultant } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await ctx.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const decision = body?.decision
  if (decision !== 'approve' && decision !== 'reject') {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }
  const who = await consultant()
  if (who instanceof NextResponse) return who
  const { data, error } = await who.db.from('house_style_rules').update({
    status: decision === 'approve' ? 'approved' : 'rejected',
    decided_by: who.name || 'a consultant',
    decided_at: new Date().toISOString(),
  }).eq('id', ruleId).eq('status', 'suggested').select('id, status').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'That rule has already been decided' }, { status: 409 })
  return NextResponse.json(data)
}
