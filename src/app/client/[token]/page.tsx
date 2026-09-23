import { notFound } from 'next/navigation'
import LoadFailed from '@/components/ui/LoadFailed'
import { createServiceClient } from '@/lib/supabase/server'
import ClientPortal from '@/components/client/ClientPortal'
import ClientLinkExpired from '@/components/client/ClientLinkExpired'
import type { ProjectBudget } from '@/types'
import { labelOptions } from '@/lib/options'
import { readOptionNoteFields } from '@/lib/lineItems'
import { PLACEMENT_WITH_WORK_SELECT } from '@/lib/works'
import { placementsToArtworks, placementImagePath } from '@/lib/workRows'

interface Props {
  params: Promise<{ token: string }>
}

/**
 * The placements on an option, each with its work joined in. Defined once
 * because two queries below select it — the second is a fallback, and the
 * two used to drift.
 */
const ARTWORKS_FRAGMENT = `artworks(${PLACEMENT_WITH_WORK_SELECT})`

export default async function ClientPortalPage({ params }: Props) {
  const { token } = await params
  // The portal is unauthenticated (magic link only), so every read runs
  // through the service client and is scoped by the token's project_id below.
  // RLS is bypassed deliberately — this page does the checking itself.
  const supabase = createServiceClient()

  // Verify token. The expiry check happens here rather than in the query so an
  // expired link can be told apart from a wrong one: expired gets an
  // explanation, unknown still gets a plain 404 (a mistyped URL must not reveal
  // whether a project exists).
  const { data: tokenRow } = await supabase
    .from('client_tokens')
    .select('project_id, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!tokenRow) notFound()
  if (new Date(tokenRow.expires_at) <= new Date()) return <ClientLinkExpired />

  const projectId = tokenRow.project_id

  // Fetch elevations with options and artworks. Elevations the consultant has
  // hidden are filtered out here, not in the browser, so nothing about them
  // (images, prices, names) ever reaches the client. The Budget tab is built
  // from this same list, so hidden elevations drop out of it too.
  // Try full query (requires migrations 009 + 010). On failure, fall back to base query.
  const fetchElevations = async () => {
    let { data: elevations, error: elevError } = await supabase
      .from('elevations')
      .select(`
        id, name, display_order, client_picked_option,
        elevation_options(
          id, option, sort_order, created_at, name, image_path, orig_w, orig_h, scale_px_per_cm, wall_w_cm, wall_h_cm, wall_color, approved, approved_at, foreground_masks, client_notes, consultant_note, consultant_note_shown_to_client,
          skew_tl_x, skew_tl_y, skew_tr_x, skew_tr_y, skew_br_x, skew_br_y, skew_bl_x, skew_bl_y, skew_active,
          ${ARTWORKS_FRAGMENT}
        )
      `)
      .eq('project_id', projectId)
      .eq('visible_to_client', true)
      .order('display_order', { ascending: true })

    // If query failed (e.g. skew columns not yet migrated), fall back without them
    if (elevError || !elevations) {
      const { data: fallback, error: fallbackErr } = await supabase
        .from('elevations')
        .select(`
          id, name, display_order, client_picked_option,
          elevation_options(
            id, option, sort_order, created_at, name, image_path, orig_w, orig_h, scale_px_per_cm, wall_w_cm, wall_h_cm, wall_color, approved, approved_at, foreground_masks, client_notes, consultant_note, consultant_note_shown_to_client,
            ${ARTWORKS_FRAGMENT}
          )
        `)
        .eq('project_id', projectId)
        .eq('visible_to_client', true)
        .order('display_order', { ascending: true })
      elevations = fallback as typeof elevations
      elevError = fallbackErr
    }
    return { elevations, elevError }
  }

  // Once the token has named the project, everything else is asked for at
  // once. These used to go one after another, and each wait was added to the
  // time before the client saw anything. Only the consultant's name has to
  // wait, for the project row — it goes alongside the image links below.
  const [
    { data: project },
    { elevations, elevError },
    { data: activity },
    { data: budgetRow },
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, client_name, status, consultant_id, created_at, client_budget')
      .eq('id', projectId)
      .single(),
    fetchElevations(),
    // Approval activity
    supabase
      .from('activity_logs')
      .select('id, type, text, created_at')
      .eq('project_id', projectId)
      .in('type', ['approved', 'unapprove'])
      .order('created_at', { ascending: false }),
    // Budget row for the portal's Budget tab. Fetched here rather than in the
    // browser: the client is read-only for budgets and has no way to query
    // project_budgets directly. Null when the consultant hasn't opened the
    // budget screen yet (the row is created lazily on the consultant side).
    supabase
      .from('project_budgets')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle(),
  ])

  if (!project) notFound()

  // Both attempts failed. Rendering on would show the client a proposal with
  // no walls in it, which reads as the consultant having sent them nothing.
  if (elevError) {
    return <LoadFailed what="proposal" detail="" audience="client" />
  }

  // Collect all image paths up-front, deduplicated across elevations/options
  const allOptions = (elevations ?? []).flatMap(elev => elev.elevation_options ?? [])
  const elevPaths = [...new Set(allOptions.map((o: any) => o.image_path).filter(Boolean))] as string[]
  const artPaths = [...new Set(
    allOptions
      .flatMap(o => ((o as { artworks?: Array<Record<string, unknown>> }).artworks ?? []).map(a => placementImagePath(a)))
      .filter(Boolean),
  )] as string[]

  // Two batched createSignedUrls calls in parallel — service client, 72-hour
  // expiry — with the consultant's name alongside.
  const [{ data: elevSigned }, { data: artSigned }, { data: profile }] = await Promise.all([
    supabase.storage.from('elevation-images').createSignedUrls(elevPaths, 259200),
    artPaths.length
      ? supabase.storage.from('artwork-images').createSignedUrls(artPaths, 259200)
      : Promise.resolve({ data: [] as Array<{ path: string | null; signedUrl: string }> }),
    supabase
      .from('profiles')
      .select('name, initials')
      .eq('id', project.consultant_id)
      .single(),
  ])
  const elevMap = new Map(elevSigned?.map(e => [e.path, e.signedUrl]) ?? [])
  const artMap = new Map(artSigned?.map(e => [e.path, e.signedUrl]) ?? [])
  const artUrlFor = (path: string | null) => (path ? artMap.get(path) ?? null : null)

  // Rehydrate the per-option / per-artwork structure using the maps
  const elevationsWithUrls = (elevations ?? []).map(elev => {
    const options = (elev.elevation_options ?? []).map((opt: {
      id: string; option: string; sort_order: number; created_at: string; name: string | null; image_path: string | null;
      orig_w: number; orig_h: number; scale_px_per_cm: number | null;
      wall_w_cm: number | null; wall_h_cm: number | null; wall_color: string | null;
      approved: boolean; approved_at: string | null;
      foreground_masks?: any[] | null; client_notes?: string | null;
      skew_tl_x?: number | null; skew_tl_y?: number | null;
      skew_tr_x?: number | null; skew_tr_y?: number | null;
      skew_br_x?: number | null; skew_br_y?: number | null;
      skew_bl_x?: number | null; skew_bl_y?: number | null;
      skew_active?: boolean;
      artworks: Array<Record<string, unknown>>;
    }) => {
      const imageUrl = opt.image_path ? (elevMap.get(opt.image_path) ?? null) : null
      const artworks = placementsToArtworks(opt.artworks, artUrlFor)
      return { ...opt, imageUrl, artworks, clientNotes: opt.client_notes ?? '', ...readOptionNoteFields(opt as unknown as Record<string, unknown>) }
    })
    // Sorted and lettered by position, in the same one place the studio uses (src/lib/options.ts).
    return { ...elev, elevation_options: labelOptions(options), clientPickedOption: (elev as any).client_picked_option ?? null }
  })

  const budget: ProjectBudget | null = budgetRow
    ? {
        id: budgetRow.id,
        projectId: budgetRow.project_id,
        installation: budgetRow.installation ?? { indicative: true, confirmedAmount: null },
        consultantFee: budgetRow.consultant_fee ?? null,
        customLineItems: budgetRow.custom_line_items ?? [],
        vatIncludedDefault: budgetRow.vat_included_default ?? false,
        createdAt: budgetRow.created_at,
        updatedAt: budgetRow.updated_at,
      }
    : null

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
      budget={budget}
    />
  )
}
