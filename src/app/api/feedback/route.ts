/**
 * POST /api/feedback
 *
 * Accepts a consultant feedback report from <FeedbackButton /> and emails
 * it to FEEDBACK_TO_EMAIL via Resend. The fixed subject line is the hook
 * the recipient filters their inbox on.
 *
 * Auth: the route requires a signed-in Supabase user (same check as
 * other consultant-only endpoints). The user's email is included in the
 * body so it's obvious who reported what.
 */
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SUBJECT = 'Elevation Studio - Consultant Feedback Log'

interface ConsoleEntry { t: string; level: string; text: string }
interface ErrorEntry { t: string; message: string; stack?: string; source?: string }
interface NetworkEntry { t: string; method: string; url: string; status: number; ms: number; body?: string }

interface Payload {
  kind: 'bug' | 'feature' | 'other'
  description: string
  route: string
  href: string
  userAgent: string
  viewport: string
  logs: {
    console: ConsoleEntry[]
    errors: ErrorEntry[]
    network: NetworkEntry[]
  }
  screenshot: string | null
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderHtml(p: Payload, email: string, userId: string): string {
  const ts = new Date().toISOString()
  const consoleRows = p.logs.console.slice(-60).map(e =>
    `<tr><td style="color:#7A746E;white-space:nowrap;padding-right:8px">${e.t.slice(11, 19)}</td><td style="color:#7A746E;padding-right:8px">${e.level}</td><td><pre style="margin:0;white-space:pre-wrap">${escapeHtml(e.text)}</pre></td></tr>`
  ).join('') || '<tr><td colspan="3" style="color:#7A746E">(none)</td></tr>'

  const errorRows = p.logs.errors.map(e =>
    `<div style="margin-bottom:8px"><div style="color:#7A746E;font-size:11px">${e.t} — ${e.source || ''}</div><pre style="margin:2px 0;white-space:pre-wrap">${escapeHtml(e.message)}${e.stack ? '\n' + escapeHtml(e.stack) : ''}</pre></div>`
  ).join('') || '<div style="color:#7A746E">(none)</div>'

  const networkRows = p.logs.network.slice(-40).map(e =>
    `<tr><td style="color:#7A746E;white-space:nowrap;padding-right:8px">${e.t.slice(11, 19)}</td><td style="padding-right:8px">${e.method}</td><td style="padding-right:8px;color:${e.status >= 400 || e.status === 0 ? '#b94040' : '#2E6B4F'}">${e.status || 'ERR'}</td><td style="padding-right:8px">${e.ms}ms</td><td><pre style="margin:0;white-space:pre-wrap;word-break:break-all">${escapeHtml(e.url)}${e.body ? '\n' + escapeHtml(e.body) : ''}</pre></td></tr>`
  ).join('') || '<tr><td colspan="5" style="color:#7A746E">(none)</td></tr>'

  return `<!doctype html>
<html>
<body style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:#1C1A18;background:#F7F4EF;padding:20px">
  <h1 style="font-family:Georgia,serif;font-size:22px;margin:0 0 6px">Consultant Feedback — ${escapeHtml(p.kind)}</h1>
  <div style="color:#7A746E;font-size:11px;margin-bottom:18px">${ts}</div>

  <table style="border-collapse:collapse;margin-bottom:18px">
    <tr><td style="color:#7A746E;padding-right:10px">From</td><td>${escapeHtml(email)} <span style="color:#7A746E">(${escapeHtml(userId)})</span></td></tr>
    <tr><td style="color:#7A746E;padding-right:10px">Route</td><td>${escapeHtml(p.route)}</td></tr>
    <tr><td style="color:#7A746E;padding-right:10px">URL</td><td>${escapeHtml(p.href)}</td></tr>
    <tr><td style="color:#7A746E;padding-right:10px">Viewport</td><td>${escapeHtml(p.viewport)}</td></tr>
    <tr><td style="color:#7A746E;padding-right:10px;vertical-align:top">UA</td><td>${escapeHtml(p.userAgent)}</td></tr>
  </table>

  <h2 style="font-family:Georgia,serif;font-size:16px;margin:20px 0 6px">Description</h2>
  <pre style="background:#FDFBF9;border:1px solid #E3DED7;padding:10px;white-space:pre-wrap;margin:0">${escapeHtml(p.description)}</pre>

  <h2 style="font-family:Georgia,serif;font-size:16px;margin:20px 0 6px">Errors (${p.logs.errors.length})</h2>
  <div style="background:#FDFBF9;border:1px solid #E3DED7;padding:10px">${errorRows}</div>

  <h2 style="font-family:Georgia,serif;font-size:16px;margin:20px 0 6px">Network (last ${Math.min(p.logs.network.length, 40)} of ${p.logs.network.length})</h2>
  <div style="background:#FDFBF9;border:1px solid #E3DED7;padding:10px;overflow-x:auto">
    <table style="border-collapse:collapse;font-size:11px;width:100%">${networkRows}</table>
  </div>

  <h2 style="font-family:Georgia,serif;font-size:16px;margin:20px 0 6px">Console (last ${Math.min(p.logs.console.length, 60)} of ${p.logs.console.length})</h2>
  <div style="background:#FDFBF9;border:1px solid #E3DED7;padding:10px;overflow-x:auto">
    <table style="border-collapse:collapse;font-size:11px;width:100%">${consoleRows}</table>
  </div>

  ${p.screenshot ? `<h2 style="font-family:Georgia,serif;font-size:16px;margin:20px 0 6px">Screenshot</h2><p style="color:#7A746E;font-size:11px;margin:0 0 8px">Attached as screenshot.jpg.</p>` : ''}
</body>
</html>`
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.FEEDBACK_TO_EMAIL
  if (!apiKey || !to) {
    return NextResponse.json({ error: 'Feedback email is not configured on the server.' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: Payload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!payload?.description?.trim()) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 })
  }

  const attachments: Array<{ filename: string; content: string }> = []
  if (payload.screenshot && payload.screenshot.startsWith('data:image/')) {
    const base64 = payload.screenshot.split(',')[1]
    if (base64) attachments.push({ filename: 'screenshot.jpg', content: base64 })
  }
  // Also attach the raw logs as JSON so the fix-side can grep easily.
  attachments.push({
    filename: 'logs.json',
    content: Buffer.from(JSON.stringify(payload.logs, null, 2), 'utf8').toString('base64'),
  })

  const resend = new Resend(apiKey)
  const email = user.email || '(unknown email)'

  const { error } = await resend.emails.send({
    from: 'Elevation Studio <onboarding@resend.dev>',
    to,
    replyTo: user.email || undefined,
    subject: SUBJECT,
    html: renderHtml(payload, email, user.id),
    attachments,
  })

  if (error) {
    console.error('[feedback] Resend error', error)
    return NextResponse.json({ error: error.message || 'Email send failed' }, { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
