/**
 * POST { projectId, brief } — Create proposal: build and freeze the export
 * pack, save the proposal, start the engine. Returns { id }.
 * GET ?projectId= — the project's proposals, newest first, with their versions
 * and when each was last sent to the client (the project's Proposals view).
 */
import { NextResponse } from 'next/server'
import { readBrief } from '@/lib/proposals/brief'
import { createProposal, projectProposals, startsToday } from '@/lib/proposals/store'
import { studioUrlFor } from '@/lib/proposals/fire'
import { consultant, failure } from '@/lib/proposals/consultantRoute'
import { sendForView, sendsOf } from '@/lib/proposals/sends'

// Building the pack renders walls with sharp.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : null
  const brief = readBrief(body?.brief)
  if (!projectId || !brief) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const who = await consultant(projectId)
  if (who instanceof NextResponse) return who
  try {
    const id = await createProposal(who.db, {
      projectId, brief, userId: who.userId, consultantName: who.name,
      studioUrl: studioUrlFor(request),
    })
    return NextResponse.json({ id })
  } catch (err) {
    return failure(err, 'The proposal could not be started.')
  }
}

export async function GET(request: Request) {
  const projectId = new URL(request.url).searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const who = await consultant(projectId)
  if (who instanceof NextResponse) return who
  const [starts, proposals] = await Promise.all([startsToday(who.db), projectProposals(who.db, projectId)])
  // The latest time each was sent to the client, for its card.
  const sends = await sendsOf(who.db, proposals.map(p => p.id))
  return NextResponse.json({
    starts,
    proposals: proposals.map(p => {
      const sent = sends.find(s => s.proposal_id === p.id)
      return { ...p, sent: sent ? sendForView(sent) : null }
    }),
  })
}
