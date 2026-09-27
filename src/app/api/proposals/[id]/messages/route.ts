/** POST { body, page } — the consultant writes to Claude about the proposal. */
import { NextResponse } from 'next/server'
import { addConsultantMessage } from '@/lib/proposals/store'
import { studioUrlFor } from '@/lib/proposals/fire'
import { consultantAndProposal, failure } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const text = typeof body?.body === 'string' ? body.body.trim().slice(0, 4000) : ''
  if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 })
  const page = typeof body?.page === 'number' && Number.isInteger(body.page) && body.page > 0 ? body.page : null

  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  try {
    return NextResponse.json(await addConsultantMessage(found.who.db, found.proposal, { body: text, page }, studioUrlFor(request)))
  } catch (err) {
    return failure(err, 'The message could not be sent.')
  }
}
