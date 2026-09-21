'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useStudio } from '@/hooks/useStudio'
import StudioCanvas from './StudioCanvas'
import StudioSidebar from './StudioSidebar'
import TabBar from './TabBar'
import CalibrationModal from './CalibrationModal'
import AddArtworkModal from './AddArtworkModal'
import ShareModal from './ShareModal'
import StatusToast from '@/components/ui/StatusToast'
import { ArcSpinner, DrawLoader } from '@/components/ui/Spinner'
import BudgetScreen from '@/components/budget/BudgetScreen'
import FeedbackButton from '@/components/feedback/FeedbackButton'
import { timeNow, PRACTICE_NAME } from '@/lib/utils'
import type { Artwork, ActivityLog, Work } from '@/types'
import type { BudgetElevationData } from '@/components/budget/budgetCalc'
import { fmtGbp } from '@/components/budget/budgetCalc'
import { labelOptions, optionLabel, optionTitleFor, cleanOptionName, nextOptionKey, nextSortOrder } from '@/lib/options'
import { toWorkColumns, placementsOf, workFieldsOf } from '@/lib/works'
import type { WorkPatch, IndexElevation } from '@/lib/works'
import { uploadWork, type WorkMeta } from '@/lib/workUpload'
import IndexScreen from '@/components/index/IndexScreen'
import NotesScreen from '@/components/notes/NotesScreen'
import {
  noteRow, notesOn, rowToNote,
  type Note, type NoteAnchor, type NoteRow,
} from '@/lib/notes'
import {
  artistKey, canRenameTo, findArtistByName, sortArtists, tidyArtistName,
  type Artist,
} from '@/lib/artists'
import type { NotePatch } from '@/components/notes/NotePanel'

interface DbElevation {
  id: string
  name: string
  display_order: number
  clientPickedOption: string | null
  /** Off = the consultant is still working on it; the client portal and its budget leave it out. */
  visibleToClient: boolean
  elevation_options: Array<{
    id: string
    /** Stored key — identity only. The letter shown is derived from position (src/lib/options.ts). */
    option: string
    sort_order: number
    created_at?: string | null
    /** Optional consultant-given name shown instead of the letter */
    name?: string | null
    imageUrl: string | null
    imagePath: string | null
    /** The composited wall this option already caches for the dashboard. */
    thumbnailUrl?: string | null
    orig_w: number
    orig_h: number
    scale_px_per_cm: number | null
    /** Set instead of imagePath when this wall was entered as a measurement. */
    wall_w_cm?: number | null
    wall_h_cm?: number | null
    wall_color?: string | null
    approved: boolean
    approved_at: string | null
    foreground_masks: unknown
    clientNotes: string
    consultantNote: string
    consultantNoteShownToClient: boolean
    skew_tl_x?: number | null
    skew_tl_y?: number | null
    skew_tr_x?: number | null
    skew_tr_y?: number | null
    skew_br_x?: number | null
    skew_br_y?: number | null
    skew_bl_x?: number | null
    skew_bl_y?: number | null
    skew_active?: boolean
    artworks: Array<Artwork & { imageUrl: string | null }>
  }>
}

interface Props {
  project: { id: string; name: string; client_name: string; status: string; consultantName: string; budget: number | null }
  elevations: DbElevation[]
  existingToken: string | null
  /** True when this project's most recent client link has passed its expiry. */
  clientLinkExpired: boolean
  activityLogs: ActivityLog[]
  /** Every work in the project, placed or not. The index lists these. */
  initialWorks: Work[]
  /** Every note in the project, whatever it is anchored to. */
  initialNotes: Note[]
  /** Every artist the practice knows — the picker offers these. */
  initialArtists: Artist[]
}

type SkewOptData = Pick<DbElevation['elevation_options'][number],
  'skew_tl_x' | 'skew_tl_y' | 'skew_tr_x' | 'skew_tr_y' |
  'skew_br_x' | 'skew_br_y' | 'skew_bl_x' | 'skew_bl_y'>

/**
 * Whether this option has a wall to hang anything on yet — a photograph the
 * consultant uploaded, or a wall they typed the size of. The two are
 * alternatives, never both.
 */
function optHasWall(o: { imagePath: string | null; wall_color?: string | null }): boolean {
  return !!o.imagePath || !!o.wall_color
}

function buildSkewCorners(opt: SkewOptData): import('@/hooks/useStudio').SkewCorners | null {
  const { skew_tl_x: tlx, skew_tl_y: tly, skew_tr_x: trx, skew_tr_y: try_,
          skew_br_x: brx, skew_br_y: bry, skew_bl_x: blx, skew_bl_y: bly } = opt
  if (tlx == null || tly == null || trx == null || try_ == null ||
      brx == null || bry == null || blx == null || bly == null) return null
  return [[tlx, tly], [trx, try_], [brx, bry], [blx, bly]]
}

