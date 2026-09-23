import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/auth'
import DashboardClient from '@/components/dashboard/DashboardClient'
import { sortOptions } from '@/lib/options'
import { blankWallDataUrl } from '@/lib/wall'
import { firstLoadFailure, looksLikeSchemaDrift } from '@/lib/loadGuard'
import LoadFailed from '@/components/ui/LoadFailed'

/**
 * Dashboard project thumbnails used to be composited inline on every
 * page load — downloading every image, running sharp per artwork, and
 * base64-inlining the result into the SSR HTML. That scaled with
 * (projects × artworks) and bloated the response.
 *
 * Now: each `elevation_options` row caches a pre-composited PNG under
 * `thumbnail_path` in the `thumbnails` bucket. The studio triggers
 * regeneration on every write (see useStudio.ts → scheduleThumbnailRegen
 * → POST /api/thumbnails/[optionId]). Here we just sign the cached PNG.
 *
 * If `thumbnail_path` is null (legacy row, first load after the
 * migration, regen failed, or regen in flight) we fall back to a
 * plain signed URL for the elevation image — never the expensive
 * composite.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>
}) {
  const view = (await searchParams).view === 'archived' ? 'archived' : 'active'
  const supabase = await createClient()
  const supabaseService = createServiceClient()

  const user = await getCurrentUser()

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Fetch projects with elevations + first option + approval status.
  // We no longer need the full artwork list for rendering (it's baked
  // into the cached thumbnail), but we still need approval counts.
  const projectsRes = await supabase
    .from('projects')
    .select(`
      id, name, client_name, status, created_at,
      elevations(
        id, client_picked_option, display_order, visible_to_client,
        elevation_options(
          id, option, sort_order, created_at, image_path, thumbnail_path, orig_w, orig_h, scale_px_per_cm, wall_w_cm, wall_h_cm, wall_color, approved
        )
      )
    `)
    .eq('consultant_id', user!.id)
    .eq('archived', view === 'archived')
    .order('created_at', { ascending: false })

  // An empty dashboard and a dashboard that could not load look identical,
  // and one of them says "you have no projects" to somebody who has twelve.
  const loadFailure = firstLoadFailure([['projects', projectsRes]])
  if (loadFailure) {
    return <LoadFailed {...loadFailure} schemaDrift={looksLikeSchemaDrift(loadFailure)} />
  }
  const projects = projectsRes.data

  // Extract first option per project: first elevation by display_order, its first option by position
  const projectMeta = (projects ?? []).map(p => {
    const sortedElevations = [...(p.elevations ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    const firstOption = sortOptions(sortedElevations[0]?.elevation_options ?? [])[0]
    const elevCount = p.elevations?.length ?? 0
    // Progress is out of what the client can see. A hidden elevation cannot be
    // picked or approved, so counting it kept a finished project at "2/3
    // approved" for good — the same rule the approval itself already follows.
    const shown = (p.elevations ?? []).filter((e: { visible_to_client: boolean | null }) => e.visible_to_client !== false)
    const shownCount = shown.length
    const pickedCount = shown.filter((e: { client_picked_option: string | null }) => e.client_picked_option != null).length
    const approvedCount = shown.filter((e: { elevation_options: Array<{ approved: boolean }> }) =>
      e.elevation_options?.some(o => o.approved)
    ).length
    return { p, firstOption, elevCount, shownCount, pickedCount, approvedCount }
  })

  // Collect paths for batch signing — two RPCs instead of N
  const thumbPaths = projectMeta
    .filter(m => m.firstOption?.thumbnail_path)
    .map(m => m.firstOption!.thumbnail_path as string)
  const fallbackPaths = projectMeta
    .filter(m => !m.firstOption?.thumbnail_path && m.firstOption?.image_path)
    .map(m => m.firstOption!.image_path as string)

  const [thumbResult, fallbackResult] = await Promise.all([
    thumbPaths.length > 0
      ? supabaseService.storage.from('thumbnails').createSignedUrls(thumbPaths, 3600)
      : Promise.resolve({ data: [] as Array<{ path: string; signedUrl: string }> }),
    fallbackPaths.length > 0
      ? supabaseService.storage.from('elevation-images').createSignedUrls(fallbackPaths, 3600)
      : Promise.resolve({ data: [] as Array<{ path: string; signedUrl: string }> }),
  ])

  const thumbMap = new Map((thumbResult.data ?? []).map(r => [r.path, r.signedUrl]))
  const fallbackMap = new Map((fallbackResult.data ?? []).map(r => [r.path, r.signedUrl]))

  const projectsWithThumbs = projectMeta.map(({ p, firstOption, elevCount, shownCount, pickedCount, approvedCount }) => {
    let thumbnailUrl: string | null = null
    if (firstOption?.thumbnail_path) {
      thumbnailUrl = thumbMap.get(firstOption.thumbnail_path) ?? null
    } else if (firstOption?.image_path) {
      thumbnailUrl = fallbackMap.get(firstOption.image_path) ?? null
    } else if (firstOption?.wall_color) {
      // A plain wall in the gap before its first thumbnail is rendered. Drawing
      // the wall costs nothing and is honest about the project's shape; the
      // alternative is a placeholder that makes a set-up project look empty.
      thumbnailUrl = blankWallDataUrl(
        firstOption.orig_w || 1600, firstOption.orig_h || 900, firstOption.wall_color,
      )
    }
    return {
      ...p,
      thumbnailUrl,
      elevCount,
      shownCount,
      origW: firstOption?.orig_w ?? 0,
      origH: firstOption?.orig_h ?? 0,
      scalePxPerCm: firstOption?.scale_px_per_cm ?? null,
      pickedCount,
      approvedCount,
    }
  })

  return (
    <DashboardClient
      profile={profile ?? { id: user!.id, name: user!.email ?? 'Consultant', initials: 'CK', role: 'consultant' }}
      projects={projectsWithThumbs}
      view={view}
    />
  )
}
