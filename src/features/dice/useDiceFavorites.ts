import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { z } from 'zod'

// The roller renders tappable chips from these rows, so only the fields it
// uses are trusted from the payload: anything else is stripped and malformed
// rows are dropped instead of crashing the merge.
const favoriteRowSchema = z.object({
  notation: z.string(),
  created_at: z.string()
})

export const MAX_FAVORITES = 3

// Data layer for the favorite-roll chips (ARCH-1): the favorites fetch,
// the optimistic toggle, and the cap live here; DiceRoller keeps the form UX.
export function useDiceFavorites(channelId: string | undefined, enabled: boolean) {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<string[]>([])
  const pending = useRef(new Set<string>())
  // Notations toggled after the in-flight fetch began. The fetch snapshot
  // predates them, so completion reconciles instead of replacing state.
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
      // Channel or user changed: drop the old scope's chips now instead of
      // showing them until the new fetch lands.
      prevScopeRef.current = scope
      deltas.current = { added: [], removed: [] }
      setFavorites([])
    }
    if (!enabled || !channelId || !user) return
    const requestScope = scope
    let cancelled = false
    void supabase
      .from('dice_roll_favorites')
      .select('notation, created_at')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data || scopeRef.current !== requestScope) return
        const fetched: string[] = []
        for (const row of data) {
          const parsed = favoriteRowSchema.safeParse(row)
          if (parsed.success && !fetched.includes(parsed.data.notation)) {
            fetched.push(parsed.data.notation)
          }
        }
        // Reconcile with toggles made while the request was in flight: keep
        // later additions, honor later removals.
        const { added, removed } = deltas.current
        const merged = [
          ...fetched.filter(n => !removed.includes(n)),
          ...added.filter(n => !fetched.includes(n))
        ]
        // Oldest first (pinned order); the DB trigger caps at MAX_FAVORITES,
        // but a stale read must never render more.
        setFavorites(merged.slice(0, MAX_FAVORITES))
        // Keep only deltas the snapshot doesn't reflect yet (still in flight).
        deltas.current = {
          added: added.filter(n => !fetched.includes(n)),
          removed: removed.filter(n => fetched.includes(n))
        }
      })
    return () => { cancelled = true }
  }, [enabled, channelId, user?.id, scope])

  const isFavorite = (notation: string) => favorites.includes(notation)
  const canFavorite = favorites.length < MAX_FAVORITES

  const toggleFavorite = async (notation: string) => {
    if (!channelId || !user || pending.current.has(notation)) return
    const requestScope = scopeRef.current
    const rollbackStale = () => scopeRef.current !== requestScope
    pending.current.add(notation)
    try {
      if (favorites.includes(notation)) {
        deltas.current = {
          added: deltas.current.added.filter(n => n !== notation),
          removed: [...deltas.current.removed, notation]
        }
        setFavorites(prev => prev.filter(n => n !== notation))
        const { error } = await supabase
          .from('dice_roll_favorites')
          .delete()
          .eq('channel_id', channelId)
          .eq('user_id', user.id)
          .eq('notation', notation)
        if (error && !rollbackStale()) {
          console.error('Failed to remove dice favorite', error)
          deltas.current = {
            ...deltas.current,
            removed: deltas.current.removed.filter(n => n !== notation)
          }
          // Undo only the failed notation against current state so
          // concurrent toggles of other notations survive.
          setFavorites(prev => (prev.includes(notation) ? prev : [notation, ...prev].slice(0, MAX_FAVORITES)))
        }
      } else {
        // UI disables the toggle at the cap; this is the local backstop
        // (the DB trigger is the race-proof one).
        if (favorites.length >= MAX_FAVORITES) return
        deltas.current = {
          added: [...deltas.current.added, notation],
          removed: deltas.current.removed.filter(n => n !== notation)
        }
        setFavorites(prev => (prev.includes(notation) ? prev : [...prev, notation].slice(0, MAX_FAVORITES)))
        const { error } = await supabase
          .from('dice_roll_favorites')
          .insert({ channel_id: channelId, user_id: user.id, notation })
        if (error && !rollbackStale()) {
          console.error('Failed to save dice favorite', error)
          deltas.current = {
            ...deltas.current,
            added: deltas.current.added.filter(n => n !== notation)
          }
          setFavorites(prev => prev.filter(n => n !== notation))
        }
      }
    } finally {
      pending.current.delete(notation)
    }
  }

  return { favorites, isFavorite, canFavorite, toggleFavorite }
}
