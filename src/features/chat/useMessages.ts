import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import type { ChatMessage } from './types'
import { subscribeWithRetry } from '../../lib/realtime'
import { MAX_MESSAGE_LENGTH, MAX_ROLL_WARNING_LENGTH } from '../../constants'
import { parseServerMessage, ReactionRowSchema } from './validation'

export interface ReactionSummary {
  emoji: string
  count: number
  hasReacted: boolean
}

type ReactionRow = Database['public']['Tables']['message_reactions']['Row']

type Message = ChatMessage

// Latest-N pagination: only a bounded window of history is held in memory;
// older pages load on demand (C5).
const PAGE_SIZE = 50

// PostgREST can't embed self-referencing FKs via hint or bare embed, so we use
// the `reply_message` computed relationship function (see migration
// 20260807161732_add_reply_message_function.sql).
const MESSAGE_SELECT = '*, sender:profiles!messages_sender_id_fkey(display_name, avatar_url), whisper_target:profiles!messages_whisper_to_fkey(display_name, avatar_url), reply:reply_message(id, content, sender_id, is_deleted, type)'

// Validates a raw server message (Realtime or PostgREST row) and normalizes
// joined embeds. Returns null for malformed rows so callers can drop them
// instead of crashing reducers with a bad payload (#305).
function formatMessage(m: unknown): Message | null {
  return parseServerMessage(m) as Message | null
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
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  // Live view of messages so async catch-up can compute the newest held row
  // without stale-closure reads inside the subscribe effect (same pattern as
  // reactionsRef in ChannelView).
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => {
    let mounted = true
    // Drop any state from a previous channel (route change keeps this hook
    // mounted), so we never render another channel's messages.
    setMessages([])
    setReactions({})
    setHasMore(false)
    setError(null)
    setLoading(true)

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
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE)

        if (fetchError) throw fetchError

        if (mounted) {
          // Newest-first fetch; reverse for ascending display. Keep live rows
          // received while this request was in flight and dedupe by id.
          const fetched = (data || []).map(formatMessage).filter((m): m is Message => m !== null).reverse()
          setMessages(prev => {
            const fetchedIds = new Set(fetched.map(message => message.id))
            const merged = [...prev.filter(message => !fetchedIds.has(message.id)), ...fetched]
            if (merged.every(message => message.created_at)) {
              merged.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
            }
            return merged
          })
          setHasMore((data || []).length === PAGE_SIZE)
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

    // Cursor catch-up after a disconnect/background gap. Unlike fetchMessages
    // (which only reloads the newest PAGE_SIZE window), this paginates forward
    // from the newest message we still hold, so more than PAGE_SIZE missed
    // inserts are recovered instead of silently dropped.
    async function catchUp() {
      const held = messagesRef.current
      const newest = held.reduce<Message | null>((max, m) => (!max || (m.created_at ?? '') > max.created_at ? m : max), null)
      if (!newest?.created_at) {
        await fetchMessages()
        return
      }
      // ponytail: created_at cursor; equal timestamps at the boundary could
      // straddle pages. Microsecond precision makes it a non-issue in practice;
      // an id-based cursor is the upgrade path if it ever bites.
      let cursor = newest.created_at
      for (let guard = 0; guard < 100; guard += 1) {
        if (!mounted) return
        const { data, error } = await supabase
          .from('messages')
          .select(MESSAGE_SELECT)
          .eq('channel_id', channelId as string)
          .gt('created_at', cursor)
          .order('created_at', { ascending: true })
          .limit(PAGE_SIZE)
        if (error) {
          console.error('Error catching up messages:', error)
          if (mounted) setError(error)
          return
        }
        const batch = (data || []).map(formatMessage).filter((m): m is Message => m !== null)
        if (batch.length === 0) return
        setMessages(prev => {
          const existing = new Set(prev.map(m => m.id))
          const merged = [...prev, ...batch.filter(m => !existing.has(m.id))]
          merged.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
          return merged
        })
        cursor = batch[batch.length - 1].created_at
        if (batch.length < PAGE_SIZE) return
      }
    }

    fetchMessages()
    fetchReactions()

    let firstSubscribe = true
    const realtimeChannel = supabase
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
          const newMsg = parseServerMessage(payload.new)
          if (!newMsg) return

          if (newMsg.sender_id || newMsg.whisper_to) {
            // Re-fetch this single message with joins
            const { data } = await supabase
              .from('messages')
              .select(MESSAGE_SELECT)
              .eq('id', newMsg.id)
              .single()

            const fetched = data && formatMessage(data)
            if (fetched && mounted) {
              setMessages(prev => {
                // Remove any old version of this message (either matched by temporary client_request_id or real id)
                const filtered = prev.filter(m => m.id !== fetched.id && (newMsg.client_request_id ? m.client_request_id !== newMsg.client_request_id : true))
                return [...filtered, fetched].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
              })
            }
          } else {
            if (mounted) {
              setMessages(prev => {
                // Remove any old version of this message (either matched by temporary client_request_id or real id)
                const filtered = prev.filter(m => m.id !== newMsg.id && (newMsg.client_request_id ? m.client_request_id !== newMsg.client_request_id : true))
                return [...filtered, newMsg as Message].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
              })
            }
          }
        } else if (payload.eventType === 'UPDATE') {
          const updatedMsg = parseServerMessage(payload.new)
          if (!updatedMsg || !mounted) return
          setMessages(prev => prev.map(m => m.id === updatedMsg.id ? { ...m, ...updatedMsg as Message } : m))
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
          const row = ReactionRowSchema.safeParse(payload.new)
          if (!row.success) return
          setReactions(prev => upsertReaction(prev, row.data, user?.id))
        } else if (payload.eventType === 'DELETE') {
          const row = ReactionRowSchema.safeParse(payload.old)
          if (!row.success) return
          setReactions(prev => dropReaction(prev, row.data, user?.id))
        }
      })
    const stopRealtime = subscribeWithRetry(realtimeChannel, `chat:${channelId}`, (status) => {
        // The first SUBSCRIBED follows the initial fetch already running;
        // a later SUBSCRIBED means we reconnected after a drop, so reconcile by
        // refetching the newest page. Idempotent application (messages are
        // keyed by id) makes any overlap with live events harmless.
        if (mounted && status === 'SUBSCRIBED') {
          if (firstSubscribe) {
            firstSubscribe = false
          } else {
            void Promise.all([catchUp(), fetchReactions()])
          }
        }
      })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void Promise.all([catchUp(), fetchReactions()])
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
  }, [channelId, user?.id])

  // Loads the page older than the oldest loaded message and prepends it.
  const loadOlder = useCallback(async () => {
    if (!channelId || loadingOlder || !hasMore || messages.length === 0) return
    setLoadingOlder(true)
    const oldest = messages[0]
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('channel_id', channelId)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (error) throw error

      // ponytail: created_at cursor; equal timestamps at the boundary could
      // straddle pages. Microsecond precision makes it a non-issue in practice;
      // an id-based cursor is the upgrade path if it ever bites.
      const older = (data || []).map(formatMessage).filter((m): m is Message => m !== null).reverse()
      setMessages(prev => {
        const existing = new Set(prev.map(m => m.id))
        return [...older.filter(m => !existing.has(m.id)), ...prev]
      })
      setHasMore((data || []).length === PAGE_SIZE)
    } catch (err: any) {
      console.error('Error loading older messages:', err)
      setError(err)
    } finally {
      setLoadingOlder(false)
    }
  }, [channelId, loadingOlder, hasMore, messages])

  // Reconcile an optimistic message with the server-returned id (clears
  // pending + error). Both send_message and roll_dice are idempotent on
  // client_request_id, so a retry that gets here is safe from duplicates.
  const applyRpcResult = useCallback((clientRequestId: string, data: any) => {
    const row = Array.isArray(data) ? data[0] : data
    if (row?.message_id) {
      setMessages(prev => prev.map(m => m.client_request_id === clientRequestId ? { ...m, id: row.message_id, pending: false, error: null } : m))
    }
  }, [])

  const sendMessage = useCallback(async (payload: { content: string, type: 'regular' | 'scene' | 'npc', whisper_to?: string, active_player_ids?: string[], reply_to?: string, npc_name?: string, npc_avatar_url?: string }) => {
    if (!channelId || !user) return
    if (payload.content.length > MAX_MESSAGE_LENGTH) throw new Error(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`)

    const clientRequestId = crypto.randomUUID()

    const optimisticMsg: Message = {
      id: clientRequestId, // temporary ID
      channel_id: channelId,
      sender_id: user.id,
      content: payload.content,
      type: payload.type,
      whisper_to: payload.whisper_to ?? null,
      reply_to: payload.reply_to ?? null,
      npc_name: payload.npc_name ?? null,
      npc_avatar_url: payload.npc_avatar_url ?? null,
      is_deleted: false,
      is_edited: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      roll_dc: null,
      roll_success: null,
      client_request_id: clientRequestId,
      pending: true,
      pending_payload: payload,
      reply_message: null,
      sender: user as any, mention_user_ids: null, search_vector: null as any, // sufficient for local display
    }

    setMessages(prev => [...prev, optimisticMsg].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)))

    const { data, error } = await supabase.rpc('send_message', {
      p_channel_id: channelId,
      p_content: payload.content,
      p_type: payload.type,
      p_reply_to: payload.reply_to ?? undefined,
      p_whisper_to: payload.whisper_to ?? undefined,
      p_active_player_ids: payload.active_player_ids ?? undefined,
      p_npc_name: payload.npc_name ?? undefined,
      p_npc_avatar_url: payload.npc_avatar_url ?? undefined,
      p_client_request_id: clientRequestId,
    })

    if (error) {
      setMessages(prev => prev.map(m => m.client_request_id === clientRequestId ? { ...m, error: error.message } : m))
      throw error
    } else if (data && data.length > 0) {
      applyRpcResult(clientRequestId, data)
    } else {
      // No error but no returned id: the insert isn't confirmed. Flag it so the
      // user can retry; client_request_id keeps the retry idempotent.
      setMessages(prev => prev.map(m => m.client_request_id === clientRequestId ? { ...m, error: 'Message was not confirmed. Tap retry to resend.' } : m))
    }
  }, [channelId, user])

  const sendDiceRoll = useCallback(async (notation: string, replyToId?: string, warning?: string, dc?: number | null) => {
    if (!channelId || !user) return
    if (warning && warning.length > MAX_ROLL_WARNING_LENGTH) throw new Error(`Roll warning is too long (max ${MAX_ROLL_WARNING_LENGTH} characters).`)

    const clientRequestId = crypto.randomUUID()
    const content = warning ? `Rolling \`${notation}\`\n\n${warning}` : `Rolling \`${notation}\``

    const optimisticMsg: Message = {
      id: clientRequestId,
      channel_id: channelId,
      sender_id: user.id,
      content,
      type: 'dice_roll',
      whisper_to: null,
      reply_to: replyToId ?? null,
      npc_name: null,
      npc_avatar_url: null,
      is_deleted: false,
      is_edited: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      roll_dc: dc ?? null,
      roll_success: null,
      client_request_id: clientRequestId,
      pending: true,
      pending_payload: { notation, replyToId, warning, dc },
      reply_message: null,
      sender: user as any, mention_user_ids: null, search_vector: null as any,
    }

    setMessages(prev => [...prev, optimisticMsg].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)))

    const { data: rollData, error: rollError } = await supabase.rpc('roll_dice', {
      p_channel_id: channelId,
      p_notation: notation,
      p_reply_to: replyToId ?? undefined,
      p_warning: warning ?? undefined,
      p_dc: dc ?? undefined,
      p_client_request_id: clientRequestId,
    })
    
    if (rollError) {
      setMessages(prev => prev.map(m => m.client_request_id === clientRequestId ? { ...m, error: rollError.message } : m))
      throw rollError
    } else if (rollData && rollData.length > 0) {
      applyRpcResult(clientRequestId, rollData)
    } else {
      setMessages(prev => prev.map(m => m.client_request_id === clientRequestId ? { ...m, error: 'Roll was not confirmed. Tap retry to reroll.' } : m))
    }
  }, [channelId, user])

  const editMessage = useCallback(async (messageId: string, content: string) => {
    if (content.length > MAX_MESSAGE_LENGTH) throw new Error(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters).`)
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

  const removePendingMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id))
  }, [])

  const retryMessage = useCallback(async (id: string) => {
    const msg = messages.find(m => m.id === id)
    if (!msg || !msg.pending || !msg.pending_payload) return

    setMessages(prev => prev.map(m => m.id === id ? { ...m, error: null } : m))

    if (msg.type === 'dice_roll') {
      const { notation, replyToId, warning, dc } = msg.pending_payload
      const { data: rollData, error: rollError } = await supabase.rpc('roll_dice', {
        p_channel_id: channelId as string,
        p_notation: notation,
        p_reply_to: replyToId ?? undefined,
        p_warning: warning ?? undefined,
        p_dc: dc ?? undefined,
        p_client_request_id: msg.client_request_id ?? undefined,
      })
      if (rollError) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, error: rollError.message } : m))
      } else {
        applyRpcResult(msg.client_request_id ?? id, rollData)
      }
    } else {
      const payload = msg.pending_payload
      const { data, error } = await supabase.rpc('send_message', {
        p_channel_id: channelId as string,
        p_content: payload.content,
        p_type: payload.type,
        p_reply_to: payload.reply_to ?? undefined,
        p_whisper_to: payload.whisper_to ?? undefined,
        p_active_player_ids: payload.active_player_ids ?? undefined,
        p_npc_name: payload.npc_name ?? undefined,
        p_npc_avatar_url: payload.npc_avatar_url ?? undefined,
        p_client_request_id: msg.client_request_id ?? undefined,
      })
      if (error) {
        setMessages(prev => prev.map(m => m.id === id ? { ...m, error: error.message } : m))
      } else {
        applyRpcResult(msg.client_request_id ?? id, data)
      }
    }
  }, [messages, channelId, applyRpcResult])

  return { messages, reactions, loading, error, hasMore, loadingOlder, loadOlder, sendMessage, sendDiceRoll, editMessage, deleteMessage, addReaction, removeReaction, removePendingMessage, retryMessage }
}
