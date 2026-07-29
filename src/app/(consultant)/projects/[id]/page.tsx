import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/auth'
import StudioScreen from '@/components/studio/StudioScreen'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const user = await getCurrentUser()

  // Fetch project
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, client_name, status, consultant_id, budget')
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
      id, name, display_order, client_picked_option,
      elevation_options(
        id, option, image_path, orig_w, orig_h, scale_px_per_cm, approved, approved_at, foreground_masks, client_notes,
        skew_tl_x, skew_tl_y, skew_tr_x, skew_tr_y, skew_br_x, skew_br_y, skew_bl_x, skew_bl_y, skew_active,
        artworks(
          id, name, image_path, w_cm, h_cm, x_fraction, y_fraction, visible, price, artist, framing_status, framing_cost, display_order, frame_type, frame_width_mm, brightness, fade, shadow_angle, shadow_blur, shadow_opacity
        )
      )
    `)
    .eq('project_id', id)
    .order('display_order', { ascending: true })

  // Collect all image paths up-front, deduplicated across elevations/options
  const allOptions = (elevations ?? []).flatMap(elev => elev.elevation_options ?? [])
  const elevPaths = [...new Set(allOptions.map((o: any) => o.image_path).filter(Boolean))] as string[]
  const artPaths = [...new Set(allOptions.flatMap((o: any) => (o.artworks ?? []).map((a: any) => a.image_path)).filter(Boolean))] as string[]

  // Two batched createSignedUrls calls in parallel — one per bucket
  const [{ data: elevSigned }, { data: artSigned }] = await Promise.all([
    supabase.storage.from('elevation-images').createSignedUrls(elevPaths, 3600),
    supabase.storage.from('artwork-images').createSignedUrls(artPaths, 3600),
  ])
  const elevMap = new Map(elevSigned?.map(e => [e.path, e.signedUrl]) ?? [])
  const artMap = new Map(artSigned?.map(e => [e.path, e.signedUrl]) ?? [])

  // Rehydrate the per-option / per-artwork structure using the maps
  const elevationsWithUrls = (elevations ?? []).map(elev => {
    const options = (elev.elevation_options ?? []).map((opt: {
      id: string; option: string; image_path: string | null;
      orig_w: number; orig_h: number; scale_px_per_cm: number | null;
      approved: boolean; approved_at: string | null;
      client_notes?: string | null;
      skew_tl_x?: number | null; skew_tl_y?: number | null;
      skew_tr_x?: number | null; skew_tr_y?: number | null;
      skew_br_x?: number | null; skew_br_y?: number | null;
      skew_bl_x?: number | null; skew_bl_y?: number | null;
      skew_active?: boolean;
      artworks: Array<{
        id: string; name: string; image_path: string;
        w_cm: number; h_cm: number; x_fraction: number; y_fraction: number;
        visible: boolean; price: number; artist: string; framing_status: string; framing_cost: number | null; display_order: number;
      }>;
      foreground_masks: unknown;
    }) => {
      const imageUrl = opt.image_path ? (elevMap.get(opt.image_path) ?? null) : null

      const artworks = (opt.artworks ?? [])
        .sort((a, b) => a.display_order - b.display_order)
        .map(art => ({
          ...art,
          imageUrl: artMap.get(art.image_path) ?? null,
          imagePath: art.image_path,
          xF: art.x_fraction,
          yF: art.y_fraction,
          wCm: art.w_cm,
          hCm: art.h_cm,
          artist: (art as any).artist ?? '',
          framingStatus: ((art as any).framing_status ?? 'framed') as 'framed' | 'requires_framing',
          framingCost: (art as any).framing_cost ?? null,
          frameType: (art as any).frame_type ?? null,
          frameWidthMm: (art as any).frame_width_mm ?? null,
          brightness: (art as any).brightness ?? 1,
          fade: (art as any).fade ?? null,
          shadowAngle: (art as any).shadow_angle ?? null,
          shadowBlur: (art as any).shadow_blur ?? null,
          shadowOpacity: (art as any).shadow_opacity ?? null,
        }))

      return { ...opt, imageUrl, imagePath: opt.image_path, artworks, clientNotes: opt.client_notes ?? '' }
    })
    return { ...elev, elevation_options: options, clientPickedOption: (elev as any).client_picked_option ?? null }
  })

  // Most recent client token, expired or not. The expiry filter used to live in
  // this query, which meant an expired link was indistinguishable from never
  // having made one — the consultant had no way to know their client's link had
  // gone dead. Filtering happens below instead, so the studio can warn.
  const { data: tokenRow } = await supabase
    .from('client_tokens')
    .select('token, expires_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const clientLinkExpired = !!tokenRow && new Date(tokenRow.expires_at) <= new Date()

  // Fetch last 10 activity logs for the project
  const { data: activityLogs } = await supabase
    .from('activity_logs')
    .select('id, type, text, created_at')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(10)

  return (
    <StudioScreen
      project={{ ...project, consultantName: profile?.name ?? 'Consultant', budget: (project as any).budget ?? null }}
      elevations={elevationsWithUrls}
      existingToken={clientLinkExpired ? null : (tokenRow?.token ?? null)}
      clientLinkExpired={clientLinkExpired}
      activityLogs={(activityLogs ?? []).map(a => ({ id: a.id, type: a.type, text: a.text, createdAt: a.created_at }))}
    />
  )
}
