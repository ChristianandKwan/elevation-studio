/**
 * POST /api/export/[projectId]
 *
 * Builds the export pack — a markdown file plus the wall renders and artwork
 * images — writes it to the `exports` bucket and returns a signed URL for the
 * browser to download. See src/lib/export/pack.ts for why it goes via storage
 * rather than coming back in this response.
 *
 * Body: the consultant's choices from the export screen.
 *   { optionIds: string[], includeSetAside, includeWallRenders,
 *     includeWorkImages, includeThumbnails: boolean }
 *
 * Auth follows src/app/api/thumbnails/[optionId]/route.ts: verify the caller
 * with the user-scoped client, where RLS enforces consultant-owns-project,
 * then do the storage work with the service client. `middleware.ts` excludes
 * /api/, so the check has to be here.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { buildExportPack } from '@/lib/export/pack'
import { DEFAULT_CHOICES, type ExportChoices } from '@/lib/export/types'

// `sharp` is a native module, so the Node runtime is not optional here.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Compositing a wall takes about half a second and a project can have several,
 * on top of downloading every artwork file. The default ten seconds is not
 * enough for a real project and the failure would look like a hang.
 */
export const maxDuration = 60

/** Read the choices defensively: this is a request body, not our own state. */
function readChoices(raw: unknown): ExportChoices | null {
  if (typeof raw !== 'object' || raw === null) return null
  const body = raw as Record<string, unknown>
  const ids = body.optionIds
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) return null
  const bool = (v: unknown, fallback: boolean) => typeof v === 'boolean' ? v : fallback
  return {
    optionIds: ids as string[],
    includeSetAside: bool(body.includeSetAside, DEFAULT_CHOICES.includeSetAside),
    includeWallRenders: bool(body.includeWallRenders, DEFAULT_CHOICES.includeWallRenders),
    includeWorkImages: bool(body.includeWorkImages, DEFAULT_CHOICES.includeWorkImages),
    includeThumbnails: bool(body.includeThumbnails, DEFAULT_CHOICES.includeThumbnails),
  }
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await ctx.params
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
  }

  const choices = readChoices(await request.json().catch(() => null))
  if (!choices) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // 1. Auth. RLS enforces consultant-owns-project on this read.
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: owned } = await userClient
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()

  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .maybeSingle()

  // 2. Assemble with service-role perms: signing artwork URLs and writing the
  //    zip both need to work regardless of RLS context.
  try {
    const pack = await buildExportPack(
      createServiceClient(),
      projectId,
      choices,
      profile?.name ?? '',
    )
    if (!pack) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json(pack)
  } catch (err) {
    // The consultant is waiting on a download that is not coming, so say what
    // happened rather than letting it fail as an empty response.
    const message = err instanceof Error ? err.message : 'The export could not be built.'
    console.error('[export] failed for project', projectId, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
