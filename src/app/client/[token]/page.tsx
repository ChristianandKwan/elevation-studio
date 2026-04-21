import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ClientPortal from '@/components/client/ClientPortal'
import { timeNow } from '@/lib/utils'

interface Props {
  params: Promise<{ token: string }>
}

export default async function ClientPortalPage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()

  // Verify token
  const { data: tokenRow } = await supabase
    .from('client_tokens')
    .select('project_id, expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (!tokenRow) notFound()

  const projectId = tokenRow.project_id

  // Fetch project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, client_name, status, consultant_id')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  // Fetch consultant name
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, initials')
    .eq('id', project.consultant_id)
    .single()

  // Fetch elevations with options and artworks
  const { data: elevations } = await supabase
    .from('elevations')
    .select(`
      id, name, display_order,
      elevation_options(
        id, option, image_path, orig_w, orig_h, scale_px_per_cm, zoom, approved, approved_at, foreground_masks,
        artworks(
          id, name, image_path, w_cm, h_cm, x_fraction, y_fraction, visible, price, price_includes, display_order
        )
      )
    `)
    .eq('project_id', projectId)
    .order('display_order', { ascending: true })

  // Collect all image paths up-front, deduplicated across elevations/options
  const allOptions = (elevations ?? []).flatMap(elev => elev.elevation_options ?? [])
  const elevPaths = [...new Set(allOptions.map((o: { image_path: string | null }) => o.image_path).filter(Boolean))] as string[]
  const artPaths = [...new Set(allOptions.flatMap((o: { artworks: Array<{ image_path: string }> }) => (o.artworks ?? []).map(a => a.image_path)).filter(Boolean))] as string[]

  // Two batched createSignedUrls calls in parallel — one per bucket
  const [{ data: elevSigned }, { data: artSigned }] = await Promise.all([
    supabase.storage.from('elevation-images').createSignedUrls(elevPaths, 7200),
    supabase.storage.from('artwork-images').createSignedUrls(artPaths, 7200),
  ])
  const elevMap = new Map(elevSigned?.map(e => [e.path, e.signedUrl]) ?? [])
  const artMap = new Map(artSigned?.map(e => [e.path, e.signedUrl]) ?? [])

  // Rehydrate the per-option / per-artwork structure using the maps
  const elevationsWithUrls = (elevations ?? []).map(elev => {
    const options = (elev.elevation_options ?? []).map((opt: {
      id: string; option: string; image_path: string | null;
      orig_w: number; orig_h: number; scale_px_per_cm: number | null;
      zoom: number; approved: boolean; approved_at: string | null;
      foreground_masks?: any[] | null;
      artworks: Array<{
        id: string; name: string; image_path: string;
        w_cm: number; h_cm: number; x_fraction: number; y_fraction: number;
        visible: boolean; price: number; price_includes: string; display_order: number;
      }>;
    }) => {
      const imageUrl = opt.image_path ? (elevMap.get(opt.image_path) ?? null) : null

      const artworks = (opt.artworks ?? [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(art => ({
          ...art,
          imageUrl: artMap.get(art.image_path) ?? null,
          xF: art.x_fraction,
          yF: art.y_fraction,
          wCm: art.w_cm,
          hCm: art.h_cm,
          priceIncludes: art.price_includes,
        }))

      return { ...opt, imageUrl, artworks }
    })
    return { ...elev, elevation_options: options }
  })

  // Fetch approval activity
  const { data: activity } = await supabase
    .from('activity_logs')
    .select('id, type, text, created_at')
    .eq('project_id', projectId)
    .in('type', ['approved', 'unapprove'])
    .order('created_at', { ascending: false })

  return (
    <ClientPortal
      token={token}
      project={{
        id: project.id,
        name: project.name,
        clientName: project.client_name,
        status: project.status,
        consultantName: profile?.name ?? 'Your Consultant',
        consultantInitials: profile?.initials ?? 'CK',
        preparedAt: timeNow(),
      }}
      elevations={elevationsWithUrls}
      approvalActivity={activity ?? []}
    />
  )
}
