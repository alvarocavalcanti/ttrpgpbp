import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { fetchAllRows } from '../../lib/supabasePagination'
import { useAuth } from '../auth/useAuth'
import { z } from 'zod'

// Only the fields the UI uses are trusted from the payload: anything else is
// stripped and malformed rows are dropped instead of poisoning the set.
const favoriteRowSchema = z.object({
  message_id: z.string(),
  created_at: z.string()
})

// Data layer for message favorites (#634): a per-user, per-channel set of
// message ids with an optimistic toggle. Mirrors useDiceFavorites; there is no
// cap and no realtime subscription (favorites are own-row and single-client).
export function useMessageFavorites(channelId: string | undefined, enabled = true) {
  const { user } = useAuth()
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const pending = useRef(new Set<string>())
  // Ids toggled after the in-flight fetch began. The fetch snapshot predates
  // them, so completion reconciles instead of replacing state.
  const deltas = useRef<{ added: string[]; removed: string[] }>({ added: [], removed: [] })
  // Owner scope (channel + user). Rollbacks and late fetches from a previous
  // scope must never touch the new scope's state.
  const scope = `${channelId ?? ''}::${user?.id ?? ''}`
  const scopeRef = useRef(scope)
  const prevScopeRef = useRef(scope)
  useEffect(() => {
    scopeRef.current = scope
  }, [scope])

  useEffect(() => {
    if (prevScopeRef.current !== scope) {
      // Channel or user changed: drop the old scope's favorites now instead
      // of showing them until the new fetch lands.
      prevScopeRef.current = scope
      deltas.current = { added: [], removed: [] }
      setFavoriteIds(new Set())
    }
    if (!enabled || !channelId || !user) return
    const requestScope = scope
    let cancelled = false
    void (async () => {
      // There is no favorite cap, so page under PostgREST's 1,000-row limit.
      const query = supabase
        .from('message_favorites')
        .select('message_id, created_at')
        .eq('channel_id', channelId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      let data: unknown[]
      try {
        data = await fetchAllRows<{ message_id: string; created_at: string }>(query)
      } catch {
        return
      }
      if (cancelled || scopeRef.current !== requestScope) return
      const fetched: string[] = []
      for (const row of data) {
        const parsed = favoriteRowSchema.safeParse(row)
        if (parsed.success && !fetched.includes(parsed.data.message_id)) {
          fetched.push(parsed.data.message_id)
        }
      }
      // Reconcile with toggles made while the request was in flight: keep
      // later additions, honor later removals.
      const { added, removed } = deltas.current
      const merged = [
        ...fetched.filter(id => !removed.includes(id)),
        ...added.filter(id => !fetched.includes(id))
      ]
      setFavoriteIds(new Set(merged))
      // Keep only deltas the snapshot doesn't reflect yet (still in flight).
      deltas.current = {
        added: added.filter(id => !fetched.includes(id)),
        removed: removed.filter(id => fetched.includes(id))
      }
    })()
    return () => { cancelled = true }
  }, [enabled, channelId, user?.id, scope])

  const isFavorite = (messageId: string) => favoriteIds.has(messageId)

  const toggleFavorite = async (messageId: string) => {
    if (!channelId || !user || pending.current.has(messageId)) return
    const requestScope = scopeRef.current
    const rollbackStale = () => scopeRef.current !== requestScope
    pending.current.add(messageId)
    try {
      if (favoriteIds.has(messageId)) {
        deltas.current = {
          added: deltas.current.added.filter(id => id !== messageId),
          removed: [...deltas.current.removed, messageId]
        }
        setFavoriteIds(prev => {
          const next = new Set(prev)
          next.delete(messageId)
          return next
        })
        const { error } = await supabase
          .from('message_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('message_id', messageId)
        if (error && !rollbackStale()) {
          console.error('Failed to remove message favorite', error)
          deltas.current = {
            ...deltas.current,
            removed: deltas.current.removed.filter(id => id !== messageId)
          }
          setFavoriteIds(prev => new Set(prev).add(messageId))
        }
      } else {
        deltas.current = {
          added: [...deltas.current.added, messageId],
          removed: deltas.current.removed.filter(id => id !== messageId)
        }
        setFavoriteIds(prev => new Set(prev).add(messageId))
        const { error } = await supabase
          .from('message_favorites')
          .insert({ user_id: user.id, channel_id: channelId, message_id: messageId })
        if (error && !rollbackStale()) {
          console.error('Failed to save message favorite', error)
          deltas.current = {
            ...deltas.current,
            added: deltas.current.added.filter(id => id !== messageId)
          }
          setFavoriteIds(prev => {
            const next = new Set(prev)
            next.delete(messageId)
            return next
          })
        }
      }
    } finally {
      pending.current.delete(messageId)
    }
  }

  return { favoriteIds, isFavorite, toggleFavorite }
}
