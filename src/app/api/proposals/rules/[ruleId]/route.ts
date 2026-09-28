/**
 * POST { decision?: 'approve' | 'reject' | 'retire' | 'restore', rule?: string }
 * — decide on a house-style rule, reword it, or stop using it. Any
 * consultant may: the house style belongs to the practice. An approved rule
 * is in force from the engine's next run; it reads them from here (040).
 */
import { NextResponse } from 'next/server'
import { consultant, failure } from '@/lib/proposals/consultantRoute'
import { decideRule } from '@/lib/proposals/sends'
import { Refused } from '@/lib/proposals/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ ruleId: string }> }) {
  const { ruleId } = await ctx.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const who = await consultant()
  if (who instanceof NextResponse) return who
  try {
    return NextResponse.json(await decideRule(who.db, ruleId, who.name, { decision: body.decision, rule: body.rule }))
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: 409 })
    return failure(err, 'That could not be saved.')
  }
}
