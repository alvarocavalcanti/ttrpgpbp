import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Thread } from './types'
import { useAuth } from '../auth/useAuth'

export function useAdminThreads() {
  const { user } = useAuth()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function fetchThreads() {
      if (!user?.id) return
      setLoading(true)

      const { data, error } = await supabase
        .from('admin_threads')
        .select(`
          *,
          creator:profiles!admin_threads_created_by_fkey(display_name, avatar_url),
          gm:profiles!admin_threads_gm_id_fkey(display_name, avatar_url),
          admin_thread_reads!left(last_read_at)
        `)
        .order('last_message_at', { ascending: false })

      if (!error && mounted) {
        const formatted = data.map(row => {
          const reads = Array.isArray(row.admin_thread_reads) ? row.admin_thread_reads : []
          const myRead = reads[0]?.last_read_at
          return {
            ...row,
            creator: Array.isArray(row.creator) ? row.creator[0] : row.creator,
            gm: row.gm ? (Array.isArray(row.gm) ? row.gm[0] : row.gm) : undefined,
            unread: !myRead || new Date(row.last_message_at) > new Date(myRead)
          }
        })
        setThreads(formatted as Thread[])
      }
      if (mounted) setLoading(false)
    }

    fetchThreads()

    const channel = supabase.channel('admin_threads_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_threads' }, () => fetchThreads())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'admin_messages' }, () => fetchThreads())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_thread_reads', filter: `user_id=eq.${user?.id}` }, () => fetchThreads())
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  return { threads, loading }
}
