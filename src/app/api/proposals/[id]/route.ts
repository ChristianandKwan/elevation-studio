/** GET ?version=n — the proposal screen: status, pages of one version, the chat. */
import { NextResponse } from 'next/server'
import { proposalView } from '@/lib/proposals/store'
import { consultantAndProposal } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  const v = Number(new URL(request.url).searchParams.get('version'))
  return NextResponse.json(await proposalView(found.who.db, found.proposal, Number.isInteger(v) && v > 0 ? v : undefined))
}
