/**
 * POST { version, pdfPath? } — this version went to the client. `pdfPath` is
 * the PDF they actually sent, if they changed it after downloading. Claude
 * then looks back over the proposal for the house style (040).
 */
import { NextResponse } from 'next/server'
import { markSent } from '@/lib/proposals/sends'
import { Refused } from '@/lib/proposals/store'
import { studioUrlFor } from '@/lib/proposals/fire'
import { consultantAndProposal, failure } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  try {
    return NextResponse.json(await markSent(found.who.db, found.proposal, {
      version: body?.version, pdfPath: body?.pdfPath,
      userId: found.who.userId, name: found.who.name, studioUrl: studioUrlFor(request),
    }))
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: 409 })
    return failure(err, 'It could not be marked as sent.')
  }
}
