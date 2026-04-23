import { notFound } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import ClientPortal from '@/components/client/ClientPortal'

interface Props {
  params: Promise<{ token: string }>
}

export default async function ClientPortalPage({ params }: Props) {
  const { token } = await params
  const supabase = await createClient()
  const supabaseService = createServiceClient()

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
    .select('id, name, client_name, status, consultant_id, created_at, client_budget')
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
  // Try full query (requires migrations 009 + 010). On failure, fall back to base query.
  let { data: elevations, error: elevError } = await supabase
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
    .eq('project_id', projectId)
    .order('display_order', { ascending: true })

  // If query failed (e.g. brightness / skew / shadow columns not yet migrated), fall back without them
  if (elevError || !elevations) {
    const { data: fallback } = await supabase
      .from('elevations')
      .select(`
        id, name, display_order, client_picked_option,
        elevation_options(
          id, option, image_path, orig_w, orig_h, scale_px_per_cm, approved, approved_at, foreground_masks, client_notes,
          artworks(
            id, name, image_path, w_cm, h_cm, x_fraction, y_fraction, visible, price, artist, framing_status, framing_cost, display_order, frame_type, frame_width_mm
          )
        )
      `)
      .eq('project_id', projectId)
      .order('display_order', { ascending: true })
    elevations = fallback as typeof elevations
  }

  // Collect all image paths up-front, deduplicated across elevations/options
  const allOptions = (elevations ?? []).flatMap(elev => elev.elevation_options ?? [])
  const elevPaths = [...new Set(allOptions.map((o: any) => o.image_path).filter(Boolean))] as string[]
  const artPaths = [...new Set(allOptions.flatMap((o: any) => (o.artworks ?? []).map((a: any) => a.image_path)).filter(Boolean))] as string[]

  // Two batched createSignedUrls calls in parallel — service client, 72-hour expiry
  const [{ data: elevSigned }, { data: artSigned }] = await Promise.all([
    supabaseService.storage.from('elevation-images').createSignedUrls(elevPaths, 259200),
    supabaseService.storage.from('artwork-images').createSignedUrls(artPaths, 259200),
  ])
  const elevMap = new Map(elevSigned?.map(e => [e.path, e.signedUrl]) ?? [])
  const artMap = new Map(artSigned?.map(e => [e.path, e.signedUrl]) ?? [])

  // Rehydrate the per-option / per-artwork structure using the maps
  const elevationsWithUrls = (elevations ?? []).map(elev => {
    const options = (elev.elevation_options ?? []).map((opt: {
      id: string; option: string; image_path: string | null;
      orig_w: number; orig_h: number; scale_px_per_cm: number | null;
      approved: boolean; approved_at: string | null;
      foreground_masks?: any[] | null; client_notes?: string | null;
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
          artist: (art as any).artist ?? '',
          framingStatus: (art as any).framing_status ?? 'framed',
          framingCost: (art as any).framing_cost ?? null,
          frameType: (art as any).frame_type ?? null,
          frameWidthMm: (art as any).frame_width_mm ?? null,
          brightness: (art as any).brightness ?? 1,
          fade: (art as any).fade ?? null,
          shadowAngle: (art as any).shadow_angle ?? null,
          shadowBlur: (art as any).shadow_blur ?? null,
          shadowOpacity: (art as any).shadow_opacity ?? null,
        }))

      return { ...opt, imageUrl, artworks, clientNotes: opt.client_notes ?? '' }
    })
    return { ...elev, elevation_options: options, clientPickedOption: (elev as any).client_picked_option ?? null }
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
        preparedAt: new Date(project.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      }}
      elevations={elevationsWithUrls}
      approvalActivity={activity ?? []}
      clientBudget={(project as any).client_budget ?? null}
    />
  )
}
