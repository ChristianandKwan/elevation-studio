import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/auth'
import StudioScreen from '@/components/studio/StudioScreen'
import { STUDIO_SIGNED_URL_TTL } from '@/lib/utils'
import { sortOptions } from '@/lib/options'
import { readOptionNoteFields } from '@/lib/lineItems'
import { PLACEMENT_WITH_WORK_SELECT, WORK_COLUMNS } from '@/lib/works'
import { placementsToArtworks, rowToWork } from '@/lib/workRows'

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

  // Elevations → options → placements, each placement with its work joined
  // in. Works themselves are fetched separately below, because the index
  // lists every work in the project whether or not it hangs anywhere.
  const [{ data: elevations }, { data: workRows }, { data: artistRows }] = await Promise.all([
    supabase
      .from('elevations')
      .select(`
        id, name, display_order, client_picked_option, visible_to_client,
        elevation_options(
          id, option, sort_order, created_at, name, image_path, orig_w, orig_h, scale_px_per_cm, approved, approved_at, foreground_masks, client_notes, consultant_note, consultant_note_shown_to_client,
          skew_tl_x, skew_tl_y, skew_tr_x, skew_tr_y, skew_br_x, skew_br_y, skew_bl_x, skew_bl_y, skew_active,
          artworks(${PLACEMENT_WITH_WORK_SELECT})
        )
      `)
      .eq('project_id', id)
      .order('display_order', { ascending: true }),
    supabase
      .from('works')
      .select(WORK_COLUMNS)
      .eq('project_id', id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    // Artists across every project this consultant can see, for the
    // pick-from-previous list. RLS scopes the read.
    supabase.from('works').select('artist').neq('artist', '').limit(2000),
  ])

  // Collect all image paths up-front, deduplicated. Every artwork image now
  // hangs off a work, so the project's works cover every placement too.
  const allOptions = (elevations ?? []).flatMap(elev => elev.elevation_options ?? [])
  const elevPaths = [...new Set(allOptions.map((o: any) => o.image_path).filter(Boolean))] as string[]
  const artPaths = [...new Set((workRows ?? []).map(w => w.image_path as string | null).filter(Boolean))] as string[]

  // Two batched createSignedUrls calls in parallel — one per bucket.
  // TTL is deliberately long: the studio never reloads on its own, so these
  // URLs have to outlive a working session. See STUDIO_SIGNED_URL_TTL.
  const [{ data: elevSigned }, { data: artSigned }] = await Promise.all([
    supabase.storage.from('elevation-images').createSignedUrls(elevPaths, STUDIO_SIGNED_URL_TTL),
    artPaths.length
      ? supabase.storage.from('artwork-images').createSignedUrls(artPaths, STUDIO_SIGNED_URL_TTL)
      : Promise.resolve({ data: [] as Array<{ path: string | null; signedUrl: string }> }),
  ])
  const elevMap = new Map(elevSigned?.map(e => [e.path, e.signedUrl]) ?? [])
  const artMap = new Map(artSigned?.map(e => [e.path, e.signedUrl]) ?? [])
  const artUrlFor = (path: string | null) => (path ? artMap.get(path) ?? null : null)

  // Rehydrate the per-option / per-artwork structure using the maps
  const elevationsWithUrls = (elevations ?? []).map(elev => {
    const options = (elev.elevation_options ?? []).map((opt: {
      id: string; option: string; sort_order: number; created_at: string; name: string | null; image_path: string | null;
      orig_w: number; orig_h: number; scale_px_per_cm: number | null;
      approved: boolean; approved_at: string | null;
      client_notes?: string | null;
      skew_tl_x?: number | null; skew_tl_y?: number | null;
      skew_tr_x?: number | null; skew_tr_y?: number | null;
      skew_br_x?: number | null; skew_br_y?: number | null;
      skew_bl_x?: number | null; skew_bl_y?: number | null;
      skew_active?: boolean;
      artworks: Array<Record<string, unknown>>;
      foreground_masks: unknown;
    }) => {
      const imageUrl = opt.image_path ? (elevMap.get(opt.image_path) ?? null) : null
      const artworks = placementsToArtworks(opt.artworks, artUrlFor)
      return { ...opt, imageUrl, imagePath: opt.image_path, artworks, clientNotes: opt.client_notes ?? '', ...readOptionNoteFields(opt as unknown as Record<string, unknown>) }
    })
    // Display order is decided in exactly one place — see src/lib/options.ts.
    return { ...elev, elevation_options: sortOptions(options), clientPickedOption: (elev as any).client_picked_option ?? null, visibleToClient: (elev as any).visible_to_client ?? true }
  })

  const works = (workRows ?? []).map(w => rowToWork(w as Record<string, unknown>, artUrlFor((w.image_path as string | null) ?? null)))

  const artistSuggestions = [...new Set(
    (artistRows ?? []).map(r => (typeof r.artist === 'string' ? r.artist.trim() : '')).filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))

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
      initialWorks={works}
      artistSuggestions={artistSuggestions}
      existingToken={clientLinkExpired ? null : (tokenRow?.token ?? null)}
      clientLinkExpired={clientLinkExpired}
      activityLogs={(activityLogs ?? []).map(a => ({ id: a.id, type: a.type, text: a.text, createdAt: a.created_at }))}
    />
  )
}
