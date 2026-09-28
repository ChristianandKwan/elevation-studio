/**
 * POST { pdfPath } — the PDF the consultant actually sent, uploaded after
 * marking it sent. Claude looks again, with their edits.
 * DELETE — it was marked as sent by mistake.
 */
import { NextResponse } from 'next/server'
import { attachSentPdf, undoSent } from '@/lib/proposals/sends'
import { Refused } from '@/lib/proposals/store'
import { studioUrlFor } from '@/lib/proposals/fire'
import { failure } from '@/lib/proposals/consultantRoute'
import { consultantAndSend } from '@/lib/proposals/sendRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await ctx.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const found = await consultantAndSend(sendId)
  if (found instanceof NextResponse) return found
  try {
    return NextResponse.json(await attachSentPdf(found.who.db, found.proposal, found.send, body?.pdfPath, studioUrlFor(request)))
  } catch (err) {
    if (err instanceof Refused) return NextResponse.json({ error: err.message }, { status: 409 })
    return failure(err, 'The PDF could not be added.')
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await ctx.params
  const found = await consultantAndSend(sendId)
  if (found instanceof NextResponse) return found
  try {
    return NextResponse.json(await undoSent(found.who.db, found.send))
  } catch (err) {
    return failure(err, 'It could not be undone.')
  }
}
