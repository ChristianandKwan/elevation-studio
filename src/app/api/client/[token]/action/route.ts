/**
 * POST /api/client/[token]/action
 *
 * Single write endpoint for the client portal. The portal is unauthenticated
 * (magic link only), so the browser must never talk to Supabase directly —
 * the anon key ships in the bundle and RLS alone cannot tell "a valid token
 * exists for this project" apart from "the caller holds that token".
 *
 * Every request therefore:
 *   1. resolves the magic-link token to a project (service client, so RLS is
 *      bypassed — safe, because this route does the checking itself),
 *   2. proves each ID in the payload chains back to *that* project, and
 *   3. only then performs the write.
 *
 * Behaviour mirrors the previous in-browser Supabase calls 1:1, including the
 * activity-log entries and the "all elevations done → project approved" rule.
 *
 * Auth pattern and route config follow src/app/api/thumbnails/[optionId]/route.ts.
 * `middleware.ts` already excludes /api/, so no middleware changes are needed.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Svc = ReturnType<typeof createServiceClient>

type Action =
  | 'toggle_visibility'
  | 'save_notes'
  | 'move_artworks'
  | 'pick_option'
  | 'unpick_option'
  | 'approve'

const ACTIONS: readonly Action[] = [
  'toggle_visibility', 'save_notes', 'move_artworks',
  'pick_option', 'unpick_option', 'approve',
]

// ── Ownership checks ──────────────────────────────────────
// These replace what the old RLS policies were meant to do: confirm the
// caller's token owns every row it is about to touch. Queries are stepwise
// rather than joined so the chain is obvious and doesn't depend on PostgREST
// picking the right embedded relationship.

/** Elevation must belong to the token's project. */
async function elevationInProject(svc: Svc, elevationId: string, projectId: string) {
  const { data } = await svc
    .from('elevations')
    .select('id, name, project_id')
    .eq('id', elevationId)
    .maybeSingle()
  if (!data || data.project_id !== projectId) return null
  return data as { id: string; name: string; project_id: string }
}

/** Option must chain option → elevation → the token's project. */
async function optionInProject(svc: Svc, optionId: string, projectId: string) {
  const { data: opt } = await svc
    .from('elevation_options')
    .select('id, option, elevation_id, approved')
    .eq('id', optionId)
    .maybeSingle()
  if (!opt) return null
  const elev = await elevationInProject(svc, opt.elevation_id as string, projectId)
  if (!elev) return null
  return {
    id: opt.id as string,
    option: opt.option as string,
    approved: opt.approved as boolean,
    elevationName: elev.name,
  }
}

/**
 * Every artwork must chain artwork → option → elevation → the token's project.
 * Returns null if any ID is missing or foreign, so a partial batch never
 * writes. `approved` is carried through so callers can honour the old
 * "positions are frozen once approved" rule.
 */
async function artworksInProject(svc: Svc, ids: string[], projectId: string) {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map<string, { approved: boolean }>()

  const { data: arts } = await svc.from('artworks').select('id, option_id').in('id', unique)
  if (!arts || arts.length !== unique.length) return null

  const optionIds = [...new Set(arts.map(a => a.option_id as string))]
  const { data: opts } = await svc
    .from('elevation_options')
    .select('id, elevation_id, approved')
    .in('id', optionIds)
  if (!opts || opts.length !== optionIds.length) return null

  const elevationIds = [...new Set(opts.map(o => o.elevation_id as string))]
  const { data: elevs } = await svc
    .from('elevations')
    .select('id, project_id')
    .in('id', elevationIds)
  if (!elevs) return null

  // Any elevation outside the token's project poisons the whole batch.
  const ownedElevations = new Set(
    elevs.filter(e => e.project_id === projectId).map(e => e.id as string)
  )
  if (ownedElevations.size !== elevationIds.length) return null

  const optionApproved = new Map(
    opts.map(o => [o.id as string, o.approved as boolean])
  )
  return new Map(
    arts.map(a => [a.id as string, { approved: optionApproved.get(a.option_id as string) ?? false }])
  )
}

// ── Helpers ───────────────────────────────────────────────

/** Activity logging is best-effort — it never fails the user's action. */
async function logActivity(svc: Svc, projectId: string, type: string, text: string) {
  const { error } = await svc.from('activity_logs').insert({ project_id: projectId, type, text })
  if (error) console.warn(`activity_logs insert failed (${type}):`, error.message)
}

/**
 * Mirrors ClientPortal's old client-side `allDone` check, but from freshly
 * written DB state: every elevation has a resolved option and that option is
 * approved. An elevation "needs picking" when more than one option has an
 * image; otherwise the single imaged option stands in.
 */
async function allElevationsApproved(svc: Svc, projectId: string): Promise<boolean> {
  const { data: elevs } = await svc
    .from('elevations')
    .select('id, client_picked_option, elevation_options(option, image_path, approved)')
    .eq('project_id', projectId)
  if (!elevs?.length) return false

  return elevs.every(elev => {
    const options = (elev.elevation_options ?? []) as Array<{
      option: string; image_path: string | null; approved: boolean
    }>
    const withImages = options.filter(o => o.image_path)
    const needsPick = withImages.length > 1
    const picked = (elev.client_picked_option as string | null) ?? null
    const resolved = needsPick ? picked : (picked ?? withImages[0]?.option ?? null)
    if (!resolved) return false
    return options.find(o => o.option === resolved)?.approved ?? false
  })
}

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status })
}

// ── Route ─────────────────────────────────────────────────

