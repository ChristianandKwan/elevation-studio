'use client'

import { useState } from 'react'
import { MESSAGE_MAX_LENGTH, messageWhen, type MessageAuthor, type OptionMessage } from '@/lib/messages'

/**
 * Who is reading. The same conversation reads differently from each side —
 * "You" is whoever is looking — and the box beneath says who it goes to.
 */
export type ConversationViewer = 'client' | 'studio'

interface Props {
  messages: OptionMessage[]
  viewer: ConversationViewer
  /** Resolves true once the message is saved; the box is cleared only then. */
  onSend: (body: string) => Promise<boolean>
  /** What happens when they press Send, said once under the box. */
  hint: string
  /** Shown when nobody has written anything yet. Omitted, the list is just empty. */
  emptyText?: string
}

const WHO: Record<ConversationViewer, Record<MessageAuthor, string>> = {
  client: { client: 'You', studio: 'Christian & Kwan' },
  studio: { client: 'Client', studio: 'C&K' },
}

const PLACEHOLDER: Record<ConversationViewer, string> = {
  client: 'Ask a question or leave a note…',
  studio: 'Reply as Christian & Kwan…',
}

/**
 * The conversation on one option — the portal's and the studio's.
 *
 * Replaces the client's single notes box, which saved as they typed and kept
 * only its latest text. A message is sent on purpose, kept, and dated, so the
 * email about it carries what they meant to say rather than a sentence caught
 * half-typed, and the pack has the whole exchange.
 *
 * Mount it with `key` set to the option's id: the unsent draft belongs to
 * the option it was being written on.
 */
export default function Conversation({ messages, viewer, onSend, hint, emptyText }: Props) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const canSend = draft.trim().length > 0 && draft.length <= MESSAGE_MAX_LENGTH && !sending

  async function send() {
    if (!canSend) return
    setSending(true)
    const ok = await onSend(draft)
    setSending(false)
    if (ok) setDraft('')
  }

  return (
    <div className={`convo convo--${viewer}`}>
      {messages.length === 0 && emptyText && <p className="convo-empty">{emptyText}</p>}

      {messages.length > 0 && (
        <ol className="convo-list">
          {messages.map(m => {
            const isNew = viewer === 'studio' && m.author === 'client' && !m.readAt
            return (
              <li key={m.id} className={`convo-msg from-${m.author}${isNew ? ' is-new' : ''}`}>
                <div className="convo-meta">
                  <span className="convo-who">{WHO[viewer][m.author]}{isNew && <span className="convo-new">New</span>}</span>
                  <time className="convo-when" dateTime={m.createdAt}>{messageWhen(m.createdAt)}</time>
                </div>
                <div className="convo-body">{m.body}</div>
              </li>
            )
          })}
        </ol>
      )}

      <textarea
        className="convo-input"
        aria-label={viewer === 'client' ? 'Your message to Christian & Kwan' : 'Reply to the client'}
        placeholder={PLACEHOLDER[viewer]}
        value={draft}
        maxLength={MESSAGE_MAX_LENGTH}
        onChange={e => setDraft(e.target.value)}
        // Cmd/Ctrl+Enter sends; a plain Enter is a new line, because these
        // are notes as often as they are questions.
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send() } }}
      />
      <div className="convo-foot">
        <span className="convo-hint">{hint}</span>
        <button type="button" className="btn btn-primary btn-sm convo-send" disabled={!canSend} onClick={() => void send()}>
          {sending ? 'Sending…' : viewer === 'client' ? 'Send' : 'Reply'}
        </button>
      </div>
    </div>
  )
}
