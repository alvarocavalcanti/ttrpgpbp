import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
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
      .subscribe()

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
      supabase.removeChannel(channel)
      navigator.serviceWorker?.removeEventListener('message', handlePush)
      document.removeEventListener('visibilitychange', handleVis)
    }
  }, [user?.id])

  return unreadCount
}
