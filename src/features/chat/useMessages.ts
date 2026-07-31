import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'

type Message = Database['public']['Tables']['messages']['Row'] & {
  sender?: { display_name: string | null; avatar_url: string | null } | null
  whisper_target?: { display_name: string | null; avatar_url: string | null } | null
}

export function useMessages(channelId: string | undefined) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    if (!channelId) {
      setLoading(false)
      return
    }

    async function fetchMessages() {
      try {
        const { data, error: fetchError } = await supabase
          .from('messages')
          .select('*, sender:profiles!messages_sender_id_fkey(display_name, avatar_url), whisper_target:profiles!messages_whisper_to_fkey(display_name, avatar_url)')
          .eq('channel_id', channelId)
          .order('created_at', { ascending: true })

        if (fetchError) throw fetchError

        if (mounted) {
          const formattedData = data.map(m => ({
            ...m,
            sender: Array.isArray(m.sender) ? m.sender[0] : m.sender,
            whisper_target: Array.isArray(m.whisper_target) ? m.whisper_target[0] : m.whisper_target,
          })) as Message[]
          
          setMessages(formattedData)
        }
      } catch (err: any) {
        console.error('Error fetching messages:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchMessages()

    const subscription = supabase
      .channel(`messages:${channelId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`
      }, async (payload) => {
        // When we get a new message, we also want the sender info.
        // Realtime doesn't send joined data, so we have to fetch it if it's an INSERT,
        // or just update local state if it's an UPDATE or DELETE.
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new as Message
          
          if (newMsg.sender_id || newMsg.whisper_to) {
            // Re-fetch this single message with joins
            const { data } = await supabase
              .from('messages')
              .select('*, sender:profiles!messages_sender_id_fkey(display_name, avatar_url), whisper_target:profiles!messages_whisper_to_fkey(display_name, avatar_url)')
              .eq('id', newMsg.id)
              .single()
              
            if (data && mounted) {
              const formatted = {
                ...data,
                sender: Array.isArray(data.sender) ? data.sender[0] : data.sender,
                whisper_target: Array.isArray(data.whisper_target) ? data.whisper_target[0] : data.whisper_target,
              } as Message
              setMessages(prev => [...prev, formatted])
            }
          } else {
             if (mounted) {
               setMessages(prev => [...prev, newMsg])
             }
          }
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = payload.new as Message
          if (mounted) {
            setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg } : m))
          }
        } else if (payload.eventType === 'DELETE') {
          const deletedId = payload.old.id
          // Depending on soft-delete logic, DELETE event might actually be hard-delete
          // (Soft delete is an UPDATE setting is_deleted=true).
          if (mounted) {
            setMessages(prev => prev.filter(m => m.id !== deletedId))
          }
        }
      })
      .subscribe()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [channelId])

  const sendMessage = async (payload: { content: string, type: 'regular' | 'scene', whisper_to?: string }) => {
    if (!channelId || !user) return
    const { error } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: user.id,
        content: payload.content,
        type: payload.type,
        whisper_to: payload.whisper_to || null,
      })
    if (error) throw error
  }

  const editMessage = async (messageId: string, content: string) => {
    const { error } = await supabase
      .from('messages')
      .update({ content, is_edited: true, updated_at: new Date().toISOString() })
      .eq('id', messageId)
    if (error) throw error
  }

  const deleteMessage = async (messageId: string) => {
    // Soft delete
    const { error } = await supabase
      .from('messages')
      .update({ is_deleted: true })
      .eq('id', messageId)
    if (error) throw error
  }

  return { messages, loading, error, sendMessage, editMessage, deleteMessage }
}
