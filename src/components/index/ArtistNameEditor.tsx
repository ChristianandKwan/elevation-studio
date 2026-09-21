'use client'

import { useState } from 'react'
import { canRenameTo, tidyArtistName, type Artist } from '@/lib/artists'

interface Props {
  artist: Artist
  artists: Artist[]
  onRename: (name: string) => void
}

/**
 * An artist's name, where you would expect to change it: on the heading that
 * bears it.
 *
 * Renaming used to mean editing every work of theirs one at a time, each a
 * fresh chance to spell it differently — and since migration 030 it would
 * also have orphaned their notes, which were anchored by name. Now the artist
 * is a row: this changes it once and the works and notes follow.
 */
export default function ArtistNameEditor({ artist, artists, onRename }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(artist.name)
  const [error, setError] = useState<string | null>(null)

  // Adjusted during render rather than in an effect: the name can change from
  // under this if it is renamed elsewhere.
  const [seen, setSeen] = useState(artist.name)
  if (artist.name !== seen) { setSeen(artist.name); setDraft(artist.name) }

  function commit() {
    const name = tidyArtistName(draft)
    if (name === artist.name) { setEditing(false); setError(null); return }
    const check = canRenameTo(artists, artist.id, name)
    if (!check.ok) { setError(check.reason); return }
    onRename(name)
    setEditing(false)
    setError(null)
  }

  function cancel() {
    setDraft(artist.name)
    setEditing(false)
    setError(null)
  }

  if (!editing) {
    return (
      <span className="artist-name">
        <span>{artist.name}</span>
        <button
          type="button"
          className="artist-rename-btn"
          title={`Rename ${artist.name} everywhere`}
          onClick={() => setEditing(true)}
        >
          Rename
        </button>
      </span>
    )
  }

  return (
    <span className="artist-name">
      <input
        type="text"
        className="artist-name-input"
        value={draft}
        autoFocus
        aria-label={`Name for ${artist.name}`}
        onChange={e => { setDraft(e.target.value); setError(null) }}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
      />
      <button type="button" className="btn btn-sm btn-primary" onClick={commit}>Save</button>
      <button type="button" className="btn btn-sm" onClick={cancel}>Cancel</button>
      {/* Every work of theirs changes too, which is the point and also a
          surprise if nobody says so. */}
      <span className="artist-rename-hint">
        {error ?? 'Changes their name on every work and keeps their notes.'}
      </span>
    </span>
  )
}
