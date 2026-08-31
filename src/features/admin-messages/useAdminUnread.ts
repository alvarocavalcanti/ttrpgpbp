import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { subscribeWithRetry } from '../../lib/realtime'
import { useAuth } from '../auth/useAuth'

export function useAdminUnread() {
  const { user } = useAuth()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    let mounted = true

    async function fetchUnread() {
      if (!user?.id) return
      
      const { data, error } = await supabase.rpc('get_admin_unread_count', { p_user_id: user.id })
      if (!error && mounted) {
        setUnreadCount(data || 0)
      }
    }

    fetchUnread()

    // Setup realtime subscription to admin_messages for this user
    // We listen to all messages, but since RLS protects them, we only get events for threads we can read.
    const channel = supabase.channel('admin_comms_unread')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'admin_messages' },
        () => fetchUnread()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_thread_reads', filter: `user_id=eq.${user?.id}` },
        () => fetchUnread()
      )
      // subscribeWithRetry resubscribes after a drop and refetches so the
      // unread count recovers instead of freezing (#336).
      let firstSubscribe = true
      const stopRealtime = subscribeWithRetry(channel, 'admin_comms_unread', (status) => {
        if (status !== 'SUBSCRIBED') return
        if (firstSubscribe) {
          firstSubscribe = false
          return
        }
        fetchUnread()
      })

    // Listen to push messages as a fallback
    function handlePush(event: MessageEvent) {
      if (event.data?.type === 'PUSH_RECEIVED') fetchUnread()
    }
    navigator.serviceWorker?.addEventListener('message', handlePush)

    // Visibility change
    const handleVis = () => document.visibilityState === 'visible' && fetchUnread()
    document.addEventListener('visibilitychange', handleVis)

    return () => {
      mounted = false
      stopRealtime()
      supabase.removeChannel(channel)
      navigator.serviceWorker?.removeEventListener('message', handlePush)
      document.removeEventListener('visibilitychange', handleVis)
    }
  }, [user?.id])

  return unreadCount
}
