'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { timeNow } from '@/lib/utils'
import StatusToast from '@/components/ui/StatusToast'

interface DashProfile {
  id: string
  name: string
  initials: string
  role: string
}

interface DashProject {
  id: string
  name: string
  client_name: string
  status: string
  thumbnailUrl: string | null
  elevCount: number
  artCount: number
}

interface Props {
  profile: DashProfile
  projects: DashProject[]
}

export default function DashboardClient({ profile, projects: initialProjects }: Props) {
  const router = useRouter()
  const [projects, setProjects] = useState(initialProjects)
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClient, setNewClient] = useState('')
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')

  function showStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function createProject() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Create project
    const { data: project, error: pErr } = await supabase
      .from('projects')
      .insert({ name, client_name: newClient.trim() || 'Unnamed client', consultant_id: user.id })
      .select()
      .single()

    if (pErr || !project) { showStatus('Failed to create project'); setCreating(false); return }

    // Create first elevation
    const { data: elevation, error: eErr } = await supabase
      .from('elevations')
      .insert({ project_id: project.id, name: 'Main Elevation', display_order: 0 })
      .select()
      .single()

    if (eErr || !elevation) { showStatus('Failed to create elevation'); setCreating(false); return }

    // Create A + B options
    await supabase.from('elevation_options').insert([
      { elevation_id: elevation.id, option: 'A' },
      { elevation_id: elevation.id, option: 'B' },
    ])

    // Log activity
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'created',
      text: `Project created by ${profile.name}`,
    })

    setNewName(''); setNewClient(''); setShowModal(false); setCreating(false)
    showStatus(`Project "${name}" created`)
    router.push(`/projects/${project.id}`)
  }

  const statusLabels: Record<string, string> = { draft: 'Draft', sent: 'Sent to client', approved: 'Approved' }

  return (
    <>
      <div>
        {/* Header */}
        <div className="dash-header">
          <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 22, fontWeight: 400, letterSpacing: '0.08em' }}>
            ELEVATION STUDIO
          </div>
          <div className="dash-user">
            <span>Signed in as</span>
            <span className="dash-user-name">{profile.name}</span>
            <div className="dash-avatar">{profile.initials}</div>
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Sign out</button>
          </div>
        </div>

        {/* Body */}
        <div className="dash-body">
          <div className="dash-section-header">
            <div>
              <div className="dash-kicker">Projects</div>
              <div className="dash-section-title">Your Work</div>
            </div>
          </div>

          <div className="projects-grid">
            {projects.map(p => (
              <div
                key={p.id}
                className="project-card"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <div className="project-card-thumb">
                  {p.thumbnailUrl
                    ? <img src={p.thumbnailUrl} alt={p.name} />
                    : <div className="project-card-thumb-empty">⬜</div>
                  }
                </div>
                <div className="project-card-body">
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-client">{p.client_name}</div>
                  <div className="project-card-meta">
                    <span className={`project-card-badge badge-${p.status}`}>
                      {statusLabels[p.status] ?? p.status}
                    </span>
                    <span>{p.elevCount} elevation{p.elevCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* New Project card */}
            <div className="project-card-new" onClick={() => setShowModal(true)}>
              <div className="project-card-new-icon">+</div>
              <div className="project-card-new-label">New Project</div>
            </div>
          </div>
        </div>
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <div className="modal-title">New Project</div>
            <div className="modal-sub">Create a new art placement project for a client.</div>
            <div className="field">
              <label className="field-label">Project Name</label>
              <input
                className="field-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Chelsea Residence – Living Room"
                onKeyDown={e => e.key === 'Enter' && createProject()}
                autoFocus
              />
            </div>
            <div className="field">
              <label className="field-label">Client Name</label>
              <input
                className="field-input"
                value={newClient}
                onChange={e => setNewClient(e.target.value)}
                placeholder="e.g. Mr & Mrs Hamilton"
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createProject} disabled={creating || !newName.trim()}>
                {creating ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusToast message={toast} />
    </>
  )
}
