import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import { parseAndRoll } from '../dice/parser'
import type { ChatMessage } from './types'

export interface ReactionSummary {
  emoji: string
  count: number
  hasReacted: boolean
}

type ReactionRow = Database['public']['Tables']['message_reactions']['Row']

type Message = ChatMessage

// PostgREST can't embed self-referencing FKs via hint or bare embed, so we use
// the `reply_message` computed relationship function (see migration
// 20260807161732_add_reply_message_function.sql).
const MESSAGE_SELECT = '*, sender:profiles!messages_sender_id_fkey(display_name, avatar_url), whisper_target:profiles!messages_whisper_to_fkey(display_name, avatar_url), reply:reply_message(id, content, sender_id, is_deleted, type)'

function formatMessage(m: any): Message {
  return {
    ...m,
    sender: Array.isArray(m.sender) ? m.sender[0] : m.sender,
    whisper_target: Array.isArray(m.whisper_target) ? m.whisper_target[0] : m.whisper_target,
    reply: Array.isArray(m.reply) ? m.reply[0] : m.reply,
  }
}

// Aggregates reaction rows into per-message summaries.
function buildReactionMap(rows: ReactionRow[], userId: string | undefined): Record<string, ReactionSummary[]> {
  const map: Record<string, ReactionSummary[]> = {}
  for (const row of rows) {
    const list = (map[row.message_id] ??= [])
    let entry = list.find(e => e.emoji === row.emoji)
    if (!entry) {
      entry = { emoji: row.emoji, count: 0, hasReacted: false }
      list.push(entry)
    }
    entry.count += 1
    if (row.user_id === userId) entry.hasReacted = true
  }
  return map
}

// Both updaters copy only the affected message's reaction array instead of
// deep-cloning the whole map (M8); unaffected messages keep stable references
// so React.memo on MessageItem can skip them.
function upsertReaction(map: Record<string, ReactionSummary[]>, row: ReactionRow, userId: string | undefined) {
  const list = map[row.message_id] ?? []
  const idx = list.findIndex(e => e.emoji === row.emoji)
  if (idx === -1) {
    return { ...map, [row.message_id]: [...list, { emoji: row.emoji, count: 1, hasReacted: row.user_id === userId }] }
  }
  const entry = list[idx]
  const nextEntry = { ...entry, count: entry.count + 1, hasReacted: entry.hasReacted || row.user_id === userId }
  return { ...map, [row.message_id]: list.map((e, i) => (i === idx ? nextEntry : e)) }
}

function dropReaction(map: Record<string, ReactionSummary[]>, row: ReactionRow, userId: string | undefined) {
  const list = map[row.message_id]
  if (!list) return map
  const idx = list.findIndex(e => e.emoji === row.emoji)
  if (idx === -1) return map
  const entry = list[idx]
  const count = Math.max(0, entry.count - 1)
  const nextEntry = { ...entry, count, hasReacted: row.user_id === userId ? false : entry.hasReacted }
  if (count === 0) {
    const remaining = list.filter((_, i) => i !== idx)
    if (remaining.length === 0) {
      const next = { ...map }
      delete next[row.message_id]
      return next
    }
    return { ...map, [row.message_id]: remaining }
  }
  return { ...map, [row.message_id]: list.map((e, i) => (i === idx ? nextEntry : e)) }
}

