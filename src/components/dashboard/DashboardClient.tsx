'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { EXPORTS_BUCKET, exportObjectPath } from '@/lib/export/bucket'
import { timeNow, PRACTICE_NAME } from '@/lib/utils'
import StatusToast from '@/components/ui/StatusToast'
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
  /** Elevations the client can see — what picked/approved progress is out of. */
  shownCount: number
  origW: number
  origH: number
  scalePxPerCm: number | null
  pickedCount: number
  approvedCount: number
}

interface Props {
  profile: DashProfile
  projects: DashProject[]
  /** Which projects the server loaded: `?view=archived` asks for the archived ones. */
  view: 'active' | 'archived'
}

/**
 * A project card's picture, faded in when it arrives. Each card goes on its
 * own — they are separate projects, and holding every card for the slowest
 * would be slower for no reason — so the grid fills in as a soft ripple
 * rather than popping up like dominoes. One that fails to load stays as the
 * card's plain dotted background.
 */
function CardThumb({ src, alt }: { src: string; alt: string }) {
  const [shown, setShown] = useState(false)
  // A picture the browser already had can finish before this page's
  // JavaScript is running, and then no load event arrives. Checking on mount
  // catches it, so it is never left invisible.
  const seen = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setShown(true)
  }, [])
  return (
    <Image
      ref={seen}
      src={src}
      alt={alt}
      fill
      unoptimized
      className={`project-card-img${shown ? ' shown' : ''}`}
      style={{ objectFit: 'cover' }}
      onLoad={() => setShown(true)}
    />
  )
}

