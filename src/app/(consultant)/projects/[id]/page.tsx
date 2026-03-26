import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import StudioScreen from '@/components/studio/StudioScreen'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Fetch project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, client_name, status, consultant_id')
    .eq('id', id)
    .eq('consultant_id', user!.id)
    .single()

  if (!project) notFound()

  // Fetch profile for consultant name
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, initials')
    .eq('id', user!.id)
    .single()

  // Fetch elevations with options and artworks
  const { data: elevations } = await supabase
    .from('elevations')
    .select(`
      id, name, display_order,
      elevation_options(
        id, option, image_path, orig_w, orig_h, scale_px_per_cm, zoom, approved, approved_at,
        artworks(
          id, name, image_path, w_cm, h_cm, x_fraction, y_fraction, visible, price, price_includes, display_order
        )
      )
    `)
    .eq('project_id', id)
    .order('display_order', { ascending: true })

  // Generate signed URLs for all images
  const elevationsWithUrls = await Promise.all(
    (elevations ?? []).map(async (elev) => {
      const options = await Promise.all(
        (elev.elevation_options ?? []).map(async (opt: {
          id: string; option: string; image_path: string | null;
          orig_w: number; orig_h: number; scale_px_per_cm: number | null;
          zoom: number; approved: boolean; approved_at: string | null;
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
              .createSignedUrl(opt.image_path, 3600)
            imageUrl = data?.signedUrl ?? null
          }

          const artworks = await Promise.all(
            (opt.artworks ?? [])
              .sort((a, b) => a.display_order - b.display_order)
              .map(async (art) => {
                const { data } = await supabase.storage
                  .from('artwork-images')
                  .createSignedUrl(art.image_path, 3600)
                return {
                  ...art,
                  imageUrl: data?.signedUrl ?? null,
                  imagePath: art.image_path,
                  xF: art.x_fraction,
                  yF: art.y_fraction,
                  wCm: art.w_cm,
                  hCm: art.h_cm,
                  priceIncludes: art.price_includes as 'artwork' | 'all',
                }
              })
          )

          return { ...opt, imageUrl, imagePath: opt.image_path, artworks }
        })
      )
      return { ...elev, elevation_options: options }
    })
  )

  // Fetch existing client token if any
  const { data: tokenRow } = await supabase
    .from('client_tokens')
    .select('token')
    .eq('project_id', id)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <StudioScreen
      project={{ ...project, consultantName: profile?.name ?? 'Consultant' }}
      elevations={elevationsWithUrls}
      existingToken={tokenRow?.token ?? null}
    />
  )
}