export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params
  if (!token) return bad('Missing token', 400)

  const svc = createServiceClient()

  // 1. Resolve the magic link. Expired or unknown tokens are indistinguishable
  //    from a wrong URL on purpose — both are a plain 404.
  const { data: tokenRow } = await svc
    .from('client_tokens')
    .select('project_id, expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (!tokenRow) return bad('Not found', 404)
  const projectId = tokenRow.project_id as string

  let body: { action?: string; payload?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return bad('Invalid JSON body', 400)
  }

  const action = body.action as Action
  if (!action || !ACTIONS.includes(action)) return bad('Unknown action', 400)
  const payload = body.payload ?? {}

  switch (action) {
    // ── Toggle one artwork's visibility ──────────────────
    case 'toggle_visibility': {
      const artworkId = payload.artworkId
      const visible = payload.visible
      if (typeof artworkId !== 'string' || typeof visible !== 'boolean') {
        return bad('Invalid payload', 400)
      }
      const owned = await artworksInProject(svc, [artworkId], projectId)
      if (!owned) return bad('Forbidden', 403)

      const { error } = await svc.from('artworks').update({ visible }).eq('id', artworkId)
      if (error) return bad('Update failed', 500)
      return NextResponse.json({ ok: true })
    }

    // ── Save the client's notes on an option ─────────────
    case 'save_notes': {
      const optionId = payload.optionId
      const notes = payload.notes
      if (typeof optionId !== 'string' || typeof notes !== 'string') {
        return bad('Invalid payload', 400)
      }
      const owned = await optionInProject(svc, optionId, projectId)
      if (!owned) return bad('Forbidden', 403)

      const { error } = await svc
        .from('elevation_options')
        .update({ client_notes: notes })
        .eq('id', optionId)
      if (error) return bad('Update failed', 500)
      return NextResponse.json({ ok: true })
    }

    // ── Flush dragged artwork positions ──────────────────
    // Called as a batch immediately before pick/approve, matching the old
    // per-artwork updates. Artworks on an already-approved option are skipped
    // rather than rejected — the old RLS policy carried an `approved = false`
    // condition, so those writes silently no-opped.
    case 'move_artworks': {
      const artworks = payload.artworks
      if (!Array.isArray(artworks)) return bad('Invalid payload', 400)
      const items = artworks as Array<{ id?: unknown; xF?: unknown; yF?: unknown }>
      if (items.some(a =>
        typeof a?.id !== 'string' ||
        typeof a?.xF !== 'number' || !Number.isFinite(a.xF) ||
        typeof a?.yF !== 'number' || !Number.isFinite(a.yF)
      )) {
        return bad('Invalid payload', 400)
      }
      if (!items.length) return NextResponse.json({ ok: true })

      const owned = await artworksInProject(svc, items.map(a => a.id as string), projectId)
      if (!owned) return bad('Forbidden', 403)

      const writable = items.filter(a => !owned.get(a.id as string)?.approved)
      const results = await Promise.all(
        writable.map(a =>
          svc.from('artworks')
            .update({ x_fraction: a.xF as number, y_fraction: a.yF as number })
            .eq('id', a.id as string)
        )
      )
      if (results.some(r => r.error)) return bad('Update failed', 500)
      return NextResponse.json({ ok: true, updated: writable.length })
    }

    // ── Client picks Option A or B for an elevation ──────
    case 'pick_option': {
      const elevationId = payload.elevationId
      const option = payload.option
      if (typeof elevationId !== 'string' || (option !== 'A' && option !== 'B')) {
        return bad('Invalid payload', 400)
      }
      const elev = await elevationInProject(svc, elevationId, projectId)
      if (!elev) return bad('Forbidden', 403)

      const { error } = await svc
        .from('elevations')
        .update({ client_picked_option: option })
        .eq('id', elevationId)
      if (error) return bad('Update failed', 500)

      await logActivity(svc, projectId, 'pick', `Client picked Option ${option} for ${elev.name}`)
      return NextResponse.json({ ok: true })
    }

    // ── Client clears their pick ─────────────────────────
    case 'unpick_option': {
      const elevationId = payload.elevationId
      if (typeof elevationId !== 'string') return bad('Invalid payload', 400)

      const elev = await elevationInProject(svc, elevationId, projectId)
      if (!elev) return bad('Forbidden', 403)

      const { error } = await svc
        .from('elevations')
        .update({ client_picked_option: null })
        .eq('id', elevationId)
      if (error) return bad('Update failed', 500)

      await logActivity(svc, projectId, 'pick_cleared', `Client cleared option selection for ${elev.name}`)
      return NextResponse.json({ ok: true })
    }

    // ── Client approves an option ────────────────────────
    case 'approve': {
      const optionId = payload.optionId
      if (typeof optionId !== 'string') return bad('Invalid payload', 400)

      const opt = await optionInProject(svc, optionId, projectId)
      if (!opt) return bad('Forbidden', 403)

      const approvedAt = new Date().toISOString()
      const { error } = await svc
        .from('elevation_options')
        .update({ approved: true, approved_at: approvedAt })
        .eq('id', optionId)
      if (error) return bad('Update failed', 500)

      await logActivity(
        svc, projectId, 'approved',
        `Client approved Option ${opt.option} of ${opt.elevationName}`
      )

      // Whole project signed off once every elevation's resolved option is approved.
      const projectApproved = await allElevationsApproved(svc, projectId)
      if (projectApproved) {
        await svc.from('projects').update({ status: 'approved' }).eq('id', projectId)
      }

      return NextResponse.json({ ok: true, approvedAt, projectApproved })
    }
  }
}
