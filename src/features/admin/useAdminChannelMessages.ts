import { useState, useEffect, useCallback, useRef } from 'react'
import { z } from 'zod'
import { supabase } from '../../lib/supabase'
import { AdminChannelRowSchema, type AdminChannel } from './useAdminData'

// A message row from admin_list_channel_messages. Sender joins are LEFT (both
// survive deletion), so those fields can be null despite the RPC's non-null
// signature — same caveat as AdminMessageRowSchema in useAdminData.ts.
export const AdminChannelMessageRowSchema = z.object({
  id: z.string(),
  channel_id: z.string(),
  sender_id: z.string().nullable(),
  sender_display_name: z.string().nullable(),
  sender_character_name: z.string().nullable(),
  content: z.string(),
  type: z.string(),
  is_deleted: z.boolean(),
  whisper_to: z.string().nullable(),
  npc_name: z.string().nullable(),
  created_at: z.string(),
})

export type AdminChannelMessage = z.infer<typeof AdminChannelMessageRowSchema>

// A roster row from admin_list_channel_members. The profile join is LEFT (the
// membership survives profile deletion), so display_name can be null despite
// the RPC's non-null signature — same caveat as the message schemas above.
export const AdminChannelMemberRowSchema = z.object({
  user_id: z.string(),
  display_name: z.string().nullable(),
  character_name: z.string(),
  is_blocked: z.boolean(),
  is_active_player: z.boolean(),
})

export type AdminChannelMember = z.infer<typeof AdminChannelMemberRowSchema>

const PAGE_SIZE = 50

