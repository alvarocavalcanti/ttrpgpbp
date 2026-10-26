import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useAuth } from '../auth/useAuth'
import { subscribeWithRetry } from '../../lib/realtime'
import { toError } from '../../lib/errors'
import { ChannelNoteRowSchema, parseRow, type NoteScope } from '../validation/rowSchemas'
import { MAX_NOTE_LENGTH } from '../../constants'

export type ChannelNote = Database['public']['Tables']['channel_notes']['Row']

// Channel-wide campaign notes (#762). RLS decides which rows are visible, so
// the hook fetches once and filters by scope in the modal. Writes rely on the
// realtime echo to converge, with a refetch as the fallback when realtime is
// unavailable.
export function useChannelNotes(channelId: string | undefined) {
  const { user } = useAuth()
  const [notes, setNotes] = useState<ChannelNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  // Refetching after a write must not blank the list (and flash the spinner).
  // Only a real channel change resets the visible notes.
  const loadedChannelRef = useRef<string | undefined>(undefined)

  const refetch = useCallback(() => setRefetchTrigger(prev => prev + 1), [])

  useEffect(() => {
    let mounted = true
    if (loadedChannelRef.current !== channelId) {
      loadedChannelRef.current = channelId
      setNotes([])
      setError(null)
      setLoading(true)
    }

    if (!channelId) {
      setLoading(false)
      return
    }
    const cid = channelId

    async function fetchNotes() {
      try {
        if (mounted) setError(null)
        const { data, error: fetchError } = await supabase
          .from('channel_notes')
          .select('*')
          .eq('channel_id', cid)
          .order('created_at', { ascending: false })
        if (fetchError) throw fetchError
        if (!mounted) return
        setNotes((data ?? []).flatMap(row => {
          const parsed = parseRow(ChannelNoteRowSchema, row)
          return parsed ? [parsed] : []
        }))
      } catch (err) {
        console.error('Failed to fetch campaign notes:', err)
        if (mounted) setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void fetchNotes()

    const realtimeChannel = supabase
      .channel(`channel:${cid}:notes`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'channel_notes', filter: `channel_id=eq.${cid}` },
        (payload) => {
          if (!mounted) return
          const next = parseRow(ChannelNoteRowSchema, payload.new)
          if (!next) return
          setNotes(prev => {
            if (prev.some(n => n.id === next.id)) {
              return prev.map(n => (n.id === next.id ? next : n))
            }
            return [next, ...prev]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'channel_notes', filter: `channel_id=eq.${cid}` },
        (payload) => {
          if (!mounted) return
          const next = parseRow(ChannelNoteRowSchema, payload.new)
          if (!next) return
          setNotes(prev => prev.map(n => (n.id === next.id ? next : n)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'channel_notes' },
        (payload) => {
          // RLS may strip everything but the primary key from `old`; the
          // channel filter would then drop the event, so this listener is
          // deliberately unfiltered and removes by id only.
          if (!mounted) return
          const oldId = (payload.old as { id?: string } | null)?.id
          if (oldId) setNotes(prev => prev.filter(n => n.id !== oldId))
        },
      )
    const unsubscribe = subscribeWithRetry(realtimeChannel, `channel:${cid}:notes`)

    return () => {
      mounted = false
      unsubscribe()
    }
  }, [channelId, refetchTrigger])

  const normalizeBody = useCallback((body: string) => {
    const trimmed = body.trim()
    if (!trimmed || trimmed.length > MAX_NOTE_LENGTH) return null
    return trimmed
  }, [])

  const createNote = useCallback(async (scope: NoteScope, body: string): Promise<boolean> => {
    if (!channelId || !user) return false
    const normalized = normalizeBody(body)
    if (!normalized) return false
    const { error: insertError } = await supabase
      .from('channel_notes')
      .insert({ channel_id: channelId, author_id: user.id, scope, body: normalized })
    if (insertError) {
      console.error('Failed to create campaign note:', insertError)
      return false
    }
    refetch()
    return true
  }, [channelId, user, normalizeBody, refetch])

  const updateNote = useCallback(async (id: string, body: string): Promise<boolean> => {
    const normalized = normalizeBody(body)
    if (!normalized) return false
    const { error: updateError } = await supabase
      .from('channel_notes')
      .update({ body: normalized })
      .eq('id', id)
    if (updateError) {
      console.error('Failed to update campaign note:', updateError)
      return false
    }
    refetch()
    return true
  }, [normalizeBody, refetch])

  const deleteNote = useCallback(async (id: string): Promise<boolean> => {
    const { error: deleteError } = await supabase
      .from('channel_notes')
      .delete()
      .eq('id', id)
    if (deleteError) {
      console.error('Failed to delete campaign note:', deleteError)
      return false
    }
    refetch()
    return true
  }, [refetch])

  return { notes, loading, error, refetch, createNote, updateNote, deleteNote }
}
