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
      id, name, display_order, client_picked_option,
      elevation_options(
        id, option, image_path, orig_w, orig_h, scale_px_per_cm, zoom, approved, approved_at, foreground_masks, client_notes,
        artworks(
          id, name, image_path, w_cm, h_cm, x_fraction, y_fraction, visible, price, price_includes, display_order
        )
      )
    `)
    .eq('project_id', projectId)
    .order('display_order', { ascending: true })

  // Generate signed URLs for all images
  const elevationsWithUrls = await Promise.all(
    (elevations ?? []).map(async (elev) => {
      const options = await Promise.all(
        (elev.elevation_options ?? []).map(async (opt: {
          id: string; option: string; image_path: string | null;
          orig_w: number; orig_h: number; scale_px_per_cm: number | null;
          zoom: number; approved: boolean; approved_at: string | null;
          foreground_masks?: any[] | null; client_notes?: string | null;
          artworks: Array<{
            id: string; name: string; image_path: string;
            w_cm: number; h_cm: number; x_fraction: number; y_fraction: number;
            visible: boolean; price: number; price_includes: string; display_order: number;
          }>;
        }) => {
          let imageUrl: string | null = null
          if (opt.image_path) {
            const { data } = await supabase.storage
              .from('elevation-images')
              .createSignedUrl(opt.image_path, 7200)
            imageUrl = data?.signedUrl ?? null
          }

          const artworks = await Promise.all(
            (opt.artworks ?? [])
              .sort((a, b) => a.display_order - b.display_order)
              .map(async (art) => {
                const { data } = await supabase.storage
                  .from('artwork-images')
                  .createSignedUrl(art.image_path, 7200)
                return {
                  ...art,
                  imageUrl: data?.signedUrl ?? null,
                  xF: art.x_fraction,
                  yF: art.y_fraction,
                  wCm: art.w_cm,
                  hCm: art.h_cm,
                  priceIncludes: art.price_includes,
                }
              })
          )

          return { ...opt, imageUrl, artworks, clientNotes: opt.client_notes ?? '' }
        })
      )
      return { ...elev, elevation_options: options, clientPickedOption: (elev as any).client_picked_option ?? null }
    })
  )

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
