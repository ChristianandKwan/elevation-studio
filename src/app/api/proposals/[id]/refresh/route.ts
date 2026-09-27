/**
 * POST — Refresh figures: rebuild the pack from the project as it is now and
 * ask Claude to carry the new figures in. The only way a price in a proposal
 * changes: it is changed in the budget first.
 */
import { NextResponse } from 'next/server'
import { refreshFigures } from '@/lib/proposals/store'
import { studioUrlFor } from '@/lib/proposals/fire'
import { consultantAndProposal, failure } from '@/lib/proposals/consultantRoute'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  try {
    await refreshFigures(found.who.db, found.proposal, found.who.name, studioUrlFor(request))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failure(err, 'The figures could not be refreshed.')
  }
}
