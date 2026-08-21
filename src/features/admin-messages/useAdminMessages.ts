import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Message } from './types'

export function useAdminMessages(threadId: string | undefined) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    async function fetchMessages() {
      if (!threadId) return
      setLoading(true)

      const { data, error } = await supabase
        .from('admin_messages')
        .select(`
          *,
          sender:profiles!admin_messages_sender_id_fkey(display_name, avatar_url)
        `)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })

      if (!error && mounted) {
        setMessages(data.map(r => ({
          ...r,
          sender: Array.isArray(r.sender) ? r.sender[0] : r.sender
        })) as Message[])
      }
      if (mounted) setLoading(false)
    }

    fetchMessages()

    if (!threadId) return

    const channel = supabase.channel(`admin_messages_${threadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_messages', filter: `thread_id=eq.${threadId}` }, () => fetchMessages())
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [threadId])

  return { messages, loading }
}
