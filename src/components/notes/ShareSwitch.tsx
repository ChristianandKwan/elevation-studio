'use client'

import { NOTE_SHARES, SHARE_META, type NoteShare } from '@/lib/notes'

interface Props {
  value: NoteShare
  onChange: (share: NoteShare) => void
  /** Tooltips, where the note shows somewhere other than the portal's walls. */
  titles?: Record<NoteShare, string>
}

/**
 * Who a note is for: Client or C&K. The one way of saying it, on ordinary
 * notes and on the budget's notes alike.
 */
export default function ShareSwitch({ value, onChange, titles }: Props) {
  return (
    <div className="note-share" role="radiogroup" aria-label="Who can see this note">
      {NOTE_SHARES.map(share => (
        <button
          key={share}
          type="button"
          role="radio"
          aria-checked={value === share}
          className={value === share ? 'on' : ''}
          title={titles ? titles[share] : SHARE_META[share].title}
          onClick={() => { if (value !== share) onChange(share) }}
        >
          {SHARE_META[share].label}
        </button>
      ))}
    </div>
  )
}
