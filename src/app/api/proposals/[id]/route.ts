/**
 * GET ?version=n — the proposal screen: status, pages of one version, the chat,
 * and each time it was sent to the client.
 * DELETE — remove a proposal that stopped before its first draft.
 */
import { NextResponse } from 'next/server'
import { proposalView, Refused, removeUnfinishedProposal } from '@/lib/proposals/store'
import { consultantAndProposal, failure } from '@/lib/proposals/consultantRoute'
import { sendForView, sendsOf } from '@/lib/proposals/sends'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  const v = Number(new URL(request.url).searchParams.get('version'))
  const [view, sends] = await Promise.all([
    proposalView(found.who.db, found.proposal, Number.isInteger(v) && v > 0 ? v : undefined),
    sendsOf(found.who.db, [found.proposal.id]),
  ])
  return NextResponse.json({ ...view, sends: sends.map(sendForView) })
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  try {
    return NextResponse.json(await removeUnfinishedProposal(found.who.db, found.proposal))
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: 409 })
    return failure(err, 'The proposal could not be removed.')
  }
}
