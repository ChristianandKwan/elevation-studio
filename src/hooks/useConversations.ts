'use client'

import { useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MESSAGE_COLUMNS, cleanMessage, messagesByOption, rowToMessage, unreadCount,
  type OptionMessage, type OptionMessageRow,
} from '@/lib/messages'

/**
 * The studio's side of every option's conversation (migration 038).
 *
 * Kept out of StudioScreen so the screen only wires it up: what a reply
 * writes, and what "read" means, live here and nowhere else.
 */
export function useConversations(
  projectId: string,
  initial: OptionMessage[],
  onStatus: (msg: string) => void,
) {
  const [byOption, setByOption] = useState(() => messagesByOption(initial))

  const messagesFor = useCallback(
    (optionId: string) => byOption[optionId] ?? [],
    [byOption],
  )

  const unreadFor = useCallback(
    (optionId: string) => unreadCount(byOption[optionId]),
    [byOption],
  )

  /** Reply as C&K. Resolves true once saved, so the box can clear. */
  const reply = useCallback(async (optionId: string, raw: string): Promise<boolean> => {
    const body = cleanMessage(raw)
    if (!body) return false
    const supabase = createClient()
    const { data, error } = await supabase
      .from('option_messages')
      .insert({ project_id: projectId, option_id: optionId, author: 'studio', body })
      .select(MESSAGE_COLUMNS)
      .single()
    if (error || !data) {
      onStatus('Could not send the reply — please try again')
      return false
    }
    const message = rowToMessage(data as OptionMessageRow)
    setByOption(prev => ({ ...prev, [optionId]: [...(prev[optionId] ?? []), message] }))
    return true
  }, [projectId, onStatus])

  /**
   * Mark the client's messages on an option as seen. The studio calls this
   * when it moves off an option, not when it arrives: the "New" marks stay
   * while the conversation is being read, and are gone from the tab once it
   * has been.
   */
  const markRead = useCallback(async (optionId: string) => {
    const unread = (byOption[optionId] ?? []).filter(m => m.author === 'client' && !m.readAt)
    if (unread.length === 0) return
    const readAt = new Date().toISOString()
    const ids = new Set(unread.map(m => m.id))
    const supabase = createClient()
    const { error } = await supabase
      .from('option_messages')
      .update({ read_at: readAt })
      .in('id', [...ids])
    // Best-effort: failing leaves them marked new, which is the safe side.
    if (error) { console.warn('option_messages read_at failed:', error.message); return }
    setByOption(prev => ({
      ...prev,
      [optionId]: (prev[optionId] ?? []).map(m => (ids.has(m.id) ? { ...m, readAt } : m)),
    }))
  }, [byOption])

  return { messagesFor, unreadFor, reply, markRead }
}
