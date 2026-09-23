/**
 * POST /api/client-activity/send
 *
 * Emails the practice about clients who have been busy in the portal and
 * have since gone quiet. Called once a minute by the database's own clock
 * (pg_cron, migration 037), and only when something is due.
 *
 * Takes no key, on purpose: it can only send what is already due, to the
 * practice's own address, and every action is claimed by one atomic update
 * before it is emailed. Calling it early, twice, or from anywhere sends
 * nothing extra.
 */
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServiceClient } from '@/lib/supabase/server'
import { labelOptions } from '@/lib/options'
import { buildDigest, type DigestAction, type DigestElevation } from '@/lib/clientActivity'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// christianandkwan.com is verified in Resend (records added at Hostinger,
// 2026-09-23), so the email can come from the practice's own domain. Nothing
// receives mail at studio@ — replies go to info@, which is where it is sent.
const FROM = 'Elevation Studio <studio@christianandkwan.com>'
const TO = 'info@christianandkwan.com'

interface ClaimedRow {
  id: string
  project_id: string
  kind: DigestAction['kind']
  elevation_id: string | null
  option_id: string | null
  created_at: string
}

interface OptionRow {
  id: string; option: string; name: string | null
  sort_order: number | null; created_at: string | null
  image_path: string | null; wall_color: string | null
  approved: boolean; client_notes: string | null
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Email is not configured on the server.' }, { status: 500 })
  }

  const svc = createServiceClient()
  const { data: claimed, error: claimError } = await svc.rpc('claim_due_client_activity')
  if (claimError) {
    console.error('[client-activity] claim failed', claimError)
    return NextResponse.json({ error: 'Could not read the queue' }, { status: 500 })
  }
  const rows = (claimed ?? []) as ClaimedRow[]
  if (rows.length === 0) return NextResponse.json({ sent: 0 })

  const byProject = new Map<string, ClaimedRow[]>()
  for (const r of rows) byProject.set(r.project_id, [...(byProject.get(r.project_id) ?? []), r])

  const resend = new Resend(apiKey)
  const origin = new URL(request.url).origin
  let sent = 0

  for (const [projectId, actions] of byProject) {
    // Any failure below puts this project's actions back for the next minute.
    const release = async (why: unknown) => {
      console.error(`[client-activity] project ${projectId} not emailed`, why)
      await svc.rpc('release_client_activity', { p_ids: actions.map(a => a.id) })
    }
    try {
      const [projectRes, elevRes] = await Promise.all([
        svc.from('projects').select('name, status').eq('id', projectId).maybeSingle(),
        svc.from('elevations')
          .select('id, name, display_order, client_picked_option, elevation_options(id, option, name, sort_order, created_at, image_path, wall_color, approved, client_notes)')
          .eq('project_id', projectId)
          .eq('visible_to_client', true)
          .order('display_order', { ascending: true }),
      ])
      if (projectRes.error || elevRes.error) { await release(projectRes.error ?? elevRes.error); continue }
      // Deleted since: its actions went with it (cascade), and nobody wants the email.
      if (!projectRes.data) continue

      const elevations: DigestElevation[] = (elevRes.data ?? []).map(e => {
        // Lettered as the portal letters them — across every option — and
        // then only the ones with a wall, which are the ones the client saw.
        const labelled = labelOptions((e.elevation_options ?? []) as OptionRow[])
        const shown = labelled.filter(o => o.image_path || o.wall_color)
        const picked = labelled.find(o => o.option === e.client_picked_option)
        return {
          id: e.id as string,
          name: e.name as string,
          pickedOptionId: picked?.id ?? null,
          options: shown.map(o => ({
            id: o.id, title: o.title, approved: o.approved, clientNotes: o.client_notes ?? '',
          })),
        }
      })

      const digest = buildDigest(
        { name: projectRes.data.name, status: projectRes.data.status },
        elevations,
        actions.map(a => ({ kind: a.kind, elevationId: a.elevation_id, optionId: a.option_id, createdAt: a.created_at })),
        `${origin}/projects/${projectId}`,
      )
      if (!digest) continue

      const { error } = await resend.emails.send({
        from: FROM, to: TO, replyTo: TO, subject: digest.subject, html: digest.html, text: digest.text,
      })
      if (error) { await release(error); continue }
      sent++
    } catch (err) {
      await release(err)
    }
  }

  return NextResponse.json({ sent })
}
