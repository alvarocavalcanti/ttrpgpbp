import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { subscribeWithRetry } from '../../lib/realtime'
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
  // Bumped on threadId change so a slow in-flight request for an old thread
  // can't overwrite a newer thread's messages when it resolves.
  const generationRef = useRef(0)
  // Monotonic id per fetchFirstPage invocation: two requests can share a
  // generation (initial fetch + realtime refresh), and a slow earlier one must
  // not overwrite a newer one's result.
  const requestSeqRef = useRef(0)

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

  // Applies the newest page. `reset` replaces the list (first load / thread
  // change); otherwise the newest rows merge by id over the cached list so a
  // realtime refresh or Retry keeps older pages the user already loaded.
  const applyNewestPage = useCallback((rows: Record<string, unknown>[], reset: boolean) => {
    const fetched = rows.map(formatMessage)
    setMessages(prev => {
      if (reset) return fetched.reverse()
      const fetchedIds = new Set(fetched.map(m => m.id))
      const retained = prev.filter(m => !fetchedIds.has(m.id))
      return [...retained, ...fetched.reverse()]
    })
    setHasMore(rows.length === PAGE_SIZE)
  }, [])

  const fetchFirstPage = useCallback(async (reset: boolean, generation: number) => {
    if (!threadId) return
    const requestId = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await baseQuery().limit(PAGE_SIZE)
    // Thread switch discards everything; a superseded request (a newer fetch
    // started after this one) drops its result without touching state.
    if (generation !== generationRef.current) return
    if (requestId !== requestSeqRef.current) return
    if (queryError) {
      setError(queryError)
    } else {
      applyNewestPage(data as Record<string, unknown>[], reset)
    }
    setLoading(false)
  }, [threadId, applyNewestPage])

  useEffect(() => {
    const generation = ++generationRef.current
    void fetchFirstPage(true, generation)

    if (!threadId) return

    const channel = supabase.channel(`admin_messages_${threadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_messages', filter: `thread_id=eq.${threadId}` }, () => void fetchFirstPage(false, generation))
    // subscribeWithRetry resubscribes after a drop and refetches so messages
    // missed while offline are recovered (#336). Only a genuinely-first
    // successful subscription skips the refetch — the initial fetch already
    // covers it. If the first attempt fails, the first successful retry runs
    // the fetch (nothing was loaded while the socket was down).
    let firstSubscribe = true
    let sawFailure = false
    const stopRealtime = subscribeWithRetry(channel, `admin_messages_${threadId}`, (status) => {
      if (status !== 'SUBSCRIBED') {
        sawFailure = true
        return
      }
      if (firstSubscribe && !sawFailure) {
        firstSubscribe = false
        return
      }
      void fetchFirstPage(false, generation)
    })

    return () => {
      stopRealtime()
      supabase.removeChannel(channel)
    }
  }, [threadId, fetchFirstPage])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || messages.length === 0) return
    const oldest = messages[0]
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await baseQuery()
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
      .limit(PAGE_SIZE)
    if (queryError) {
      setError(queryError)
    } else {
      const older = (data as Record<string, unknown>[]).map(formatMessage).reverse()
      setMessages(prev => {
        const existing = new Set(prev.map(m => m.id))
        return [...older.filter(m => !existing.has(m.id)), ...prev]
      })
      setHasMore((data as Record<string, unknown>[]).length === PAGE_SIZE)
    }
    setLoading(false)
  }, [loading, hasMore, messages])

  const refetch = useCallback(() => void fetchFirstPage(false, generationRef.current), [fetchFirstPage])

  return { messages, loading, hasMore, loadMore, refetch, error }
}