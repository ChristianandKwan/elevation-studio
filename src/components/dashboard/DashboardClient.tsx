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

interface DashArtwork {
  id: string
  imageUrl: string | null
  xF: number
  yF: number
  wCm: number
  hCm: number
}

interface DashProject {
  id: string
  name: string
  client_name: string
  status: string
  thumbnailUrl: string | null
  elevCount: number
  artCount: number
  artworks: DashArtwork[]
  origW: number
  origH: number
  scalePxPerCm: number | null
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
  const [newElevName, setNewElevName] = useState('')
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
    const elevName = newElevName.trim()
    if (!name || !elevName) return
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
      .insert({ project_id: project.id, name: elevName, display_order: 0 })
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

    setNewName(''); setNewClient(''); setNewElevName(''); setShowModal(false); setCreating(false)
    showStatus(`Project "${name}" created`)
    router.push(`/projects/${project.id}`)
  }

  async function archiveProject(id: string) {
    const supabase = createClient()
    await supabase.from('projects').update({ archived: true }).eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
    setMenuOpenId(null)
    showStatus('Project archived')
  }

  async function deleteProject(id: string) {
    setDeleting(true)
    const supabase = createClient()

    // Fetch all elevation image paths
    const { data: elevOpts } = await supabase
      .from('elevation_options')
      .select('image_path, elevations!inner(project_id)')
      .eq('elevations.project_id', id)

    // Fetch all artwork image paths
    const { data: artworks } = await supabase
      .from('artworks')
      .select('image_path, elevation_options!inner(elevations!inner(project_id))')
      .eq('elevation_options.elevations.project_id', id)

    // Delete elevation images from storage
    const elevPaths = (elevOpts ?? []).map((o: { image_path: string | null }) => o.image_path).filter(Boolean) as string[]
    if (elevPaths.length) {
      await supabase.storage.from('elevation-images').remove(elevPaths)
    }

    // Delete artwork images from storage
    const artPaths = (artworks ?? []).map((a: { image_path: string | null }) => a.image_path).filter(Boolean) as string[]
    if (artPaths.length) {
      await supabase.storage.from('artwork-images').remove(artPaths)
    }

    // Delete the project (cascades all DB records)
    await supabase.from('projects').delete().eq('id', id)

    setProjects(prev => prev.filter(p => p.id !== id))
    setConfirmDeleteId(null)
    setMenuOpenId(null)
    setDeleting(false)
    showStatus('Project deleted')
  }

  const statusLabels: Record<string, string> = { draft: 'Draft', sent: 'Sent to client', approved: 'Approved' }

  return (
    <>
      <div>
        {/* Header */}
        <div className="dash-header">
          <img src="/ck-wordmark-black.png" alt="Christian & Kwan" className="dash-logo" />
          <div className="header-app-title">Elevation Studio</div>
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

          <div className="projects-grid" onClick={() => setMenuOpenId(null)}>
            {projects.map(p => (
              <div
                key={p.id}
                className="project-card"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <div className="project-card-thumb" style={{ position: 'relative' }}>
                  {p.thumbnailUrl
                    ? <>
                        <img src={p.thumbnailUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        {/* Artwork overlays */}
                        {p.artworks.map(art => {
                          if (!art.imageUrl || !p.origW || !p.origH || !p.scalePxPerCm) return null
                          // artwork display width as fraction of elevation orig width
                          const wFrac = (art.wCm * p.scalePxPerCm) / p.origW
                          const hFrac = (art.hCm * p.scalePxPerCm) / p.origH
                          return (
                            <img
                              key={art.id}
                              src={art.imageUrl}
                              alt=""
                              style={{
                                position: 'absolute',
                                left: `${art.xF * 100}%`,
                                top: `${art.yF * 100}%`,
                                width: `${wFrac * 100}%`,
                                height: `${hFrac * 100}%`,
                                objectFit: 'contain',
                                pointerEvents: 'none',
                              }}
                            />
                          )
                        })}
                      </>
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
                {/* Kebab menu */}
                <div className="project-card-menu-wrap" onClick={e => e.stopPropagation()}>
                  <button
                    className="project-card-menu-btn"
                    onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === p.id ? null : p.id) }}
                    title="Project options"
                  >⋯</button>
                  {menuOpenId === p.id && (
                    <div className="project-card-dropdown">
                      <button onClick={() => archiveProject(p.id)}>Archive</button>
                      <button className="danger" onClick={() => { setConfirmDeleteId(p.id); setMenuOpenId(null) }}>Delete</button>
                    </div>
                  )}
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
            <div className="field">
              <label className="field-label">First Elevation Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                className="field-input"
                value={newElevName}
                onChange={e => setNewElevName(e.target.value)}
                placeholder="e.g. Living Room, North Wall"
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setShowModal(false); setNewName(''); setNewClient(''); setNewElevName('') }}>Cancel</button>
              <button className="btn btn-primary" onClick={createProject} disabled={creating || !newName.trim() || !newElevName.trim()}>
                {creating ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div className="modal-bg open" onClick={() => !deleting && setConfirmDeleteId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Delete Project</div>
            <div className="modal-sub" style={{ color: 'var(--red)' }}>
              This will permanently delete the project and all its images. This cannot be undone.
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setConfirmDeleteId(null)} disabled={deleting}>Cancel</button>
              <button className="btn btn-danger" onClick={() => deleteProject(confirmDeleteId)} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <StatusToast message={toast} />
    </>
  )
}
