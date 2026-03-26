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

  // Fetch projects with elevations count + first thumbnail path
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, client_name, status, created_at,
      elevations(
        id,
        elevation_options(id, option, image_path)
      )
    `)
    .eq('consultant_id', user!.id)
    .order('created_at', { ascending: false })

  // Generate signed URLs for thumbnails
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
      const elevCount = p.elevations?.length ?? 0
      const artCount = 0 // skip expensive count for dashboard
      return { ...p, thumbnailUrl, elevCount, artCount }
    })
  )

  return (
    <DashboardClient
      profile={profile ?? { id: user!.id, name: user!.email ?? 'Consultant', initials: 'CK', role: 'consultant' }}
      projects={projectsWithThumbs}
    />
  )
}
