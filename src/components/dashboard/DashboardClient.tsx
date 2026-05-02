'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { timeNow } from '@/lib/utils'
import StatusToast from '@/components/ui/StatusToast'
import { ArcSpinner } from '@/components/ui/Spinner'
import FeedbackButton from '@/components/feedback/FeedbackButton'

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
  artworks: unknown[]
  origW: number
  origH: number
  scalePxPerCm: number | null
  pickedCount: number
  approvedCount: number
}

interface Props {
  profile: DashProfile
  projects: DashProject[]
}

export default function DashboardClient({ profile, projects: initialProjects }: Props) {
  const router = useRouter()
  const [projects, setProjects] = useState(initialProjects)

  // Sync active projects when server re-renders (e.g. after router.refresh())
  useEffect(() => {
    setProjects(initialProjects)
  }, [initialProjects])
  const [showModal, setShowModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClient, setNewClient] = useState('')
  const [newBudget, setNewBudget] = useState('')
  const [newElevName, setNewElevName] = useState('')
  const [creating, setCreating] = useState(false)
  const [toast, setToast] = useState('')
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [renameProjectId, setRenameProjectId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [archivedProjects, setArchivedProjects] = useState<{ id: string; name: string; client_name: string; status: string }[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [archivedLoaded, setArchivedLoaded] = useState(false)

  // Close kebab menu when clicking anywhere outside it
  useEffect(() => {
    if (!menuOpenId) return
    function handleOutsideClick() { setMenuOpenId(null) }
    document.addEventListener('click', handleOutsideClick)
    return () => document.removeEventListener('click', handleOutsideClick)
  }, [menuOpenId])

  // Escape closes whichever modal is open
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (showModal) { setShowModal(false); setNewName(''); setNewClient(''); setNewBudget(''); setNewElevName('') }
      else if (renameProjectId && !renaming) setRenameProjectId(null)
      else if (confirmDeleteId && !deleting) setConfirmDeleteId(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showModal, renameProjectId, renaming, confirmDeleteId, deleting])

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
    const budgetVal = parseFloat(newBudget)
    const budget = !isNaN(budgetVal) && budgetVal > 0 ? budgetVal : null

    const { data: projectId, error } = await supabase.rpc('create_project', {
      p_name: name,
      p_client_name: newClient.trim() || 'Unnamed client',
      p_budget: budget,
      p_elev_name: elevName,
      p_profile_name: profile.name,
    })

    if (error || !projectId) { showStatus('Failed to create project'); setCreating(false); return }

    setNewName(''); setNewClient(''); setNewBudget(''); setNewElevName(''); setShowModal(false); setCreating(false)
    showStatus(`Project "${name}" created`)
    router.push(`/projects/${projectId}`)
  }

  async function archiveProject(id: string) {
    const supabase = createClient()
    await supabase.from('projects').update({ archived: true }).eq('id', id)
    setProjects(prev => prev.filter(p => p.id !== id))
    setMenuOpenId(null)
    showStatus('Project archived')
  }

  async function loadArchivedProjects() {
    setLoadingArchived(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingArchived(false); return }
    const { data } = await supabase
      .from('projects')
      .select('id, name, client_name, status')
      .eq('consultant_id', user.id)
      .eq('archived', true)
      .order('created_at', { ascending: false })
    setArchivedProjects(data ?? [])
    setLoadingArchived(false)
    setArchivedLoaded(true)
  }

  async function unarchiveProject(id: string) {
    const supabase = createClient()
    await supabase.from('projects').update({ archived: false }).eq('id', id)
    setArchivedProjects(prev => prev.filter(p => p.id !== id))
    setMenuOpenId(null)
    setView('active')
    showStatus('Project restored')
    router.refresh()
  }

  async function deleteProject(id: string) {
    setDeleting(true)
    const supabase = createClient()
    try {
      const { data, error } = await supabase.rpc('delete_project', { p_id: id })
      if (error) throw error

      const { elev_paths, thumb_paths, art_paths } = data as {
        elev_paths: string[]
        thumb_paths: string[]
        art_paths: string[]
      }

      // Storage removes are best-effort — DB row is already gone
      await Promise.all([
        elev_paths.length  ? supabase.storage.from('elevation-images').remove(elev_paths)  : Promise.resolve(),
        thumb_paths.length ? supabase.storage.from('thumbnails').remove(thumb_paths)        : Promise.resolve(),
        art_paths.length   ? supabase.storage.from('artwork-images').remove(art_paths)      : Promise.resolve(),
      ])

      setProjects(prev => prev.filter(p => p.id !== id))
      setArchivedProjects(prev => prev.filter(p => p.id !== id))
      setConfirmDeleteId(null)
      setMenuOpenId(null)
      showStatus('Project deleted')
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? 'unknown'
      showStatus(`Delete failed: ${msg}`)
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  async function renameProject(id: string, name: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    setRenaming(true)
    const supabase = createClient()
    await supabase.from('projects').update({ name: trimmed }).eq('id', id)
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: trimmed } : p))
    setRenameProjectId(null)
    setRenaming(false)
    showStatus('Project renamed')
  }

  function projectStatusLabel(p: DashProject): string {
    if (p.elevCount > 0 && p.approvedCount >= p.elevCount) return 'Client Final'
    if (p.approvedCount > 0) return `${p.approvedCount}/${p.elevCount} approved`
    if (p.pickedCount > 0) return `${p.pickedCount}/${p.elevCount} picked`
    if (p.status === 'sent') return 'Sent to Client'
    return 'Draft'
  }

  function projectStatusClass(p: DashProject): string {
    if (p.elevCount > 0 && p.approvedCount >= p.elevCount) return 'badge-approved'
    if (p.approvedCount > 0) return 'badge-sent'
    if (p.pickedCount > 0) return 'badge-sent'
    if (p.status === 'sent') return 'badge-sent'
    return 'badge-draft'
  }

  return (
    <>
      <div>
        {/* Header */}
        <div className="dash-header">
          <Image
            src="/ck-wordmark-black.png"
            alt="Christian & Kwan"
            className="dash-logo"
            width={224}
            height={112}
            preload
          />
          <div className="header-app-title">Elevation Studio</div>
          <div className="dash-user">
            <FeedbackButton />
            <button className="btn btn-ghost btn-sm" onClick={handleLogout}>Sign out</button>
          </div>
        </div>

        {/* Body */}
        <div className="dash-body">
          <div className="dash-section-header">
            <div>
              <div className="dash-kicker">Projects</div>
              <h1 className="dash-section-title">Your Work</h1>
            </div>
            <div className="dash-view-tabs">
              <button
                className={`dash-view-tab${view === 'active' ? ' active' : ''}`}
                onClick={() => setView('active')}
              >Active</button>
              <button
                className={`dash-view-tab${view === 'archived' ? ' active' : ''}`}
                onClick={() => {
                  setView('archived')
                  if (!archivedLoaded) loadArchivedProjects()
                }}
              >Archived</button>
            </div>
          </div>

          {view === 'archived' ? (
            <div className="projects-grid">
              {loadingArchived ? (
                <div style={{ position: 'relative', minHeight: 120, gridColumn: '1 / -1' }}>
                  <ArcSpinner />
                </div>
              ) : archivedProjects.length === 0 ? (
                <div style={{ color: 'var(--mid)', padding: '1rem' }}>No archived projects.</div>
              ) : archivedProjects.map(p => (
                <div key={p.id} className="project-card project-card--archived">
                  <div className="project-card-thumb">
                    <div className="project-card-thumb-placeholder">
                      <span>{p.name.charAt(0)}</span>
                    </div>
                  </div>
                  <div className="project-card-body">
                    <div className="project-card-name">{p.name}</div>
                    <div className="project-card-client">{p.client_name}</div>
                    <div className="project-card-meta">
                      <span className="project-card-badge badge-draft">
                        {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                      </span>
                      <span style={{ color: 'var(--mid)', fontSize: '0.75rem' }}>Archived</span>
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
                        <button onClick={() => unarchiveProject(p.id)}>Restore</button>
                        <button className="danger" onClick={() => { setConfirmDeleteId(p.id); setMenuOpenId(null) }}>Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (

          <div className="projects-grid">
            {/* New Project card */}
            <div className="project-card-new" onClick={() => setShowModal(true)}>
              <div className="project-card-new-icon">+</div>
              <div className="project-card-new-label">New Project</div>
            </div>

            {projects.map(p => (
              <div
                key={p.id}
                className="project-card"
                onClick={() => router.push(`/projects/${p.id}`)}
              >
                <div className="project-card-thumb">
                  {p.thumbnailUrl
                    ? <Image src={p.thumbnailUrl} alt={p.name} fill unoptimized style={{ objectFit: 'cover' }} />
                    : <div className="project-card-thumb-placeholder"><span>{p.name.charAt(0)}</span></div>
                  }
                </div>
                <div className="project-card-body">
                  <div className="project-card-name">{p.name}</div>
                  <div className="project-card-client">{p.client_name}</div>
                  <div className="project-card-meta">
                    <span className={`project-card-badge ${projectStatusClass(p)}`}>
                      {projectStatusLabel(p)}
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
                      <button onClick={() => { setRenameProjectId(p.id); setRenameName(p.name); setMenuOpenId(null) }}>Rename</button>
                      <button onClick={() => archiveProject(p.id)}>Archive</button>
                      <button className="danger" onClick={() => { setConfirmDeleteId(p.id); setMenuOpenId(null) }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          )}
        </div>
      </div>

      {/* New Project Modal */}
      {showModal && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <div className="modal-title">New Project</div>
            <div className="modal-sub">Create a new art placement project for a client.</div>
            <div className="field">
              <label className="field-label" htmlFor="np-name">Project Name</label>
              <input
                id="np-name"
                className="field-input"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Chelsea Residence – Living Room"
                onKeyDown={e => e.key === 'Enter' && createProject()}
                autoFocus
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="np-client">Client Name</label>
              <input
                id="np-client"
                className="field-input"
                value={newClient}
                onChange={e => setNewClient(e.target.value)}
                placeholder="e.g. Mr & Mrs Hamilton"
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="np-budget">Budget (£, optional)</label>
              <input
                id="np-budget"
                type="number"
                className="field-input"
                value={newBudget}
                onChange={e => setNewBudget(e.target.value)}
                placeholder="e.g. 25000"
                min={0}
                step={500}
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="np-elev">First Elevation Name <span style={{ color: 'var(--red)' }}>*</span></label>
              <input
                id="np-elev"
                className="field-input"
                value={newElevName}
                onChange={e => setNewElevName(e.target.value)}
                placeholder="e.g. Living Room, North Wall"
                onKeyDown={e => e.key === 'Enter' && createProject()}
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => { setShowModal(false); setNewName(''); setNewClient(''); setNewBudget(''); setNewElevName('') }}>Cancel</button>
              <button className="btn btn-primary" onClick={createProject} disabled={creating || !newName.trim() || !newElevName.trim()}>
                {creating ? 'Creating…' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename project modal */}
      {renameProjectId && (
        <div className="modal-bg open" onClick={e => { if (e.target === e.currentTarget && !renaming) setRenameProjectId(null) }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Rename Project</div>
            <div className="field">
              <label className="field-label" htmlFor="rn-name">Project Name</label>
              <input
                id="rn-name"
                className="field-input"
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && renameProject(renameProjectId, renameName)}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRenameProjectId(null)} disabled={renaming}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => renameProject(renameProjectId, renameName)}
                disabled={renaming || !renameName.trim()}
              >
                {renaming ? 'Saving…' : 'Save'}
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
