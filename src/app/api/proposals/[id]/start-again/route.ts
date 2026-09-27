/** POST { version } — Start again from an earlier version: it becomes the newest. */
import { NextResponse } from 'next/server'
import { Refused, startAgainFrom } from '@/lib/proposals/store'
import { consultantAndProposal, failure } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  const body = await request.json().catch(() => null) as { version?: unknown } | null
  const version = Number(body?.version)
  if (!Number.isInteger(version) || version < 1) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  try {
    return NextResponse.json(await startAgainFrom(found.who.db, found.proposal, version))
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: 409 })
    return failure(err, 'That version could not be started again from.')
  }
}