export default function StudioScreen({ project, elevations: initialElevations, existingToken, clientLinkExpired, activityLogs, initialWorks, initialNotes, initialArtists }: Props) {
  const router = useRouter()
  const [toast, setToast] = useState('')
  const [elevations, setElevations] = useState(initialElevations)
  const [activeElevId, setActiveElevId] = useState(initialElevations[0]?.id ?? '')
  const [activeOption, setActiveOption] = useState<string>(() => {
    const firstElev = initialElevations[0]
    return firstElev?.elevation_options[0]?.option ?? 'A'
  })
  const [shareToken, setShareToken] = useState(existingToken)
  // Warning stays until this session generates a replacement, or the consultant
  // dismisses it. Not persisted — it should reappear next time they open the
  // project if the link is still dead.
  const [expiryNoticeOpen, setExpiryNoticeOpen] = useState(clientLinkExpired)
  const [projectStatus, setProjectStatus] = useState(project.status)
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string> | null>(null)
  const [budget, setBudget] = useState<number | null>(project.budget)
  const [view, setView] = useState<'studio' | 'index' | 'budget' | 'notes'>('studio')
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [artists, setArtists] = useState<Artist[]>(initialArtists)
  // Every work in the project, placed or not. The index reads this; the
  // studio and budget read the copies folded into `elevations`.
  const [works, setWorks] = useState<Work[]>(initialWorks)
  const [showIndexAddModal, setShowIndexAddModal] = useState(false)
  const [pendingDeleteWorkId, setPendingDeleteWorkId] = useState<string | null>(null)
  // The works picked to be merged, and which of them survives. Null when the
  // confirmation is closed.
  const [pendingMerge, setPendingMerge] = useState<{ ids: string[]; keepId: string } | null>(null)
  const [isPreviewingClientView, setIsPreviewingClientView] = useState(false)
  const [returningToDashboard, setReturningToDashboard] = useState(false)
  const [showIntroLoader, setShowIntroLoader] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowIntroLoader(false), 2200)
    return () => clearTimeout(t)
  }, [])

  function onStatus(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const activeElev = elevations.find(e => e.id === activeElevId)
  const activeOptData = activeElev?.elevation_options.find(o => o.option === activeOption)
  const optionId = activeOptData?.id ?? ''
  // How the active option is referred to: its name, or "Option" plus its position letter — never its stored key.
  const activeOptionTitle = optionTitleFor(activeElev?.elevation_options ?? [], activeOption)

  const studio = useStudio({
    projectId: project.id,
    optionId,
    onStatus,
    projectName: project.name,
    elevationName: activeElev?.name ?? '',
    optionKey: activeOptionTitle,
    artworkDragLocked: !!(activeElev?.clientPickedOption && activeElev.clientPickedOption === activeOption) || (activeOptData?.approved ?? false),
    onElevationUploaded: ({ imagePath, imageUrl, origW, origH }) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            // A photograph replaces a plain wall outright, so the wall's own
            // fields go with it — see the same clearing in uploadElevation.
            return { ...o, imagePath, imageUrl, orig_w: origW, orig_h: origH, wall_w_cm: null, wall_h_cm: null, wall_color: null }
          }),
        }
      }))
    },
    onScaleSet: (scalePxPerCm) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return { ...o, scale_px_per_cm: scalePxPerCm }
          }),
        }
      }))
    },
    onBlankWallSet: ({ origW, origH, scalePxPerCm, wallWCm, wallHCm, wallColor }) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            // imagePath and imageUrl are cleared deliberately: a wall is one
            // thing or the other, and leaving a stale photograph behind would
            // have the studio drawing colour while the client portal still
            // drew the old picture.
            return {
              ...o, imagePath: null, imageUrl: null,
              orig_w: origW, orig_h: origH, scale_px_per_cm: scalePxPerCm,
              wall_w_cm: wallWCm, wall_h_cm: wallHCm, wall_color: wallColor,
              foreground_masks: null,
            }
          }),
        }
      }))
    },
    onArtworksAdded: (newArtworks, newWorks) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return { ...o, artworks: [...o.artworks, ...newArtworks] }
          }),
        }
      }))
      if (newWorks.length > 0) setWorks(prev => [...prev, ...newWorks])
    },
    onArtworkDeleted: (id) => {
      setElevations(prev => prev.map(e => {
        if (e.id !== activeElevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== activeOption) return o
            return { ...o, artworks: o.artworks.filter(a => a.id !== id) }
          }),
        }
      }))
    },
    onForegroundSaved: (masks) => {
      // Mirror saved masks into local state for the current option and any sibling options sharing the same image.
      // useStudio only calls this when the masks actually changed, so the bulk sibling update below is no longer
      // triggered by every autosave — moving an artwork never touches elevation_options at all.
      setElevations(prev => {
        const elev = prev.find(e => e.id === activeElevId)
        if (!elev) return prev
        const currentOpt = elev.elevation_options.find(o => o.option === activeOption)
        const siblingIds = currentOpt?.imagePath
          ? elev.elevation_options
              .filter(o => o.option !== activeOption && o.imagePath === currentOpt.imagePath)
              .map(o => o.id)
          : []
        const masksValue = masks.length > 0 ? masks : null
        if (siblingIds.length > 0) {
          const supabase = createClient()
          supabase.from('elevation_options')
            .update({ foreground_masks: masksValue })
            .in('id', siblingIds)
            .then(() => {})
        }
        return prev.map(e => {
          if (e.id !== activeElevId) return e
          return {
            ...e,
            elevation_options: e.elevation_options.map(o => {
              if (o.option === activeOption) return { ...o, foreground_masks: masksValue }
              if (siblingIds.includes(o.id)) return { ...o, foreground_masks: masksValue }
              return o
            }),
          }
        })
      })
    },
  })

  // When we call loadOption directly in handleSwitch we skip the effect for that one render
  const skipNextLoadRef = useRef(false)

  // Ref to track whether the active option is client-picked (used in keydown handler to avoid stale closure)
  const artworkMoveLocked = useRef(false)
  useEffect(() => {
    artworkMoveLocked.current = !!(activeElev?.clientPickedOption && activeElev.clientPickedOption === activeOption)
  }, [activeElev?.clientPickedOption, activeOption])

  // Load option into studio when tab changes
  useEffect(() => {
    if (!activeOptData) return
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return }
    const skewCorners = buildSkewCorners(activeOptData)
    studio.loadOption({
      imageUrl: activeOptData.imageUrl,
      imagePath: activeOptData.imagePath,
      origW: activeOptData.orig_w,
      origH: activeOptData.orig_h,
      scalePxPerCm: activeOptData.scale_px_per_cm,
      wallWCm: activeOptData.wall_w_cm ?? null,
      wallHCm: activeOptData.wall_h_cm ?? null,
      wallColor: activeOptData.wall_color ?? null,
      artworks: activeOptData.artworks ?? [],
      foregroundMasks: (activeOptData.foreground_masks as import('@/types').ForegroundMasks | null) ?? null,
      skewCorners,
      skewActive: activeOptData.skew_active ?? false,
    })
  }, [activeElevId, activeOption]) // eslint-disable-line

  // Keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return

      const s = studio.state
      if ((e.key === 'Delete' || e.key === 'Backspace') && s.selIds.size > 0) {
        requestDeleteArtworks(new Set(s.selIds))
        return
      }
      if (e.key === 'Enter' && s.skewAdjustMode) {
        e.preventDefault()
        studio.finaliseSkewAdjust()
        return
      }
      if (e.key === 'Escape') {
        if (s.skewAdjustMode) { studio.cancelSkewAdjust(); return }
        if (s.maskDraw.active) {
          if (s.maskDraw.currentPoints.length > 0) { studio.clearCurrentPoints(); return }
          studio.cancelMaskDraw(); return
        }
        if (s.calib.active) { studio.cancelCalibration(); return }
        studio.selectArtwork(null)
        return
      }
      if (s.selIds.size > 0 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
        if (!s.elev) return
        if (artworkMoveLocked.current) return
        const step = e.shiftKey ? 10 : 1
        s.artworks.forEach(art => {
          if (!s.selIds.has(art.id) || !s.elev) return
          if (e.key === 'ArrowLeft')  art.xF = Math.max(0, art.xF - step / s.elev.dispW)
          if (e.key === 'ArrowRight') art.xF = Math.min(1, art.xF + step / s.elev.dispW)
          if (e.key === 'ArrowUp')    art.yF = Math.max(0, art.yF - step / s.elev.dispH)
          if (e.key === 'ArrowDown')  art.yF = Math.min(1, art.yF + step / s.elev.dispH)
        })
        studio.renderArtworksDOM(s.artworks, s.elev, s.scale, s.selIds)
        e.preventDefault()
      }
      if ((e.key === '=' || e.key === '+') && (e.metaKey || e.ctrlKey)) { studio.changeZoom(0.1, s); e.preventDefault() }
      if (e.key === '-' && (e.metaKey || e.ctrlKey)) { studio.changeZoom(-0.1, s); e.preventDefault() }
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) { studio.setZoomFit(s); e.preventDefault() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [studio])

  /**
   * Copy the live studio state back into `elevations`.
   *
   * The studio edits `studio.state.artworks`; everything else on this screen
   * reads `elevations`, which is the server snapshot. Anything the consultant
   * changes is therefore invisible to the budget until the two are brought
   * together. This used to run only when switching option, so a price, a
   * discount or a note typed just before opening the budget did not show up
   * there until the page was reloaded.
   *
   * Every field the sidebar can edit has to be listed here. A field left out
   * saves to the database and still looks lost.
   */
  const syncStudioIntoElevations = useCallback(() => {
    const currentArts = studio.state.artworks
    const currentMasks = studio.state.masks
    if (!activeElevId || !activeOption) return
    // Name, artist, size and the money belong to the work, not to this
    // placement of it — so every other placement of the same work, on any
    // option or elevation, and the index's copy move with it.
    const byWork = new Map(currentArts.map(a => [a.workId, a]))
    const workFields = (cur: Artwork) => ({
      name: cur.name, artist: cur.artist,
      wCm: cur.wCm, hCm: cur.hCm,
      price: cur.price,
      note: cur.note, noteShownToClient: cur.noteShownToClient,
      vatApplies: cur.vatApplies,
      discountStatus: cur.discountStatus, discountPercent: cur.discountPercent,
      subLineItems: cur.subLineItems,
    })
    setElevations(prev => prev.map(e => ({
      ...e,
      elevation_options: e.elevation_options.map(o => {
        if (e.id === activeElevId && o.option === activeOption) {
          return {
            ...o,
            foreground_masks: currentMasks.length > 0 ? currentMasks : null,
            artworks: o.artworks.map(a => {
              const cur = currentArts.find(ca => ca.id === a.id)
              if (!cur) return a
              return {
                ...a,
                ...workFields(cur),
                xF: cur.xF, yF: cur.yF,
                frameType: cur.frameType, frameWidthMm: cur.frameWidthMm,
                brightness: cur.brightness,
                fade: cur.fade,
                shadowAngle: cur.shadowAngle, shadowBlur: cur.shadowBlur, shadowOpacity: cur.shadowOpacity,
                visible: cur.visible,
              }
            }),
          }
        }
        return {
          ...o,
          artworks: o.artworks.map(a => {
            const cur = byWork.get(a.workId)
            return cur ? { ...a, ...workFields(cur) } : a
          }),
        }
      }),
    })))
    setWorks(prev => prev.map(w => {
      const cur = byWork.get(w.id)
      return cur ? { ...w, ...workFields(cur) } : w
    }))
  }, [studio.state.artworks, studio.state.masks, activeElevId, activeOption])

  // ─── EDITING A WORK FROM THE BUDGET OR THE INDEX ─────────────────
  // The money, the notes and the sourcing detail belong to the work, so a
  // change is written to `works` by work id and shown on every placement of
  // it. Writes go straight to the row because the budget and the index span
  // every elevation while the studio hook only knows the option open.
  //
  // Debounced: the note fields fire on every keystroke, and one request per
  // character would be both wasteful and out of order.

  const WRITE_DELAY_MS = 600
  const workPending = useRef(new Map<string, WorkPatch>())
  const workTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const notePending = useRef(new Map<string, { note: string; shownToClient: boolean }>())
  const noteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const flushWorkWrite = useCallback(async (workId: string) => {
    const patch = workPending.current.get(workId)
    workPending.current.delete(workId)
    workTimers.current.delete(workId)
    if (!patch) return

    const supabase = createClient()
    const { data, error } = await supabase
      .from('works')
      .update(toWorkColumns(patch))
      .eq('id', workId)
      .select('id')

    // `select` matters: without it an update that matches nothing, or that
    // row-level security filters out, comes back with no error at all.
    if (error) onStatus('Not saved: ' + error.message)
    else if (!data || data.length === 0) onStatus('Not saved: this work could not be found')
  }, [onStatus])

  // ─── NOTES ───────────────────────────────────────────────────────
  //
  // All five anchors go through these three, so there is one place that
  // knows how a note is written and one place that can get it wrong.

  const NOTE_SELECT = `
    id, project_id, anchor_type, elevation_id, option_id, work_id, artist_id,
    body, share, display_order, updated_at, note_works(work_id)
  `

  const insertNote = useCallback(async (
    anchor: NoteAnchor, id: string | null, workIds: string[] = [],
  ) => {
    const supabase = createClient()
    const payload = noteRow({
      projectId: project.id,
      anchor,
      elevationId: anchor === 'elevation' ? id : null,
      optionId:    anchor === 'option'    ? id : null,
      workId:      anchor === 'work'      ? id : null,
      artistId:    anchor === 'artist'    ? id : null,
      body: '',
      share: 'proposal',
      displayOrder: notes.filter(n => n.anchor === anchor).length,
    })
    const { data, error } = await supabase.from('notes').insert(payload).select(NOTE_SELECT).single()
    if (error || !data) { onStatus('Could not add the note — please try again'); return }

    // The set of works a note covers is written with it rather than after,
    // so a note picked out of several works is never briefly about none.
    if (workIds.length > 0) {
      const { error: setErr } = await supabase.from('note_works')
        .insert(workIds.map(work_id => ({ note_id: data.id, work_id })))
      if (setErr) onStatus('Note added, but not which works it is about')
    }

    const note = rowToNote(data as unknown as NoteRow)
    setNotes(prev => [...prev, { ...note, workIds }])
  }, [project.id, notes]) // eslint-disable-line

  const addNote = useCallback((anchor: NoteAnchor, id: string | null) => {
    void insertNote(anchor, id)
  }, [insertNote])

  /**
   * A note about several works, made by picking them first.
   *
   * Works with no artist have no artist to hang it on — artist_key may not be
   * empty — so it anchors to the project instead and is found through its
   * work set. The Notes screen leaves those out of "The project" for the same
   * reason it leaves work-set notes out of an artist's own section: they are
   * read on the works they cover.
   */
  const addWorkSetNote = useCallback((artistId: string, workIds: string[]) => {
    if (artistId) void insertNote('artist', artistId, workIds)
    else void insertNote('project', null, workIds)
  }, [insertNote])

  const changeNote = useCallback(async (noteId: string, patch: NotePatch) => {
    const before = notes.find(n => n.id === noteId)
    if (!before) return
    // Optimistic: a note is read back on more than one screen, and a textarea
    // that snaps back while the write is in flight reads as a lost edit.
    setNotes(prev => prev.map(n => (n.id === noteId ? { ...n, ...patch } : n)))

    const supabase = createClient()
    const { workIds, ...fields } = patch

    if (Object.keys(fields).length > 0) {
      const { error } = await supabase.from('notes')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', noteId)
      if (error) {
        setNotes(prev => prev.map(n => (n.id === noteId ? before : n)))
        onStatus('Could not save the note — please try again')
        return
      }
    }

    // The narrowing set is a join table, so it is replaced rather than
    // patched. Deleting first means a work removed from the set actually
    // leaves it; an upsert alone would only ever add.
    if (workIds) {
      await supabase.from('note_works').delete().eq('note_id', noteId)
      if (workIds.length > 0) {
        const { error } = await supabase.from('note_works')
          .insert(workIds.map(work_id => ({ note_id: noteId, work_id })))
        if (error) {
          setNotes(prev => prev.map(n => (n.id === noteId ? before : n)))
          onStatus('Could not save which works that note is about')
        }
      }
    }
  }, [notes]) // eslint-disable-line

  const deleteNote = useCallback(async (noteId: string) => {
    const before = notes
    setNotes(prev => prev.filter(n => n.id !== noteId))
    const supabase = createClient()
    const { error } = await supabase.from('notes').delete().eq('id', noteId)
    if (error) { setNotes(before); onStatus('Could not remove the note — please try again') }
  }, [notes]) // eslint-disable-line

  // ─── ARTISTS ─────────────────────────────────────────────────────

  /** The standing note about an artist, carried into every project. */
  const changeArtistNote = useCallback(async (artistId: string, note: string) => {
    const before = artists
    setArtists(prev => prev.map(a => (a.id === artistId ? { ...a, note } : a)))
    const supabase = createClient()
    const { error } = await supabase.from('artist_profiles')
      .update({ note, updated_at: new Date().toISOString() })
      .eq('id', artistId)
    if (error) { setArtists(before); onStatus('Could not save the artist note — please try again') }
  }, [artists]) // eslint-disable-line

  /**
   * Give an artist a different name.
   *
   * One row changes, and their notes follow without being touched — they
   * point at the row, not at what it is called. Every work showing the old
   * spelling is brought into line in the same go, because `works.artist` is
   * a copy kept for display and a copy that disagrees is worse than none.
   */
  const renameArtist = useCallback(async (artistId: string, rawName: string) => {
    const name = tidyArtistName(rawName)
    const check = canRenameTo(artists, artistId, name)
    if (!check.ok) { onStatus(check.reason); return }

    const beforeArtists = artists
    const beforeWorks = works
    setArtists(prev => sortArtists(prev.map(a => (
      a.id === artistId ? { ...a, name, nameKey: artistKey(name) } : a
    ))))
    setWorks(prev => prev.map(w => (w.artistId === artistId ? { ...w, artist: name } : w)))

    const supabase = createClient()
    const { error } = await supabase.from('artist_profiles')
      .update({ name, name_key: artistKey(name), updated_at: new Date().toISOString() })
      .eq('id', artistId)
    if (error) {
      setArtists(beforeArtists); setWorks(beforeWorks)
      onStatus('Could not rename that artist — please try again')
      return
    }
    // Every work of theirs, in one statement rather than one per work.
    const { error: wErr } = await supabase.from('works')
      .update({ artist: name })
      .eq('artist_id', artistId)
    if (wErr) {
      onStatus('Artist renamed, but some works still show the old spelling — reload to retry')
      return
    }
    onStatus(`Renamed to ${name}`)
  }, [artists, works]) // eslint-disable-line

  /**
   * Put a work with an artist, creating the artist if this is the first time
   * the practice has seen them.
   *
   * Passing an empty name unattributes the work. Anything already known is
   * reused whatever the capitals — which is the whole reason this does not
   * simply write the text onto the work.
   */
  const setWorkArtist = useCallback(async (workId: string, rawName: string) => {
    const name = tidyArtistName(rawName)
    const supabase = createClient()

    if (!name) {
      setWorks(prev => prev.map(w => (w.id === workId ? { ...w, artist: '', artistId: null } : w)))
      await supabase.from('works').update({ artist: '', artist_id: null }).eq('id', workId)
      return
    }

    let artist = findArtistByName(artists, name)
    if (!artist) {
      const { data, error } = await supabase.from('artist_profiles')
        .insert({ name, name_key: artistKey(name) })
        .select('id, name, name_key, note')
        .single()
      if (error || !data) { onStatus('Could not add that artist — please try again'); return }
      artist = { id: data.id, name: data.name, nameKey: data.name_key, note: data.note ?? '' }
      setArtists(prev => sortArtists([...prev, artist!]))
    }

    const before = works
    setWorks(prev => prev.map(w => (
      w.id === workId ? { ...w, artist: artist!.name, artistId: artist!.id } : w
    )))
    const { error } = await supabase.from('works')
      .update({ artist: artist.name, artist_id: artist.id })
      .eq('id', workId)
    if (error) { setWorks(before); onStatus('Could not save the artist — please try again') }
  }, [artists, works]) // eslint-disable-line

  const handleWorkChange = useCallback((workId: string, patch: WorkPatch) => {
    // Optimistic: the budget and the index read these, so they have to move now.
    setWorks(prev => prev.map(w => (w.id === workId ? { ...w, ...patch } : w)))
    setElevations(prev => prev.map(e => ({
      ...e,
      elevation_options: e.elevation_options.map(o => ({
        ...o,
        artworks: o.artworks.map(a => (a.workId === workId ? { ...a, ...patch } : a)),
      })),
    })))

    // If this work is on the option the studio has open, its copy has to agree,
    // or the next autosave from a drag would write the old figures back.
    studio.state.artworks
      .filter(a => a.workId === workId)
      .forEach(a => studio.patchArtworkLocal(a.id, patch))

    // Size is the one work-level field the wall actually draws, so a resize
    // from the index or the budget makes every dashboard picture holding this
    // work out of date. Nothing else here changes what the wall looks like.
    if (patch.wCm !== undefined || patch.hCm !== undefined) {
      elevations.forEach(e => e.elevation_options.forEach(o => {
        if (o.artworks.some(a => a.workId === workId)) studio.scheduleThumbnailRegen(o.id)
      }))
    }

    const merged = { ...workPending.current.get(workId), ...patch }
    workPending.current.set(workId, merged)
    const existing = workTimers.current.get(workId)
    if (existing) clearTimeout(existing)
    workTimers.current.set(
      workId,
      setTimeout(() => { void flushWorkWrite(workId) }, WRITE_DELAY_MS),
    )
  }, [studio, flushWorkWrite, elevations])

  const flushNoteWrite = useCallback(async (optionRowId: string) => {
    const pending = notePending.current.get(optionRowId)
    notePending.current.delete(optionRowId)
    noteTimers.current.delete(optionRowId)
    if (!pending) return

    const supabase = createClient()
    const { data, error } = await supabase
      .from('elevation_options')
      .update({
        consultant_note: pending.note,
        consultant_note_shown_to_client: pending.shownToClient,
      })
      .eq('id', optionRowId)
      .select('id')

    if (error) onStatus('Note not saved: ' + error.message)
    else if (!data || data.length === 0) onStatus('Note not saved: this option could not be found')
  }, [onStatus])

  const handleOptionNoteChange = useCallback((
    elevationId: string, optionKey: string, note: string, shownToClient: boolean,
  ) => {
    let optionRowId: string | null = null
    setElevations(prev => prev.map(e => {
      if (e.id !== elevationId) return e
      return {
        ...e,
        elevation_options: e.elevation_options.map(o => {
          if (o.option !== optionKey) return o
          optionRowId = o.id
          return { ...o, consultantNote: note, consultantNoteShownToClient: shownToClient }
        }),
      }
    }))

    // The id is read out of the state update above, so resolve it separately
    // for the write rather than relying on when that callback runs.
    const rowId = elevations
      .find(e => e.id === elevationId)?.elevation_options
      .find(o => o.option === optionKey)?.id ?? optionRowId
    if (!rowId) return

    notePending.current.set(rowId, { note, shownToClient })
    const existing = noteTimers.current.get(rowId)
    if (existing) clearTimeout(existing)
    noteTimers.current.set(
      rowId,
      setTimeout(() => { void flushNoteWrite(rowId) }, WRITE_DELAY_MS),
    )
  }, [elevations, flushNoteWrite])

  // Leaving the page with a write still queued would lose it.
  useEffect(() => {
    const wTimers = workTimers.current
    const nTimers = noteTimers.current
    return () => {
      wTimers.forEach(t => clearTimeout(t))
      nTimers.forEach(t => clearTimeout(t))
      workPending.current.forEach((_, id) => { void flushWorkWrite(id) })
      notePending.current.forEach((_, id) => { void flushNoteWrite(id) })
    }
  }, [flushWorkWrite, flushNoteWrite])

  async function handleSwitch(elevId: string, opt: string) {
    // Before switching: bring the studio's live edits into `elevations`.
    syncStudioIntoElevations()

    // If the target option has no wall but another option does, copy from the
    // first that has one. Options are alternatives for the same wall, so the
    // wall itself is shared — which is as true of a plain wall as it is of a
    // photograph, so both kinds are carried across here.
    const elev = elevations.find(e => e.id === elevId)
    const targetOpt = elev?.elevation_options.find(o => o.option === opt)
    const sourceOpt = elev?.elevation_options.find(o => o.option !== opt && optHasWall(o))
    if (targetOpt && !optHasWall(targetOpt) && sourceOpt) {
      const supabase = createClient()
      await supabase.from('elevation_options').update({
        image_path: sourceOpt.imagePath,
        orig_w: sourceOpt.orig_w,
        orig_h: sourceOpt.orig_h,
        scale_px_per_cm: sourceOpt.scale_px_per_cm,
        wall_w_cm: sourceOpt.wall_w_cm ?? null,
        wall_h_cm: sourceOpt.wall_h_cm ?? null,
        wall_color: sourceOpt.wall_color ?? null,
      }).eq('id', targetOpt.id)
      setElevations(prev => prev.map(e => {
        if (e.id !== elevId) return e
        return {
          ...e,
          elevation_options: e.elevation_options.map(o => {
            if (o.option !== opt) return o
            return {
              ...o,
              imagePath: sourceOpt.imagePath, imageUrl: sourceOpt.imageUrl,
              orig_w: sourceOpt.orig_w, orig_h: sourceOpt.orig_h,
              scale_px_per_cm: sourceOpt.scale_px_per_cm,
              wall_w_cm: sourceOpt.wall_w_cm ?? null,
              wall_h_cm: sourceOpt.wall_h_cm ?? null,
              wall_color: sourceOpt.wall_color ?? null,
            }
          }),
        }
      }))
      skipNextLoadRef.current = true
      studio.loadOption({
        imageUrl: sourceOpt.imageUrl,
        imagePath: sourceOpt.imagePath,
        origW: sourceOpt.orig_w,
        origH: sourceOpt.orig_h,
        scalePxPerCm: sourceOpt.scale_px_per_cm,
        wallWCm: sourceOpt.wall_w_cm ?? null,
        wallHCm: sourceOpt.wall_h_cm ?? null,
        wallColor: sourceOpt.wall_color ?? null,
        artworks: targetOpt.artworks ?? [],
        foregroundMasks: (targetOpt.foreground_masks as import('@/types').ForegroundMasks | null) ?? null,
        skewCorners: buildSkewCorners(targetOpt),
        skewActive: targetOpt.skew_active ?? false,
      })
      setActiveElevId(elevId)
      setActiveOption(opt)
      return
    }
    setActiveElevId(elevId)
    setActiveOption(opt)
  }

  function requestDeleteArtworks(ids: Set<string>) {
    setPendingDeleteIds(ids)
  }

  function confirmDeleteArtworks() {
    if (!pendingDeleteIds) return
    pendingDeleteIds.forEach(id => studio.deleteArtwork(id))
    setPendingDeleteIds(null)
  }

  async function deleteElevation(elevId: string) {
    const supabase = createClient()
    try {
      // Fetch all elevation_options for this elevation
      const { data: opts } = await supabase
        .from('elevation_options')
        .select('id, image_path')
        .eq('elevation_id', elevId)

      if (opts) {
        // Artwork images belong to works, which outlive the wall — only the
        // wall photos go. The placements cascade with the option rows.

        // Delete elevation images from storage
        const elevPaths = opts.map(o => o.image_path).filter(Boolean) as string[]
        if (elevPaths.length) {
          await supabase.storage.from('elevation-images').remove(elevPaths)
        }
      }

      // Delete the elevation row (DB cascades to options + artworks)
      const { error } = await supabase.from('elevations').delete().eq('id', elevId)
      if (error) throw error

      // Update local state and switch away if needed
      setElevations(prev => {
        const remaining = prev.filter(e => e.id !== elevId)
        if (activeElevId === elevId && remaining.length > 0) {
          setActiveElevId(remaining[0].id)
          setActiveOption(remaining[0].elevation_options[0]?.option ?? 'A')
        }
        return remaining
      })
      onStatus('Elevation deleted')
    } catch {
      onStatus('Failed to delete elevation — please try again')
    }
  }

  async function renameElevation(elevId: string, newName: string) {
    const supabase = createClient()
    await supabase.from('elevations').update({ name: newName }).eq('id', elevId)
    setElevations(prev => prev.map(e => e.id === elevId ? { ...e, name: newName } : e))
    onStatus('Elevation renamed')
  }

  async function setElevationVisibleToClient(elevId: string, visible: boolean) {
    const supabase = createClient()
    const { error } = await supabase.from('elevations').update({ visible_to_client: visible }).eq('id', elevId)
    if (error) {
      onStatus('Failed to change client visibility — please try again')
      return
    }
    setElevations(prev => prev.map(e => e.id === elevId ? { ...e, visibleToClient: visible } : e))
    onStatus(visible ? 'Elevation now visible to client' : 'Elevation hidden from client')
  }

  async function addElevation(name: string) {
    const supabase = createClient()
    const { data: elev } = await supabase.from('elevations').insert({
      project_id: project.id,
      name,
      display_order: elevations.length,
    }).select().single()
    if (!elev) return

    const { data: optRow } = await supabase.from('elevation_options')
      .insert({ elevation_id: elev.id, option: 'A', sort_order: 0 })
      .select().single()

    const newElev: DbElevation = {
      id: elev.id, name: elev.name, display_order: elev.display_order, clientPickedOption: null, visibleToClient: true,
      elevation_options: [
        { id: optRow?.id ?? '', option: 'A', sort_order: 0, imageUrl: null, imagePath: null, orig_w: 0, orig_h: 0, scale_px_per_cm: null, wall_w_cm: null, wall_h_cm: null, wall_color: null, approved: false, approved_at: null, foreground_masks: null, clientNotes: '', consultantNote: '', consultantNoteShownToClient: true, artworks: [] },
      ],
    }
    setElevations(prev => [...prev, newElev])
    setActiveElevId(elev.id)
    setActiveOption('A')
  }

  async function addOption(elevId: string) {
    const elev = elevations.find(e => e.id === elevId)
    if (!elev) return
    // `nextKey` is only the row's stable identity (lowest unused letter). The
    // letter people see is its position — a new tab always goes on the end.
    const nextKey = nextOptionKey(elev.elevation_options)
    if (!nextKey) { onStatus('An elevation can have at most 26 options'); return }
    const sortOrder = nextSortOrder(elev.elevation_options)
    const newLabel = optionLabel(elev.elevation_options.length)
    // Inherit the wall + foreground from the currently active option (same room
    // = same wall). A plain wall is inherited on the same terms as a photograph:
    // the options are alternative hangs of one wall either way.
    const srcOpt = elev.elevation_options.find(o => o.option === activeOption) ?? elev.elevation_options[0] ?? null
    const inheritedImagePath = srcOpt?.imagePath ?? null
    const inheritedMasks = (srcOpt?.foreground_masks as any[] | null) ?? null
    const inheritedOrigW = srcOpt?.orig_w ?? 0
    const inheritedOrigH = srcOpt?.orig_h ?? 0
    const inheritedScale = srcOpt?.scale_px_per_cm ?? null
    const inheritedWallW = srcOpt?.wall_w_cm ?? null
    const inheritedWallH = srcOpt?.wall_h_cm ?? null
    const inheritedWallColor = srcOpt?.wall_color ?? null
    const supabase = createClient()
    const insertPayload: Record<string, unknown> = { elevation_id: elevId, option: nextKey, sort_order: sortOrder }
    if (inheritedImagePath) {
      insertPayload.image_path = inheritedImagePath
      insertPayload.orig_w = inheritedOrigW
      insertPayload.orig_h = inheritedOrigH
      insertPayload.scale_px_per_cm = inheritedScale
    } else if (inheritedWallColor) {
      insertPayload.orig_w = inheritedOrigW
      insertPayload.orig_h = inheritedOrigH
      insertPayload.scale_px_per_cm = inheritedScale
      insertPayload.wall_w_cm = inheritedWallW
      insertPayload.wall_h_cm = inheritedWallH
      insertPayload.wall_color = inheritedWallColor
    }
    if (inheritedMasks && inheritedMasks.length > 0) {
      insertPayload.foreground_masks = inheritedMasks
    }
    const { data: optRow, error: insertError } = await supabase.from('elevation_options')
      .insert(insertPayload)
      .select().single()
    if (insertError) { console.error('addOption insert failed:', insertError); onStatus('Failed to add option'); return }
    if (!optRow) return
    setElevations(prev => prev.map(e => {
      if (e.id !== elevId) return e
      return {
        ...e,
        elevation_options: [...e.elevation_options, {
          id: optRow.id, option: nextKey, sort_order: sortOrder,
          imageUrl: srcOpt?.imageUrl ?? null,
          imagePath: inheritedImagePath,
          orig_w: inheritedOrigW, orig_h: inheritedOrigH,
          scale_px_per_cm: inheritedScale,
          wall_w_cm: inheritedWallW, wall_h_cm: inheritedWallH, wall_color: inheritedWallColor,
          approved: false, approved_at: null,
          foreground_masks: inheritedMasks,
          clientNotes: '', consultantNote: '', consultantNoteShownToClient: true, artworks: [],
        }],
      }
    }))
    setActiveElevId(elevId)
    setActiveOption(nextKey)
    onStatus(`Option ${newLabel} added`)
  }

  async function deleteOption(elevId: string, optKey: string) {
    const elev = elevations.find(e => e.id === elevId)
    const opt = elev?.elevation_options.find(o => o.option === optKey)
    if (!opt || !elev) return
    const removedTitle = optionTitleFor(elev.elevation_options, optKey)
    const supabase = createClient()
    // Artwork images belong to works and stay; the placements cascade with the row.
    // Delete the elevation image — but ONLY if no other option still points at
    // it. Options of the same elevation deliberately share one wall photo:
    // handleSwitch copies image_path into an empty option so both show the same
    // room. Removing it blindly here deletes the surviving option's photo and
    // leaves its image_path dangling, which renders an empty client portal.
    if (opt.imagePath) {
      const { data: alsoUsing } = await supabase
        .from('elevation_options')
        .select('id')
        .eq('image_path', opt.imagePath)
        .neq('id', opt.id)

      if (!alsoUsing?.length) {
        await supabase.storage.from('elevation-images').remove([opt.imagePath])
      }
    }
    // Delete option row (DB cascades to artworks)
    await supabase.from('elevation_options').delete().eq('id', opt.id)
    const remaining = elev.elevation_options.filter(o => o.option !== optKey)
    setElevations(prev => prev.map(e => {
      if (e.id !== elevId) return e
      return { ...e, elevation_options: remaining }
    }))
    // Switch away if deleting the active option
    if (activeElevId === elevId && activeOption === optKey && remaining.length > 0) {
      setActiveOption(remaining[0].option)
    }
    onStatus(`${removedTitle} removed`)
  }

  /**
   * Give an option a name (or clear it with an empty string). The name
   * replaces the position letter wherever the option is referred to; the
   * stored key and the order are untouched.
   */
  async function renameOption(elevId: string, optKey: string, name: string) {
    const elev = elevations.find(e => e.id === elevId)
    const opt = elev?.elevation_options.find(o => o.option === optKey)
    if (!opt) return
    const value = cleanOptionName(name)
    const previous = opt.name ?? null
    if (value === previous) return
    const apply = (v: string | null) => setElevations(prev => prev.map(e => e.id !== elevId ? e : {
      ...e,
      elevation_options: e.elevation_options.map(o => o.option === optKey ? { ...o, name: v } : o),
    }))
    apply(value)
    const supabase = createClient()
    const { error } = await supabase.from('elevation_options').update({ name: value }).eq('id', opt.id)
    if (error) {
      console.error('rename option failed:', error)
      apply(previous)
      onStatus('Could not save the option name — please try again')
      return
    }
    onStatus(value ? `Option renamed to ${value}` : 'Option name cleared')
  }

  /**
   * Save a new left-to-right order for one elevation's options.
   * Optimistic: the strip re-letters at once, then a single RPC writes every
   * sort_order in one statement (see migration 023). If that fails the old
   * order comes back. Only the order changes — nothing is deleted or re-keyed.
   */
  async function reorderOptions(elevId: string, orderedKeys: string[]) {
    const elev = elevations.find(e => e.id === elevId)
    if (!elev) return
    const byKey = new Map(elev.elevation_options.map(o => [o.option, o]))
    if (orderedKeys.length !== byKey.size || orderedKeys.some(k => !byKey.has(k))) return
    const previous = elev.elevation_options
    const reordered = orderedKeys.map((k, i) => ({ ...byKey.get(k)!, sort_order: i }))
    setElevations(prev => prev.map(e => e.id === elevId ? { ...e, elevation_options: reordered } : e))

    const supabase = createClient()
    const { error } = await supabase.rpc('reorder_elevation_options', {
      p_elevation_id: elevId,
      p_option_ids: reordered.map(o => o.id),
    })
    if (error) {
      console.error('reorder_elevation_options failed:', error)
      setElevations(prev => prev.map(e => e.id === elevId ? { ...e, elevation_options: previous } : e))
      onStatus('Could not save the new tab order — please try again')
    }
  }

  async function handleUnapprove() {
    if (!activeOptData) return
    const supabase = createClient()
    await supabase.from('elevation_options').update({ approved: false, approved_at: null }).eq('id', activeOptData.id)
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'unapprove',
      text: `${PRACTICE_NAME} unapproved ${activeOptionTitle} of ${activeElev?.name ?? ''}`,
    })
    setElevations(prev => prev.map(e => {
      if (e.id !== activeElevId) return e
      return {
        ...e,
        elevation_options: e.elevation_options.map(o => {
          if (o.option !== activeOption) return o
          return { ...o, approved: false, approved_at: null }
        }),
      }
    }))
    onStatus('Approval removed')
  }

  /**
   * Insert a fresh artist-name token (e.g. "monet-warhol-basquiat").
   * Retries once on the rare chance of a collision.
   */
  async function insertNewToken(): Promise<string> {
    const supabase = createClient()
    const { generateArtistToken } = await import('@/lib/artistToken')
    let token = generateArtistToken()
    let result = await supabase.from('client_tokens').insert({ project_id: project.id, token }).select().maybeSingle()
    if (result.error) {
      token = generateArtistToken()
      result = await supabase.from('client_tokens').insert({ project_id: project.id, token }).select().maybeSingle()
    }
    return result.data?.token ?? token
  }

  async function generateShareToken(): Promise<string> {
    const supabase = createClient()
    if (shareToken) return shareToken

    const token = await insertNewToken()
    setShareToken(token)
    setExpiryNoticeOpen(false)

    // Log activity + set status to sent (only if not already approved)
    await supabase.from('activity_logs').insert({ project_id: project.id, type: 'link', text: `Client link generated by ${PRACTICE_NAME}` })
    if (projectStatus !== 'approved') {
      await supabase.from('projects').update({ status: 'sent' }).eq('id', project.id)
      setProjectStatus('sent')
    }

    return token
  }

  /**
   * Replace the current link with a new one — for when the generated artist
   * names read badly. The old link stops working immediately.
   *
   * Retired by setting `expires_at` to now rather than by deleting the row.
   * Both the portal page and the action route gate on `expires_at > now()`, so
   * the effect is identical — but a row that still exists means a client who
   * follows the old link reaches the "no longer active" explanation instead of
   * a bare 404, which is what an unknown token gets. Deleting the row lost that
   * distinction.
   *
   * The new token is inserted *before* the old ones are retired. If the update
   * fails the project is left with two working links, which is recoverable;
   * retiring first and failing to insert would leave it with none.
   */
  async function regenerateShareToken(): Promise<string> {
    const supabase = createClient()
    const token = await insertNewToken()

    const { error: retireErr } = await supabase
      .from('client_tokens')
      .update({ expires_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .neq('token', token)
    if (retireErr) onStatus('New link created, but the old one could not be disabled')

    setShareToken(token)
    setExpiryNoticeOpen(false)
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'link',
      text: `Client link replaced by ${PRACTICE_NAME} — previous link disabled`,
    })
    return token
  }

  async function updateBudget(newBudget: number | null) {
    const supabase = createClient()
    await supabase.from('projects').update({ budget: newBudget }).eq('id', project.id)
    setBudget(newBudget)
    onStatus(newBudget ? 'Budget saved' : 'Budget cleared')
  }

  async function handleConsultantUnapprove() {
    if (!activeOptData?.id) return
    const supabase = createClient()
    await supabase
      .from('elevation_options')
      .update({ approved: false, approved_at: null })
      .eq('id', activeOptData.id)
    setElevations(prev => prev.map(e => {
      if (e.id !== activeElevId) return e
      return {
        ...e,
        elevation_options: e.elevation_options.map(o => {
          if (o.option !== activeOption) return o
          return { ...o, approved: false, approved_at: null }
        }),
      }
    }))
    await supabase.from('activity_logs').insert({
      project_id: project.id,
      type: 'unapprove',
      text: `${PRACTICE_NAME} unapproved ${activeOptionTitle} of ${activeElev?.name ?? ''}`,
    })
    onStatus('Approval removed — client can make changes again')
  }

  // ─── THE INDEX: ADDING AND DELETING WORKS ─────────────────────────

  /** Best-effort, like the portal's logActivity: a failed log never fails the action. */
  async function logActivity(type: string, text: string) {
    const supabase = createClient()
    const { error } = await supabase.from('activity_logs').insert({ project_id: project.id, type, text })
    if (error) console.warn('activity log failed:', error.message)
  }

  /** Upload works into the project without hanging them anywhere. */
  async function addWorksToIndex(files: File[], metas: WorkMeta[]) {
    const results = await Promise.all(files.map((f, i) => uploadWork(project.id, f, metas[i] ?? metas[0], onStatus)))
    const added = results.filter((w): w is Work => w !== null)
    if (added.length === 0) return
    setWorks(prev => [...prev, ...added])
    setShowIndexAddModal(false)
    onStatus(added.length === 1 ? `${added[0].name} added to the project` : `${added.length} works added to the project`)
    void logActivity('work_added', `${PRACTICE_NAME} added ${added.map(w => w.name).join(', ')} to the project`)
  }

  /**
   * Delete a work outright. Its placements go with it (the database
   * cascades), so every wall it hung on is re-rendered, and its file goes.
   */
  async function deleteWork(workId: string) {
    const work = works.find(w => w.id === workId)
    if (!work) return
    const supabase = createClient()
    const { error } = await supabase.from('works').delete().eq('id', workId)
    if (error) { onStatus('Could not delete this work: ' + error.message); return }
    if (work.imagePath) await supabase.storage.from('artwork-images').remove([work.imagePath])

    const affectedOptionIds = elevations.flatMap(e =>
      e.elevation_options.filter(o => o.artworks.some(a => a.workId === workId)).map(o => o.id))
    setElevations(prev => prev.map(e => ({
      ...e,
      elevation_options: e.elevation_options.map(o => ({ ...o, artworks: o.artworks.filter(a => a.workId !== workId) })),
    })))
    setWorks(prev => prev.filter(w => w.id !== workId))
    studio.removePlacementsOfWork(workId)
    affectedOptionIds.forEach(id => studio.scheduleThumbnailRegen(id))
    onStatus(`${work.name} deleted`)
    void logActivity('work_deleted', `${PRACTICE_NAME} deleted ${work.name} from the project`)
  }

  /**
   * Fold one or more works into a keeper. Before 026 the same print hung on
   * two options meant two uploads, and the Index is where those show up.
   *
   * The database does the work in `merge_works` (033) so placements, note
   * sets and note anchors cannot half-move. Each dropped work is its own call
   * and its own transaction: if the third of five fails, the first two are
   * still properly merged and the message says where it stopped.
   */
  async function mergeWorks(keepId: string, dropIds: string[]) {
    const keep = works.find(w => w.id === keepId)
    if (!keep || dropIds.length === 0) return
    const supabase = createClient()

    const merged: string[] = []
    let placementsDropped = 0
    // A keeper with no picture of its own takes the one it is merging in; the
    // database says so in `adopted_image` and the signed URL comes with it.
    let keptWork: Work = keep
    let failure: string | null = null

    for (const dropId of dropIds) {
      const drop = works.find(w => w.id === dropId)
      const { data, error } = await supabase.rpc('merge_works', { p_keep: keepId, p_drop: dropId })
      if (error) { failure = error.message; break }
      const res = (data ?? {}) as {
        image_path: string | null
        placements_dropped: number | null
        adopted_image: boolean | null
      }
      // The file goes only once the row that pointed at it is gone, so a
      // failure never leaves a work whose image has been deleted.
      if (res.image_path) await supabase.storage.from('artwork-images').remove([res.image_path])
      if (res.adopted_image && drop) {
        keptWork = { ...keptWork, imagePath: drop.imagePath, imageUrl: drop.imageUrl }
      }
      placementsDropped += res.placements_dropped ?? 0
      merged.push(dropId)
    }

    if (merged.length > 0) {
      const dropped = new Set(merged)

      const affectedOptionIds = elevations.flatMap(e =>
        e.elevation_options.filter(o => o.artworks.some(a => dropped.has(a.workId))).map(o => o.id))

      setElevations(prev => prev.map(e => ({
        ...e,
        elevation_options: e.elevation_options.map(o => {
          if (!o.artworks.some(a => dropped.has(a.workId))) return o
          const seen = new Set(o.artworks.filter(a => a.workId === keepId).map(a => a.workId))
          const artworks = o.artworks.flatMap(a => {
            if (!dropped.has(a.workId)) return [a]
            if (seen.has(keepId)) return []
            seen.add(keepId)
            return [{ ...a, workId: keepId, ...workFieldsOf(keptWork) }]
          })
          return { ...o, artworks }
        }),
      })))
      setWorks(prev => prev
        .filter(w => !dropped.has(w.id))
        .map(w => w.id === keepId ? keptWork : w))
      studio.repointPlacementsOfWork(merged, keptWork)
      affectedOptionIds.forEach(id => studio.scheduleThumbnailRegen(id))
      void logActivity('works_merged', `${PRACTICE_NAME} merged ${merged.length + 1} records of ${keep.name} into one`)
    }

    if (failure) {
      onStatus(merged.length === 0
        ? 'Could not merge: ' + failure
        : `Merged ${merged.length}, then stopped: ${failure}`)
      return
    }
    const parts = [`${merged.length + 1} records of ${keep.name} are now one work`]
    if (placementsDropped > 0) {
      parts.push(`${placementsDropped} duplicate placement${placementsDropped === 1 ? '' : 's'} removed from a wall`)
    }
    onStatus(parts.join(' · '))
  }

  // What the index needs to say where each work hangs.
  const indexElevations: IndexElevation[] = elevations.map(e => ({
    id: e.id,
    name: e.name,
    options: labelOptions(e.elevation_options).map(o => ({ label: o.label, workIds: o.artworks.map(a => a.workId) })),
  }))

  const { state } = studio

  // Widest right-hand button group: studio view with an approved option, which
  // adds the "✓ Approved" chip and the Unapprove button. See studio.css.
  // Which set of buttons is on the right, which is what decides where the
  // wordmark has to give way. See the table in studio.css.
  const headerHasStudioActions = view === 'studio'
  const headerHasWideActions = view === 'studio' && !!activeOptData?.approved

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden',
        // The studio has the sidebar down its left, so the wall's centre is
        // half a sidebar right of the window's. The index and budget are
        // full-width, and take the default of no shift.
        '--status-bar-shift': view === 'studio' ? 'calc(var(--sidebar-w) / 2)' : '0px',
      } as React.CSSProperties}
    >
      {(returningToDashboard || showIntroLoader) && <DrawLoader variant="cream" />}
      {/* Header. The extra class tells the stylesheet that the right-hand group
          is in its widest form (the approved state adds a chip and an Unapprove
          button), so the centred "Elevation Studio" title can hide before it
          collides rather than overlapping the buttons. */}
      <div className={`studio-header${headerHasStudioActions ? ' studio-header--studio-actions' : ''}${headerHasWideActions ? ' studio-header--wide-actions' : ''}`}>
        <div className="studio-header-left">
          <button
            className="studio-back"
            disabled={returningToDashboard}
            onClick={async () => {
              setReturningToDashboard(true)
              const minCycle = new Promise(r => setTimeout(r, 2200))
              const flush = studio.flushPendingAndRegen().catch(() => { /* best-effort */ })
              await Promise.all([flush, minCycle])
              router.push('/dashboard')
            }}
          >
            {returningToDashboard ? (
              <>
                <span style={{ position: 'relative', display: 'inline-block', width: 16, height: 16 }}>
                  <ArcSpinner size={14} />
                </span>
                Saving…
              </>
            ) : '← Dashboard'}
          </button>
          <div style={{ width: 1, height: 16, background: 'var(--border)' }} />
          <h2 className="studio-project-name">
            <strong>{project.name}</strong>
            {project.client_name && <span> — {project.client_name}</span>}
          </h2>
          {studio.saveStatus === 'saving' && (
            <span className="save-status save-status--saving">Saving…</span>
          )}
          {studio.saveStatus === 'saved' && (
            <span className="save-status save-status--saved">Saved ✓</span>
          )}
          {studio.saveStatus === 'error' && (
            <span className="save-status save-status--error">Save failed</span>
          )}
        </div>
        <div className="header-app-title">Elevation Studio</div>
        <div className="studio-header-right">
          {/* Studio / Budget view toggle */}
          <div className="budget-view-toggle">
            <button
              className={`budget-view-tab${view === 'studio' ? ' active' : ''}`}
              onClick={() => { setView('studio'); setIsPreviewingClientView(false) }}
            >
              Studio
            </button>
            <button
              className={`budget-view-tab${view === 'index' ? ' active' : ''}`}
              onClick={() => { syncStudioIntoElevations(); setView('index'); setIsPreviewingClientView(false) }}
            >
              Index
            </button>
            <button
              className={`budget-view-tab${view === 'notes' ? ' active' : ''}`}
              onClick={() => { syncStudioIntoElevations(); setView('notes'); setIsPreviewingClientView(false) }}
            >
              Notes
            </button>
            <button
              className={`budget-view-tab${view === 'budget' ? ' active' : ''}`}
              onClick={() => { syncStudioIntoElevations(); setView('budget') }}
            >
              Budget
            </button>
          </div>

          {view === 'studio' && (
            <>
              {activeOptData?.approved && (
                <>
                  <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500 }}>✓ Approved</span>
                  <button className="btn btn-sm btn-ghost" onClick={handleUnapprove}>
                    Unapprove
                  </button>
                </>
              )}
              {/* Short labels: the header is the most crowded row in the app
                  and these two were the widest things in it. The full meaning
                  moves to the tooltip rather than being lost. */}
              <button className="btn btn-sm btn-ghost" title="Share this project with the client" onClick={() => studio.setShowShareModal(true)}>
                Share
              </button>
              <button className="btn btn-sm" title="Export this wall as a PNG image" onClick={studio.exportPng} disabled={!state.elev || !state.scale}>
                Export
              </button>
            </>
          )}
          <FeedbackButton />
        </div>
      </div>

      {/* Expired client link. Sits directly under the header so it is the first
          thing seen on opening the project — the client cannot open their link
          and has no way to tell the consultant that. */}
      {expiryNoticeOpen && (
        <div className="studio-notice" role="status">
          <span className="studio-notice-text">
            The client link for this project has <strong>expired</strong> — your client can no longer open it.
          </span>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => studio.setShowShareModal(true)}
          >
            Generate a new link
          </button>
          <button
            className="studio-notice-close"
            onClick={() => setExpiryNoticeOpen(false)}
            aria-label="Dismiss"
            title="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Studio view — kept mounted (display:none when hidden) so the canvas DOM and artwork overlays are preserved */}
      <div style={{ display: view === 'studio' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Tab bar */}
        <TabBar
          elevations={elevations.map(e => ({
            id: e.id,
            name: e.name,
            visibleToClient: e.visibleToClient,
            options: labelOptions(e.elevation_options).map(o => ({
              key: o.option,
              letter: o.letter,
              label: o.label,
              title: o.title,
              name: cleanOptionName(o.name),
              hasArtworks: o.artworks.length > 0,
              hasClientNotes: (o.clientNotes ?? '').trim().length > 0,
            })),
          }))}
          activeElevId={activeElevId}
          activeOption={activeOption}
          onSwitch={handleSwitch}
          onAddElevation={addElevation}
          onRenameElevation={renameElevation}
          onDeleteElevation={deleteElevation}
          onSetVisibleToClient={setElevationVisibleToClient}
          onAddOption={addOption}
          onDeleteOption={deleteOption}
          onReorderOptions={reorderOptions}
          onRenameOption={renameOption}
        />

        {/* Main */}
        <div className="studio-main">
          <StudioSidebar
            studio={studio}
            optionId={optionId}
            projectId={project.id}
            onStatus={onStatus}
            clientNotes={activeOptData?.clientNotes ?? ''}
            activityLogs={activityLogs}
            onRequestDeleteArtworks={requestDeleteArtworks}
            approvalStatus={{
              pickedOption: activeElev?.clientPickedOption ?? null,
              pickedOptionTitle: optionTitleFor(activeElev?.elevation_options ?? [], activeElev?.clientPickedOption),
              approved: activeOptData?.approved ?? false,
              approvedAt: activeOptData?.approved_at ?? null,
            }}
            onUnapprove={handleConsultantUnapprove}
            budget={budget}
            onBudgetChange={updateBudget}
            optionNotes={notesOn(notes, 'option', optionId)}
            onAddNote={() => addNote('option', optionId)}
            onChangeNote={changeNote}
            onDeleteNote={deleteNote}
          />
          <StudioCanvas
            studio={studio}
            onStatus={onStatus}
            clientPickedOption={activeElev?.clientPickedOption ?? null}
            activeOption={activeOption}
          />
        </div>
      </div>

      {/* Notes view — mounted only when active */}
      {view === 'notes' && (
        <NotesScreen
          projectName={project.name}
          clientName={project.client_name}
          notes={notes}
          elevations={elevations}
          onAdd={addNote}
          onChange={changeNote}
          onDelete={deleteNote}
        />
      )}

      {/* Budget view — mounted only when active */}
      {view === 'budget' && (
        <BudgetScreen
          projectId={project.id}
          projectName={project.name}
          clientName={project.client_name}
          elevations={elevations.map<BudgetElevationData>(e => ({
            id: e.id,
            name: e.name,
            clientPickedOption: e.clientPickedOption,
            hiddenFromClient: !e.visibleToClient,
            options: labelOptions(e.elevation_options).map(o => ({
              key: o.option,
              label: o.label,
              title: o.title,
              name: cleanOptionName(o.name),
              consultantNote: o.consultantNote ?? '',
              consultantNoteShownToClient: o.consultantNoteShownToClient ?? true,
              artworks: o.artworks.map(a => ({
                id: a.id,
                workId: a.workId,
                name: a.name,
                artist: a.artist ?? '',
                wCm: a.wCm,
                hCm: a.hCm,
                price: a.price,
                visible: a.visible,
                note: a.note ?? '',
                noteShownToClient: a.noteShownToClient ?? true,
                vatApplies: a.vatApplies ?? true,
                discountStatus: a.discountStatus ?? 'none',
                discountPercent: a.discountPercent ?? null,
                subLineItems: a.subLineItems ?? [],
              })),
            })),
          }))}
          isConsultant={true}
          isPreviewingClientView={isPreviewingClientView}
          onPreviewToggle={() => setIsPreviewingClientView(v => !v)}
          clientBudget={budget}
          onClientBudgetChange={updateBudget}
          onArtworkChange={handleWorkChange}
          onOptionNoteChange={handleOptionNoteChange}
        />
      )}

      {/* Index view — every work in the project, placed or not. Mounted only when active. */}
      {view === 'index' && (
        <IndexScreen
          projectName={project.name}
          clientName={project.client_name}
          works={works}
          elevations={indexElevations}
          onWorkChange={handleWorkChange}
          onAddWork={() => setShowIndexAddModal(true)}
          onDeleteWork={id => setPendingDeleteWorkId(id)}
          notes={notes}
          onAddNote={addNote}
          onAddWorkSetNote={addWorkSetNote}
          onMergeWorks={ids => setPendingMerge({ ids, keepId: ids[0] })}
          onChangeNote={changeNote}
          onDeleteNote={deleteNote}
          artists={artists}
          onSetWorkArtist={setWorkArtist}
          onRenameArtist={renameArtist}
          onArtistNoteChange={changeArtistNote}
        />
      )}

      {/* Modals */}
      {studio.showScaleModal && (
        <CalibrationModal
          lineDispPx={studio.pendingCalibPx.current}
          onConfirm={studio.confirmScale}
          onCancel={studio.cancelCalibration}
        />
      )}

      {studio.showArtModal && (
        <AddArtworkModal
          onConfirm={studio.addArtworks}
          onCancel={() => studio.setShowArtModal(false)}
          wallPxPerCm={state.scale?.origPxPerCm ?? null}
          availableWorks={works.filter(w => !(activeOptData?.artworks ?? []).some(a => a.workId === w.id))}
          onPlaceExisting={studio.placeExistingWorks}
        />
      )}

      {showIndexAddModal && (
        <AddArtworkModal
          mode="index"
          onConfirm={addWorksToIndex}
          onCancel={() => setShowIndexAddModal(false)}
        />
      )}

      {/* Deleting a work from the project — from the index */}
      {pendingDeleteWorkId && (() => {
        const w = works.find(x => x.id === pendingDeleteWorkId)
        const placed = w ? placementsOf(w.id, indexElevations) : []
        return (
          <div className="modal-bg open" onClick={() => setPendingDeleteWorkId(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-title">Delete {w?.name ?? 'this work'} from the project?</div>
              <div className="modal-sub" style={{ color: 'var(--red)' }}>
                {placed.length > 0
                  ? `It comes off ${placed.map(p => p.elevationName).join(' and ')} as well. This cannot be undone.`
                  : 'Its image goes with it. This cannot be undone.'}
              </div>
              <div className="modal-footer">
                <button className="btn" onClick={() => setPendingDeleteWorkId(null)}>Cancel</button>
                <button
                  className="btn btn-danger"
                  onClick={() => { const id = pendingDeleteWorkId; setPendingDeleteWorkId(null); void deleteWork(id) }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {pendingMerge && (() => {
        const picked = pendingMerge.ids
          .map(id => works.find(w => w.id === id))
          .filter((w): w is Work => !!w)
        if (picked.length < 2) return null
        const keep = picked.find(w => w.id === pendingMerge.keepId) ?? picked[0]
        const drops = picked.filter(w => w.id !== keep.id)
        // Every option the keeper already hangs on that a dropped work is
        // also on. Those placements cannot both survive — a work hangs on an
        // option once — so say so before it happens rather than after.
        const keepOptionIds = new Set(
          elevations.flatMap(e => e.elevation_options
            .filter(o => o.artworks.some(a => a.workId === keep.id))
            .map(o => o.id)))
        const clashes = elevations.flatMap(e => e.elevation_options
          .filter(o => keepOptionIds.has(o.id) && o.artworks.some(a => drops.some(d => d.id === a.workId)))
          .map(() => e.name))
        const prices = new Set(picked.map(w => w.price))
        const names = new Set(picked.map(w => w.name.trim()))

        return (
          <div className="modal-bg open" onClick={() => setPendingMerge(null)}>
            <div className="modal modal--wide" onClick={e => e.stopPropagation()}>
              <div className="modal-title">Which record should be kept?</div>
              <div className="modal-sub">
                The one you keep carries the name, price and notes. The others are
                deleted and everywhere they hang moves across.
              </div>

              <div className="merge-choices">
                {picked.map(w => {
                  const placed = placementsOf(w.id, indexElevations)
                  const isKeeper = w.id === keep.id
                  return (
                    <label key={w.id} className={`merge-choice${isKeeper ? ' merge-choice--keep' : ''}`}>
                      <input
                        type="radio"
                        name="merge-keeper"
                        checked={isKeeper}
                        onChange={() => setPendingMerge({ ...pendingMerge, keepId: w.id })}
                      />
                      <span className="merge-choice-thumb">
                        {w.imageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={w.imageUrl} alt="" />
                          : <span className="index-thumb-empty">No image</span>}
                      </span>
                      <span className="merge-choice-text">
                        <span className="merge-choice-name">{w.name}</span>
                        <span className="merge-choice-meta">
                          {w.wCm} × {w.hCm} cm · {fmtGbp(w.price)}
                        </span>
                        <span className="merge-choice-meta">
                          {placed.length > 0
                            ? placed.map(pl => `${pl.elevationName} · ${pl.labels.join(', ')}`).join('  ·  ')
                            : 'Not on a wall'}
                        </span>
                      </span>
                      <span className="merge-choice-tag">{isKeeper ? 'Keep' : 'Delete'}</span>
                    </label>
                  )
                })}
              </div>

              {names.size > 1 && (
                <p className="modal-sub merge-warn">
                  These records have different names. Check the pictures above are
                  the same print before merging.
                </p>
              )}
              {prices.size > 1 && (
                <p className="modal-sub merge-warn">
                  Prices differ ({[...prices].map(fmtGbp).join(' and ')}). The kept
                  record&rsquo;s price is the one that stands.
                </p>
              )}
              {clashes.length > 0 && (
                <p className="modal-sub merge-warn">
                  Both hang on {[...new Set(clashes)].join(' and ')}. A work hangs on
                  an option once, so the duplicate placement comes off that wall.
                </p>
              )}

              <div className="modal-footer">
                <button className="btn" onClick={() => setPendingMerge(null)}>Cancel</button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const { id } = keep
                    const dropIds = drops.map(d => d.id)
                    setPendingMerge(null)
                    void mergeWorks(id, dropIds)
                  }}
                >
                  Merge into {keep.name}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {studio.showShareModal && (
        <ShareModal
          projectName={project.name}
          projectId={project.id}
          onGetToken={generateShareToken}
          onRegenerateToken={regenerateShareToken}
          onClose={() => studio.setShowShareModal(false)}
          onStatus={onStatus}
        />
      )}

      {/* Artwork delete confirmation modal */}
      {pendingDeleteIds && (
        <div className="modal-bg open" onClick={() => setPendingDeleteIds(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">
              Take {pendingDeleteIds.size} artwork{pendingDeleteIds.size !== 1 ? 's' : ''} off this wall?
            </div>
            <div className="modal-sub">
              {pendingDeleteIds.size !== 1 ? 'They stay' : 'It stays'} in the project — find
              {pendingDeleteIds.size !== 1 ? ' them' : ' it'} in the Index to hang again or delete for good.
            </div>
            <div className="modal-footer">
              <button className="btn" onClick={() => setPendingDeleteIds(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={confirmDeleteArtworks}>Remove</button>
            </div>
          </div>
        </div>
      )}

      <StatusToast message={toast} />
    </div>
  )
}