export default function DashboardClient({ profile, projects: initialProjects, view }: Props) {
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
  const [renameClient, setRenameClient] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [switchingView, startViewSwitch] = useTransition()

  /**
   * Active and archived are the same page loaded twice — `?view=archived`
   * has the server build the archived cards exactly as it builds the active
   * ones, pictures and progress included.
   */
  function switchView(next: 'active' | 'archived') {
    if (next === view) return
    setMenuOpenId(null)
    startViewSwitch(() => router.push(next === 'archived' ? '/dashboard?view=archived' : '/dashboard'))
  }

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
      // The RPC uses this only to write "Project created by …" into
      // activity_logs, so it gets the practice name for the same reason the
      // other log writers do — the shared info@ login is not a useful author.
      p_profile_name: PRACTICE_NAME,
    })

    if (error || !projectId) { showStatus('Failed to create project'); setCreating(false); return }

    setNewName(''); setNewClient(''); setNewBudget(''); setNewElevName(''); setShowModal(false); setCreating(false)
    showStatus(`Project "${name}" created`)
    router.push(`/projects/${projectId}`)
  }

  async function archiveProject(id: string) {
    const supabase = createClient()
    setMenuOpenId(null)
    const { error } = await supabase.from('projects').update({ archived: true }).eq('id', id)
    if (error) { showStatus('Could not archive the project — please try again'); return }
    setProjects(prev => prev.filter(p => p.id !== id))
    showStatus('Project archived')
  }

  async function unarchiveProject(id: string) {
    const supabase = createClient()
    setMenuOpenId(null)
    const { error } = await supabase.from('projects').update({ archived: false }).eq('id', id)
    if (error) { showStatus('Could not restore the project — please try again'); return }
    setProjects(prev => prev.filter(p => p.id !== id))
    showStatus('Project restored')
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
        // The export pack, if one was ever built. Its path is the project id
        // and nothing records it, so there is no path list to return — and
        // nothing sweeps this bucket either: sweep-storage aborts on a bucket
        // where no file matches a live row, which every export is. If it is
        // not removed here it is not removed at all. See migration 036.
        supabase.storage.from(EXPORTS_BUCKET).remove([exportObjectPath(id)]),
      ])

      setProjects(prev => prev.filter(p => p.id !== id))
      setConfirmDeleteId(null)
      setMenuOpenId(null)
      showStatus('Project deleted')
    } catch {
      showStatus('Failed to delete project — please try again')
      setConfirmDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  /**
   * The project's name and its client's. The client's name is printed on the
   * budget and in the export, and it used to be fixed at creation — a blank
   * there became "Unnamed client" for good.
   */
  async function saveProjectDetails(id: string, name: string, clientName: string) {
    const trimmed = name.trim()
    if (!trimmed) return
    const client = clientName.trim() || 'Unnamed client'
    setRenaming(true)
    const supabase = createClient()
    const { error } = await supabase.from('projects').update({ name: trimmed, client_name: client }).eq('id', id)
    setRenaming(false)
    if (error) { showStatus('Could not save — please try again'); return }
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: trimmed, client_name: client } : p))
    setRenameProjectId(null)
    showStatus('Project details saved')
  }

  function projectStatusLabel(p: DashProject): string {
    if (p.shownCount > 0 && p.approvedCount >= p.shownCount) return 'Client Final'
    if (p.approvedCount > 0) return `${p.approvedCount}/${p.shownCount} approved`
    if (p.pickedCount > 0) return `${p.pickedCount}/${p.shownCount} picked`
    if (p.status === 'sent') return 'Sent to Client'
    return 'Draft'
  }

  function projectStatusClass(p: DashProject): string {
    if (p.shownCount > 0 && p.approvedCount >= p.shownCount) return 'badge-approved'
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
                onClick={() => switchView('active')}
              >Active</button>
              <button
                className={`dash-view-tab${view === 'archived' ? ' active' : ''}`}
                onClick={() => switchView('archived')}
              >Archived</button>
            </div>
          </div>

          <div className={`projects-grid${switchingView ? ' projects-grid--loading' : ''}`}>
            {view === 'active' && (
              <div className="project-card-new" onClick={() => setShowModal(true)}>
                <div className="project-card-new-icon">+</div>
                <div className="project-card-new-label">New Project</div>
              </div>
            )}
            {view === 'archived' && projects.length === 0 && (
              <div style={{ color: 'var(--mid)', padding: '1rem' }}>No archived projects.</div>
            )}

            {/* Archived projects are the same cards, faded and not opened on
                click — they used to be a separate, older design with no
                picture and the raw status word where the progress goes. */}
            {projects.map(p => (
              <div
                key={p.id}
                className={`project-card${view === 'archived' ? ' project-card--archived' : ''}`}
                onClick={view === 'active' ? () => router.push(`/projects/${p.id}`) : undefined}
              >
                <div className="project-card-thumb">
                  {p.thumbnailUrl
                    ? <CardThumb src={p.thumbnailUrl} alt={p.name} />
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
                      {view === 'active' ? (
                        <>
                          <button onClick={() => { setRenameProjectId(p.id); setRenameName(p.name); setRenameClient(p.client_name === 'Unnamed client' ? '' : p.client_name); setMenuOpenId(null) }}>Edit details…</button>
                          <button onClick={() => archiveProject(p.id)}>Archive</button>
                        </>
                      ) : (
                        <button onClick={() => unarchiveProject(p.id)}>Restore</button>
                      )}
                      <button className="danger" onClick={() => { setConfirmDeleteId(p.id); setMenuOpenId(null) }}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
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
              <label className="field-label" htmlFor="np-budget">Budget (£, exc VAT, optional)</label>
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
            <div className="modal-title">Project Details</div>
            <div className="field">
              <label className="field-label" htmlFor="rn-name">Project Name</label>
              <input
                id="rn-name"
                className="field-input"
                value={renameName}
                onChange={e => setRenameName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveProjectDetails(renameProjectId, renameName, renameClient)}
                autoFocus
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="rn-client">Client Name</label>
              <input
                id="rn-client"
                className="field-input"
                value={renameClient}
                onChange={e => setRenameClient(e.target.value)}
                placeholder="e.g. Mr & Mrs Hamilton"
                onKeyDown={e => e.key === 'Enter' && saveProjectDetails(renameProjectId, renameName, renameClient)}
              />
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setRenameProjectId(null)} disabled={renaming}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={() => saveProjectDetails(renameProjectId, renameName, renameClient)}
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
            <div className="modal-title">
              Delete {(() => {
                const name = projects.find(p => p.id === confirmDeleteId)?.name
                return name ? `“${name}”` : 'Project'
              })()}?
            </div>
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
