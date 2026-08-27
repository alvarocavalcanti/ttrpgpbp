import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Message } from './types'

const PAGE_SIZE = 50

function formatMessage(row: Record<string, unknown>): Message {
  return {
    ...row,
    sender: Array.isArray(row.sender) ? row.sender[0] : row.sender
  } as Message
}

// Newest-first fetch with a (created_at, id) cursor so a long thread keeps
// paginating past PostgREST's 1000-row cap without straddling same-timestamp
// rows. Display order stays ascending (oldest at top); older pages prepend.
export function useAdminMessages(threadId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const baseQuery = () =>
    supabase
      .from('admin_messages')
      .select(`
        *,
        sender:profiles!admin_messages_sender_id_fkey(display_name, avatar_url)
      `)
      .eq('thread_id', threadId as string)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

  const applyPage = useCallback((rows: Record<string, unknown>[], reset: boolean) => {
    setMessages(prev => {
      const page = rows.map(formatMessage)
      const existing = new Set(prev.map(m => m.id))
      if (reset) return page.reverse()
      const older = page.filter(m => !existing.has(m.id)).reverse()
      return [...older, ...prev]
    })
    setHasMore(rows.length === PAGE_SIZE)
  }, [])

  const fetchFirstPage = useCallback(async () => {
    if (!threadId) return
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await baseQuery().limit(PAGE_SIZE)
    if (queryError) {
      setError(queryError)
    } else {
      applyPage(data as Record<string, unknown>[], true)
    }
    setLoading(false)
  }, [threadId, applyPage])

  useEffect(() => {
    void fetchFirstPage()

    if (!threadId) return

    const channel = supabase.channel(`admin_messages_${threadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_messages', filter: `thread_id=eq.${threadId}` }, () => void fetchFirstPage())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [threadId, fetchFirstPage])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || messages.length === 0) return
    const oldest = messages[0]
    setLoading(true)
    const { data, error: queryError } = await baseQuery()
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .limit(PAGE_SIZE)
    if (queryError) {
      setError(queryError)
    } else {
      applyPage(data as Record<string, unknown>[], false)
    }
    setLoading(false)
  }, [loading, hasMore, messages, applyPage])

  return { messages, loading, hasMore, loadMore, refetch: fetchFirstPage, error }
}