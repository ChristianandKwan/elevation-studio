import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await request.json()
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  // Verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('consultant_id', user.id)
    .single()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Check for existing valid token
  const { data: existing } = await supabase
    .from('client_tokens')
    .select('token')
    .eq('project_id', projectId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({ token: existing.token })
  }

  // Create new token
  const { data: tokenRow, error } = await supabase
    .from('client_tokens')
    .insert({ project_id: projectId })
    .select('token')
    .single()

  if (error || !tokenRow) {
    return NextResponse.json({ error: 'Failed to create token' }, { status: 500 })
  }

  // Update project status + log activity
  await Promise.all([
    supabase.from('projects').update({ status: 'sent' }).eq('id', projectId),
    supabase.from('activity_logs').insert({
      project_id: projectId,
      type: 'link',
      text: 'Client link generated',
    }),
  ])

  return NextResponse.json({ token: tokenRow.token })
}