function parseRows(data: unknown): AdminChannelMessage[] {
  if (!Array.isArray(data)) throw new Error('Malformed channel messages payload.')
  return data.flatMap(row => {
    const parsed = AdminChannelMessageRowSchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

// Read-only channel history for the server admin console (issue #550).
// Newest-first fetch with a (created_at, id) cursor; display order stays
// ascending (oldest at top) and older pages prepend. No realtime: the admin
// refetches manually. An undefined channelId issues no RPC. The channel header
// comes from the unpaged admin_list_channels — an O(total channels) fetch to
// resolve one row — so a deep link loads without router state. Intentional at
// current admin scale (few channels, few admins); swap to a scoped
// admin_get_channel(p_channel_id) RPC if channel counts grow. The roster comes
// from admin_list_channel_members (issue #556).
export function useAdminChannelMessages(channelId: string | undefined) {
  const [messages, setMessages] = useState<AdminChannelMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [channel, setChannel] = useState<AdminChannel | null>(null)
  const [channelLoading, setChannelLoading] = useState(true)
  const [channelError, setChannelError] = useState(false)
  const [channelMissing, setChannelMissing] = useState(false)
  const [members, setMembers] = useState<AdminChannelMember[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState(false)
  // Bumped on channelId change so a slow in-flight request for an old channel
  // can't overwrite a newer channel's messages when it resolves.
  const generationRef = useRef(0)
  // Monotonic id per fetchFirstPage invocation: two requests can share a
  // generation (initial fetch + refetch), and a slow earlier one must not
  // overwrite a newer one's result.
  const requestSeqRef = useRef(0)

  // Applies the newest page. `reset` replaces the list (first load / channel
  // change); otherwise the newest rows merge by id over the cached list so a
  // refetch or Retry keeps older pages the user already loaded.
  const applyNewestPage = useCallback((rows: unknown, reset: boolean) => {
    const fetched = parseRows(rows)
    setMessages(prev => {
      if (reset) return fetched.reverse()
      const fetchedIds = new Set(fetched.map(m => m.id))
      const retained = prev.filter(m => !fetchedIds.has(m.id))
      return [...retained, ...fetched.reverse()]
    })
    setHasMore(Array.isArray(rows) && rows.length === PAGE_SIZE)
  }, [])

  const fetchFirstPage = useCallback(async (reset: boolean, generation: number) => {
    if (!channelId) return
    const requestId = ++requestSeqRef.current
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await supabase.rpc('admin_list_channel_messages', {
        p_channel_id: channelId,
        p_limit: PAGE_SIZE,
      })
      // Channel switch discards everything; a superseded request (a newer
      // fetch started after this one) drops its result without touching state.
      if (generation !== generationRef.current) return
      if (requestId !== requestSeqRef.current) return
      if (queryError) throw queryError
      applyNewestPage(data, reset)
    } catch (err) {
      if (generation !== generationRef.current) return
      if (requestId !== requestSeqRef.current) return
      setError(err as Error)
    } finally {
      if (generation === generationRef.current && requestId === requestSeqRef.current) {
        setLoading(false)
      }
    }
  }, [channelId, applyNewestPage])

  useEffect(() => {
    const generation = ++generationRef.current
    // A discarded older-page request must not leave the new channel stuck in
    // a loading state (its finally skips the reset for stale generations).
    setLoadingOlder(false)
    if (!channelId) {
      setMessages([])
      setHasMore(false)
      setError(null)
      setLoading(false)
      return
    }
    void fetchFirstPage(true, generation)
  }, [channelId, fetchFirstPage])

  // Channel header for the view. A rejected RPC promise flows through the
  // same error contract as a resolved-with-error response. Generation-guarded
  // like fetchFirstPage: a channel switch mid-flight discards this response.
  const fetchChannel = useCallback(async () => {
    if (!channelId) {
      setChannel(null)
      setChannelError(false)
      setChannelMissing(false)
      setChannelLoading(false)
      return
    }
    const generation = generationRef.current
    setChannelLoading(true)
    setChannelError(false)
    setChannelMissing(false)
    try {
      const { data, error: queryError } = await supabase.rpc('admin_list_channels')
      if (generation !== generationRef.current) return
      if (queryError || !Array.isArray(data)) {
        setChannelError(true)
      } else {
        const found = data
          .map(c => AdminChannelRowSchema.safeParse(c))
          .filter(r => r.success)
          .map(r => r.data)
          .find(c => c.id === channelId) ?? null
        if (found) {
          setChannel(found)
        } else {
          setChannelMissing(true)
        }
      }
    } catch {
      if (generation !== generationRef.current) return
      setChannelError(true)
    } finally {
      if (generation === generationRef.current) setChannelLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    void fetchChannel()
  }, [fetchChannel])

  // Channel roster for the read-only view (issue #556). Same contract as
  // fetchChannel above: no RPC without a channel id, generation-guarded so a
  // channel switch mid-flight discards the stale roster. No pagination: a
  // single channel's roster is small. Declared after the messages effect so
  // the captured generation already includes that effect's bump.
  const fetchMembers = useCallback(async () => {
    if (!channelId) {
      setMembers([])
      setMembersError(false)
      setMembersLoading(false)
      return
    }
    const generation = generationRef.current
    setMembersLoading(true)
    setMembersError(false)
    try {
      const { data, error: queryError } = await supabase.rpc('admin_list_channel_members', {
        p_channel_id: channelId,
      })
      if (generation !== generationRef.current) return
      if (queryError || !Array.isArray(data)) {
        setMembersError(true)
      } else {
        setMembers(data
          .map(m => AdminChannelMemberRowSchema.safeParse(m))
          .filter(r => r.success)
          .map(r => r.data))
      }
    } catch {
      if (generation !== generationRef.current) return
      setMembersError(true)
    } finally {
      if (generation === generationRef.current) setMembersLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    void fetchMembers()
  }, [fetchMembers])

  // Prepends the next older page. A page failure keeps the loaded messages
  // (degrade) and surfaces the error with a Retry via refetch.
  // Generation-guarded: a channel switch mid-flight discards this page, and
  // the channel-change effect below resets loadingOlder for the new channel.
  const loadOlder = useCallback(async () => {
    if (!channelId || loading || loadingOlder || !hasMore || messages.length === 0) return
    const oldest = messages[0]
    const generation = generationRef.current
    setLoadingOlder(true)
    setError(null)
    try {
      const { data, error: queryError } = await supabase.rpc('admin_list_channel_messages', {
        p_channel_id: channelId,
        p_before: oldest.created_at,
        p_before_id: oldest.id,
        p_limit: PAGE_SIZE,
      })
      if (generation !== generationRef.current) return
      if (queryError) throw queryError
      const older = parseRows(data).reverse()
      setMessages(prev => {
        const existing = new Set(prev.map(m => m.id))
        return [...older.filter(m => !existing.has(m.id)), ...prev]
      })
      setHasMore(Array.isArray(data) && data.length === PAGE_SIZE)
    } catch (err) {
      if (generation !== generationRef.current) return
      setError(err as Error)
    } finally {
      if (generation === generationRef.current) setLoadingOlder(false)
    }
  }, [channelId, loading, loadingOlder, hasMore, messages])

  const refetch = useCallback(() => void fetchFirstPage(false, generationRef.current), [fetchFirstPage])
  const refetchChannel = useCallback(() => void fetchChannel(), [fetchChannel])
  const refetchMembers = useCallback(() => void fetchMembers(), [fetchMembers])

  return { messages, loading, error, hasMore, loadingOlder, loadOlder, refetch, channel, channelLoading, channelError, channelMissing, refetchChannel, members, membersLoading, membersError, refetchMembers }
}
