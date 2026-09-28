/**
 * POST — a link the browser uploads the PDF the consultant actually sent to,
 * straight into storage (Vercel caps request bodies far below a PDF of
 * pictures). Returns { path, token }; nothing is recorded until the send is.
 */
import { NextResponse } from 'next/server'
import { sentPdfUploadLink } from '@/lib/proposals/sends'
import { consultantAndProposal, failure } from '@/lib/proposals/consultantRoute'

export const dynamic = 'force-dynamic'

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const found = await consultantAndProposal(id)
  if (found instanceof NextResponse) return found
  try {
    return NextResponse.json(await sentPdfUploadLink(found.who.db, found.proposal))
  } catch (err) {
    return failure(err, 'The upload could not be started.')
  }
}