export function useMessages(channelId: string | undefined) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [reactions, setReactions] = useState<Record<string, ReactionSummary[]>>({})
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
          .select(MESSAGE_SELECT)
          .eq('channel_id', channelId as string)
          .order('created_at', { ascending: true })

        if (fetchError) throw fetchError

        if (mounted) {
          setMessages((data || []).map(formatMessage))
        }
      } catch (err: any) {
        console.error('Error fetching messages:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    async function fetchReactions() {
      try {
        const { data, error } = await supabase
          .from('message_reactions')
          .select('*')
          .eq('channel_id', channelId as string)
        if (error) throw error
        if (mounted) {
          setReactions(buildReactionMap(data || [], user?.id))
        }
      } catch (err: any) {
        // Reactions are non-critical; log without failing the channel view.
        console.error('Error fetching reactions:', err)
      }
    }

    fetchMessages()
    fetchReactions()

    const subscription = supabase
      .channel(`chat:${channelId}`)
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
              .select(MESSAGE_SELECT)
              .eq('id', newMsg.id)
              .single()

            if (data && mounted) {
              setMessages(prev => [...prev, formatMessage(data)])
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
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'message_reactions',
        filter: `channel_id=eq.${channelId}`
      }, (payload) => {
        if (!mounted) return
        if (payload.eventType === 'INSERT') {
          const row = payload.new as ReactionRow
          setReactions(prev => upsertReaction(prev, row, user?.id))
        } else if (payload.eventType === 'DELETE') {
          const row = payload.old as ReactionRow
          setReactions(prev => dropReaction(prev, row, user?.id))
        }
      })
      .subscribe()

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [channelId, user?.id])

  const sendMessage = useCallback(async (payload: { content: string, type: 'regular' | 'scene' | 'npc', whisper_to?: string, active_player_ids?: string[], reply_to?: string, mention_user_ids?: string[], npc_name?: string, npc_avatar_url?: string }) => {
    if (!channelId || !user) return

    // Persist the NPC roster row so future autocomplete/pickers see it.
    // ignoreDuplicates keeps a concurrently-created same-name NPC's row intact.
    if (payload.type === 'npc' && payload.npc_name && payload.npc_avatar_url) {
      const { error: npcError } = await supabase
        .from('channel_npcs')
        .upsert(
          { channel_id: channelId, name: payload.npc_name, avatar_url: payload.npc_avatar_url },
          { onConflict: 'channel_id,name', ignoreDuplicates: true }
        )
      if (npcError) throw npcError
    }

    const { data: inserted, error } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: user.id,
        content: payload.content,
        type: payload.type,
        whisper_to: payload.whisper_to || null,
        reply_to: payload.reply_to ?? null,
        npc_name: payload.npc_name || null,
        npc_avatar_url: payload.npc_avatar_url || null,
      })
      .select('id')
      .single()
    if (error) throw error

    // Invoke push notifications function for the new message. The function
    // derives content/channel/sender from the message row by id.
    const messageId = inserted?.id
    if (messageId) {
      supabase.functions.invoke('push-notifications', {
        body: { table: 'messages', message_id: messageId, mention_user_ids: payload.mention_user_ids }
      }).catch(err => console.error('Failed to trigger push for message', err))
    }

    // If active_player_ids is provided, update the channel_members table
    if (payload.active_player_ids) {
      // 1. Reset everyone to false
      const { error: resetError } = await supabase
        .from('channel_members')
        .update({ is_active_player: false })
        .eq('channel_id', channelId)
      if (resetError) console.error('Failed to reset active players', resetError)

      // 2. Set selected to true
      if (payload.active_player_ids.length > 0) {
        const { error: setActiveError, data: updatedMembers } = await supabase
          .from('channel_members')
          .update({ is_active_player: true })
          .eq('channel_id', channelId)
          .in('user_id', payload.active_player_ids)
          .select()

        if (setActiveError) console.error('Failed to set active players', setActiveError)

        // Trigger push for active players
        if (updatedMembers) {
          updatedMembers.forEach(member => {
            supabase.functions.invoke('push-notifications', {
              body: { table: 'channel_members', member_id: member.id }
            }).catch(err => console.error('Failed to trigger push for turn', err))
          })
        }
      }
    }
  }, [channelId, user?.id])

  const sendDiceRoll = useCallback(async (notation: string, replyToId?: string, warning?: string) => {
    if (!channelId || !user) return

    // Perform the roll calculation
    const rollResult = parseAndRoll(notation)

    // Insert message first; an optional warning (e.g. a missing modifier notice
    // from a check roll) is kept out of the notation but shown in the content.
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        channel_id: channelId,
        sender_id: user.id,
        content: `Rolled ${notation}: **${rollResult.total}**${warning ? `\n\n${warning}` : ''}`,
        type: 'dice_roll',
        reply_to: replyToId ?? null
      })
      .select()
      .single()

    if (messageError) throw messageError

    // Insert dice roll log
    const { error: rollError } = await supabase
      .from('dice_rolls')
      .insert({
        message_id: message.id,
        channel_id: channelId,
        roller_id: user.id,
        notation: notation,
        result: rollResult.total,
        breakdown: {
          rolls: rollResult.rolls,
          dropped: rollResult.dropped,
          modifier: rollResult.modifier
        }
      })

    if (rollError) throw rollError

    // Invoke push notifications function for the new dice roll
    supabase.functions.invoke('push-notifications', {
      body: { table: 'messages', message_id: message.id }
    }).catch(err => console.error('Failed to trigger push for message', err))
  }, [channelId, user?.id])

  const editMessage = useCallback(async (messageId: string, content: string) => {
    const { error } = await supabase
      .from('messages')
      .update({ content, is_edited: true, updated_at: new Date().toISOString() })
      .eq('id', messageId)
    if (error) throw error
  }, [])

  const deleteMessage = useCallback(async (messageId: string) => {
    // Soft delete
    const { error } = await supabase
      .from('messages')
      .update({ is_deleted: true })
      .eq('id', messageId)
    if (error) throw error
  }, [])

  const addReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!channelId || !user) return
    const { error } = await supabase
      .from('message_reactions')
      .insert({ message_id: messageId, channel_id: channelId, user_id: user.id, emoji })
    if (error) throw error
  }, [channelId, user?.id])

  const removeReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!user) return
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .match({ message_id: messageId, user_id: user.id, emoji })
    if (error) throw error
  }, [user?.id])

  return { messages, reactions, loading, error, sendMessage, sendDiceRoll, editMessage, deleteMessage, addReaction, removeReaction }
}
