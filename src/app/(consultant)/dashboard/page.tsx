import { createClient, createServiceClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/dashboard/DashboardClient'
import sharp from 'sharp'

const THUMB_W = 600 // max thumbnail width in pixels

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

async function buildThumbnail(
  elevUrl: string,
  artworks: Array<{ url: string; xF: number; yF: number; wCm: number; hCm: number }>,
  origW: number,
  origH: number,
  scalePxPerCm: number | null
): Promise<string | null> {
  try {
    const elevBuf = await fetchBuffer(elevUrl)
    if (!elevBuf) return null

    const scale = THUMB_W / origW
    const thumbH = Math.round(origH * scale)

    // If no scale, just return the plain elevation thumbnail
    if (!scalePxPerCm || artworks.length === 0) {
      const buf = await sharp(elevBuf).resize(THUMB_W, thumbH, { fit: 'fill' }).png().toBuffer()
      return `data:image/png;base64,${buf.toString('base64')}`
    }

    // Build composite overlays
    const compositeInputs: sharp.OverlayOptions[] = []
    for (const art of artworks) {
      try {
        const artBuf = await fetchBuffer(art.url)
        if (!artBuf) continue
        const artOrigW = Math.round(art.wCm * scalePxPerCm)
        const artOrigH = Math.round(art.hCm * scalePxPerCm)
        const artThumbW = Math.max(1, Math.round(artOrigW * scale))
        const artThumbH = Math.max(1, Math.round(artOrigH * scale))
        const left = Math.round(art.xF * THUMB_W)
        const top = Math.round(art.yF * thumbH)
        const resized = await sharp(artBuf).resize(artThumbW, artThumbH, { fit: 'fill' }).png().toBuffer()
        compositeInputs.push({ input: resized, left, top, blend: 'over' })
      } catch { /* skip failed artwork */ }
    }

    const elevResized = await sharp(elevBuf).resize(THUMB_W, thumbH, { fit: 'fill' }).png().toBuffer()
    const buf = await sharp(elevResized).composite(compositeInputs).png().toBuffer()
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch { return null }
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const supabaseService = await createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()

  // Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single()

  // Fetch projects with elevations count + first thumbnail path + artworks for preview + approval status
  const { data: projects } = await supabase
    .from('projects')
    .select(`
      id, name, client_name, status, created_at,
      elevations(
        id, client_picked_option, display_order,
        elevation_options(
          id, option, image_path, orig_w, orig_h, scale_px_per_cm, approved,
          artworks(id, image_path, x_fraction, y_fraction, w_cm, h_cm, visible)
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

      if (firstOption?.image_path) {
        const { data: elevSigned } = await supabaseService.storage
          .from('elevation-images')
          .createSignedUrl(firstOption.image_path, 3600)

        if (elevSigned?.signedUrl && origW > 0 && origH > 0) {
          // Build signed URLs for visible artworks
          const visibleArts = (firstOption.artworks ?? []).filter((a: { visible: boolean }) => a.visible)
          const artworkEntries = await Promise.all(
            visibleArts.map(async (a: { image_path: string; x_fraction: number; y_fraction: number; w_cm: number; h_cm: number }) => {
              const { data: artSigned } = await supabaseService.storage
                .from('artwork-images')
                .createSignedUrl(a.image_path, 3600)
              return {
                url: artSigned?.signedUrl ?? '',
                xF: a.x_fraction,
                yF: a.y_fraction,
                wCm: a.w_cm,
                hCm: a.h_cm,
              }
            })
          )
          const validArts = artworkEntries.filter(a => a.url)
          thumbnailUrl = await buildThumbnail(elevSigned.signedUrl, validArts, origW, origH, scalePxPerCm)
          // Fall back to plain elevation URL if compositing failed
          if (!thumbnailUrl) thumbnailUrl = elevSigned.signedUrl
        }
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
        artworks: [],   // no longer needed — composited into thumbnail
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
