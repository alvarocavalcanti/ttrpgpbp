import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
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
// boundary can't straddle pages.
export function useAdminThreads() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)

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

  const applyPage = useCallback((rows: Record<string, unknown>[], reset: boolean) => {
    setThreads(prev => {
      const page = rows.map(formatThread)
      const existing = new Set(prev.map(t => t.id))
      const merged = reset
        ? page
        : [...page.filter(t => !existing.has(t.id)), ...prev]
      return merged
    })
    setHasMore(rows.length === PAGE_SIZE)
  }, [])

  const fetchFirstPage = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await baseQuery().limit(PAGE_SIZE)
    if (queryError) {
      setError(queryError)
    } else {
      applyPage(data as Record<string, unknown>[], true)
    }
    setLoading(false)
  }, [applyPage])

  useEffect(() => {
    if (!user?.id) return
    void fetchFirstPage()

    const channel = supabase.channel('admin_threads_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_threads' }, () => void fetchFirstPage())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_messages' }, () => void fetchFirstPage())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_thread_reads', filter: `user_id=eq.${user?.id}` }, () => void fetchFirstPage())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user?.id, fetchFirstPage])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore || threads.length === 0) return
    const oldest = threads[threads.length - 1]
    setLoading(true)
    const { data, error: queryError } = await baseQuery()
      .or(`last_message_at.lt.${oldest.last_message_at},and(last_message_at.eq.${oldest.last_message_at},id.lt.${oldest.id})`)
      .limit(PAGE_SIZE)
    if (queryError) {
      setError(queryError)
    } else {
      applyPage(data as Record<string, unknown>[], false)
    }
    setLoading(false)
  }, [loading, hasMore, threads, applyPage])

  return { threads, loading, hasMore, loadMore, refetch: fetchFirstPage, error }
}