/**
 * POST { projectId, brief } — Create proposal: build and freeze the export
 * pack, save the proposal, start the engine. Returns { id }.
 * GET ?projectId= — the project's proposals, newest first.
 */
import { NextResponse } from 'next/server'
import { readBrief } from '@/lib/proposals/brief'
import { createProposal, startsToday } from '@/lib/proposals/store'
import { studioUrlFor } from '@/lib/proposals/fire'
import { consultant, failure } from '@/lib/proposals/consultantRoute'

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
  const { data } = await who.db.from('proposals')
    .select('id, status, current_version, created_at, brief')
    .eq('project_id', projectId).order('created_at', { ascending: false })
  return NextResponse.json({
    starts: await startsToday(who.db),
    proposals: (data ?? []).map(p => ({
      id: p.id, status: p.status, currentVersion: p.current_version, createdAt: p.created_at,
      subtitle: (p.brief as { subtitle?: string } | null)?.subtitle ?? '',
    })),
  })
}
