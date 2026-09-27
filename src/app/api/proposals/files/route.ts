/**
 * POST { projectId } — remove every proposal file of a project. The dashboard
 * calls this just before it deletes the project: the rows then go with the
 * project, and the browser cannot reach the proposals bucket to tidy up after.
 */
import { NextResponse } from 'next/server'
import { removeProjectProposalFiles } from '@/lib/proposals/store'
import { consultant, failure } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const projectId = typeof body?.projectId === 'string' ? body.projectId : null
  if (!projectId) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const who = await consultant(projectId)
  if (who instanceof NextResponse) return who
  try {
    await removeProjectProposalFiles(who.db, projectId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failure(err, 'The proposal files could not be removed.')
  }
}
