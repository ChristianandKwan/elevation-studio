import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Fetch projects with elevations count + first thumbnail path + artworks for preview
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, client_name, status, created_at,
      elevations(
        id,
        elevation_options(
          id, option, image_path, orig_w, orig_h, scale_px_per_cm,
          artworks(id, image_path, x_fraction, y_fraction, w_cm, h_cm, visible)
        )
      )
    `)
    .eq('consultant_id', user!.id)
    .eq('archived', false)
    .order('created_at', { ascending: false })

  // Generate signed URLs for thumbnails and artwork images
  const projectsWithThumbs = await Promise.all(
    (projects ?? []).map(async (p) => {
      const firstOption = p.elevations?.[0]?.elevation_options?.find(
        (o: { option: string }) => o.option === 'A'
      )
      let thumbnailUrl: string | null = null
      if (firstOption?.image_path) {
        const { data } = await supabase.storage
          .from('elevation-images')
          .createSignedUrl(firstOption.image_path, 3600)
        thumbnailUrl = data?.signedUrl ?? null
      }

      // Generate signed URLs for artworks in first option A
      const artworks = await Promise.all(
        (firstOption?.artworks ?? [])
          .filter((a: { visible: boolean }) => a.visible)
          .map(async (a: { id: string; image_path: string; x_fraction: number; y_fraction: number; w_cm: number; h_cm: number; visible: boolean }) => {
            const { data: signed } = await supabase.storage
              .from('artwork-images')
              .createSignedUrl(a.image_path, 3600)
            return {
              id: a.id,
              imageUrl: signed?.signedUrl ?? null,
              xF: a.x_fraction,
              yF: a.y_fraction,
              wCm: a.w_cm,
              hCm: a.h_cm,
            }
          })
      )

      const origW = firstOption?.orig_w ?? 0
      const origH = firstOption?.orig_h ?? 0
      const scalePxPerCm = firstOption?.scale_px_per_cm ?? null

      const elevCount = p.elevations?.length ?? 0
      const artCount = 0
      return { ...p, thumbnailUrl, elevCount, artCount, artworks, origW, origH, scalePxPerCm }
    })
  )

  return (
    <DashboardClient
      profile={profile ?? { id: user!.id, name: user!.email ?? 'Consultant', initials: 'CK', role: 'consultant' }}
      projects={projectsWithThumbs}
    />
  )
}
