/** GET ?version=n — download that version's PDF, named after the project. */
import { NextResponse } from 'next/server'
import { versionPdfUrl } from '@/lib/proposals/store'
import { consultantAndProposal } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  const version = Number(new URL(request.url).searchParams.get('version'))
  if (!Number.isInteger(version) || version < 1) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const url = await versionPdfUrl(found.who.db, found.proposal, version)
  if (!url) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.redirect(url)
}
