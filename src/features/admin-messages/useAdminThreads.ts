import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { subscribeWithRetry } from '../../lib/realtime'
import type { Thread } from './types'
import { useAuth } from '../auth/useAuth'

const PAGE_SIZE = 50

function formatThread(row: Record<string, unknown>): Thread {
  const reads = Array.isArray(row.admin_thread_reads) ? row.admin_thread_reads : []
  const myRead = reads[0]?.last_read_at
  return {
    ...row,
    creator: Array.isArray(row.creator) ? row.creator[0] : row.creator,
    gm: row.gm ? (Array.isArray(row.gm) ? row.gm[0] : row.gm) : undefined,
    unread: !myRead || new Date(row.last_message_at as string) > new Date(myRead as string)
  } as Thread
}

// Cursor pagination over (last_message_at, id) so the thread list keeps
// working past PostgREST's 1000-row cap and equal timestamps at the page
// boundary can't straddle pages. Newest-first display; older pages append.
export function useAdminThreads() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // Bumped on every fetch start and on user change so a stale or overlapping
  // in-flight request (from an earlier refresh or a previous user) can't
  // overwrite newer threads/errors/loading state when it resolves.
  const generationRef = useRef(0)

  const baseQuery = () =>
    supabase
      .from('admin_threads')
      .select(`
        *,
        creator:profiles!admin_threads_created_by_fkey(display_name, avatar_url),
        gm:profiles!admin_threads_gm_id_fkey(display_name, avatar_url),
        admin_thread_reads!left(last_read_at)
      `)
      .order('last_message_at', { ascending: false })
      .order('id', { ascending: false })

  // Applies the newest page (newest-first). `reset` replaces the list (first
  // load); otherwise the newest rows merge by id and older cached rows stay at
  // the tail, so a realtime refresh or Retry keeps pages the user loaded.
  const applyNewestPage = useCallback((rows: Record<string, unknown>[], reset: boolean) => {
    const page = rows.map(formatThread)
    setThreads(prev => {
      if (reset) return page
      const pageIds = new Set(page.map(t => t.id))
      const retained = prev.filter(t => !pageIds.has(t.id))
      return [...page, ...retained]
    })
    setHasMore(rows.length === PAGE_SIZE)
  }, [])

  const fetchFirstPage = useCallback(async (reset: boolean) => {
    const generation = ++generationRef.current
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await baseQuery().limit(PAGE_SIZE)
    if (generation !== generationRef.current) return
    if (queryError) {
      setError(queryError)
    } else {
      applyNewestPage(data as Record<string, unknown>[], reset)
    }
    setLoading(false)
  }, [applyNewestPage])

  useEffect(() => {
    if (!user?.id) return
    // First load for this user replaces the list; realtime refreshes below merge.
    void fetchFirstPage(true)

    const channel = supabase.channel('admin_threads_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_threads' }, (payload) => {
        // A DELETE refreshes nothing (the row is gone from the newest page and
        // the merge would retain it), so drop the deleted id from the list.
        if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as { id?: string })?.id
          if (deletedId) setThreads(prev => prev.filter(t => t.id !== deletedId))
          return
        }
        void fetchFirstPage(false)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_messages' }, () => void fetchFirstPage(false))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_thread_reads', filter: `user_id=eq.${user?.id}` }, () => void fetchFirstPage(false))
    // subscribeWithRetry resubscribes after a drop and refetches so events
    // missed while offline are recovered (#336).
    let firstSubscribe = true
    const stopRealtime = subscribeWithRetry(channel, 'admin_threads_list', (status) => {
      if (status !== 'SUBSCRIBED') return
      if (firstSubscribe) {
        firstSubscribe = false
        return
      }
      void fetchFirstPage(false)
    })

    return () => {
      stopRealtime()
      supabase.removeChannel(channel)
    }
  }, [user?.id, fetchFirstPage])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || threads.length === 0) return
    const oldest = threads[threads.length - 1]
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await baseQuery()
      .or(`last_message_at.lt.${oldest.last_message_at},and(last_message_at.eq.${oldest.last_message_at},id.lt.${oldest.id})`)
      .limit(PAGE_SIZE)
    if (queryError) {
      setError(queryError)
    } else {
      const older = (data as Record<string, unknown>[]).map(formatThread)
      setThreads(prev => {
        const existing = new Set(prev.map(t => t.id))
        return [...prev, ...older.filter(t => !existing.has(t.id))]
      })
      setHasMore((data as Record<string, unknown>[]).length === PAGE_SIZE)
    }
    setLoading(false)
  }, [loading, hasMore, threads])

  // Retry merges the newest page into what's already loaded, so an error after
  // loadMore doesn't wipe the older threads the user fetched.
  const refetch = useCallback(() => void fetchFirstPage(false), [fetchFirstPage])

  return { threads, loading, hasMore, loadMore, refetch, error }
}