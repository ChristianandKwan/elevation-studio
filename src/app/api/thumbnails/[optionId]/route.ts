/**
 * POST /api/thumbnails/[optionId]
 *
 * Regenerates the cached dashboard thumbnail for an elevation option.
 * Called from the studio after debounced writes (see useStudio.ts →
 * `scheduleThumbnailRegen`). The heavy sharp compositing runs here so
 * it stays off the dashboard page-render path.
 *
 * Auth: the caller must be the consultant who owns the option's parent
 * project. We verify ownership with the user-scoped Supabase client
 * (RLS enforces this), then hand off to a service-role client for the
 * storage upload + column patch.
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { regenerateOptionThumbnail } from '@/lib/thumbnail'

// Next 16: route handlers default to `dynamic` and run on the Node
// runtime by default — but `sharp` is a native module, so pin the
// runtime explicitly to avoid any Edge-runtime regression if defaults
// change later.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ optionId: string }> }
) {
  const { optionId } = await ctx.params
  if (!optionId) {
    return NextResponse.json({ error: 'Missing optionId' }, { status: 400 })
  }

  // 1. Auth check (RLS enforces consultant-owns-option)
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: owned } = await userClient
    .from('elevation_options')
    .select('id')
    .eq('id', optionId)
    .maybeSingle()

  if (!owned) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 2. Regenerate with service-role perms (storage upload + row patch)
  const serviceClient = await createServiceClient()
  const ok = await regenerateOptionThumbnail(serviceClient, optionId)

  // `ok === false` isn't fatal — it just means the option has no
  // elevation image yet (fresh project) or compositing failed. The
  // dashboard already falls back to the plain elevation URL in that
  // case, so we report 200 either way and include a flag for callers
  // that want to surface it.
  return NextResponse.json({ regenerated: ok })
}
