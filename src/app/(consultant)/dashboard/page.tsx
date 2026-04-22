import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/auth'
import DashboardClient from '@/components/dashboard/DashboardClient'

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
export default async function DashboardPage() {
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
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, client_name, status, created_at,
      elevations(
        id, client_picked_option, display_order,
        elevation_options(
          id, option, image_path, thumbnail_path, orig_w, orig_h, scale_px_per_cm, approved
        )
      )
    `)
    .eq('consultant_id', user!.id)
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const projectsWithThumbs = await Promise.all(
    (projects ?? []).map(async (p) => { try {
      const sortedElevations = [...(p.elevations ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      const firstOption = sortedElevations[0]?.elevation_options?.find(
        (o: { option: string }) => o.option === 'A'
      )

      const origW = firstOption?.orig_w ?? 0
      const origH = firstOption?.orig_h ?? 0
      const scalePxPerCm = firstOption?.scale_px_per_cm ?? null

      let thumbnailUrl: string | null = null

      // Prefer the cached composited thumbnail
      if (firstOption?.thumbnail_path) {
        const { data: thumbSigned } = await supabaseService.storage
          .from('thumbnails')
          .createSignedUrl(firstOption.thumbnail_path, 3600)
        thumbnailUrl = thumbSigned?.signedUrl ?? null
      }

      // Fallback: plain elevation image (no compositing on the hot path)
      if (!thumbnailUrl && firstOption?.image_path) {
        const { data: elevSigned } = await supabaseService.storage
          .from('elevation-images')
          .createSignedUrl(firstOption.image_path, 3600)
        thumbnailUrl = elevSigned?.signedUrl ?? null
      }

      const elevCount = p.elevations?.length ?? 0
      const pickedCount = (p.elevations ?? []).filter((e: { client_picked_option: string | null }) => e.client_picked_option != null).length
      const approvedCount = (p.elevations ?? []).filter((e: { elevation_options: Array<{ approved: boolean }> }) =>
        e.elevation_options?.some(o => o.approved)
      ).length

      return {
        ...p,
        thumbnailUrl,
        elevCount,
        artCount: 0,
        artworks: [],
        origW,
        origH,
        scalePxPerCm,
        pickedCount,
        approvedCount,
      }
    } catch { return { ...p, thumbnailUrl: null, elevCount: p.elevations?.length ?? 0, artCount: 0, artworks: [], origW: 0, origH: 0, scalePxPerCm: null, pickedCount: 0, approvedCount: 0 } }
    })
  )

  return (
    <DashboardClient
      profile={profile ?? { id: user!.id, name: user!.email ?? 'Consultant', initials: 'CK', role: 'consultant' }}
      projects={projectsWithThumbs}
    />
  )
}
