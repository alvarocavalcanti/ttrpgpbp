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

  useEffect(() => {
    if (!enabled || !channelId || !user) return
    let cancelled = false
    void supabase
      .from('dice_roll_favorites')
      .select('notation, created_at')
      .eq('channel_id', channelId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data) return
        const notations: string[] = []
        for (const row of data) {
          const parsed = favoriteRowSchema.safeParse(row)
          if (parsed.success && !notations.includes(parsed.data.notation)) {
            notations.push(parsed.data.notation)
          }
        }
        // Oldest first (pinned order); the DB trigger caps at MAX_FAVORITES,
        // but a stale read must never render more.
        setFavorites(notations.slice(0, MAX_FAVORITES))
      })
    return () => { cancelled = true }
  }, [enabled, channelId, user?.id])

  const isFavorite = (notation: string) => favorites.includes(notation)
  const canFavorite = favorites.length < MAX_FAVORITES

  const toggleFavorite = async (notation: string) => {
    if (!channelId || !user || pending.current.has(notation)) return
    pending.current.add(notation)
    try {
      if (isFavorite(notation)) {
        const prev = favorites
        setFavorites(prev.filter(n => n !== notation))
        const { error } = await supabase
          .from('dice_roll_favorites')
          .delete()
          .eq('channel_id', channelId)
          .eq('user_id', user.id)
          .eq('notation', notation)
        if (error) {
          console.error('Failed to remove dice favorite', error)
          setFavorites(prev)
        }
      } else {
        // UI disables the toggle at the cap; this is the local backstop
        // (the DB trigger is the race-proof one).
        if (!canFavorite) return
        const prev = favorites
        setFavorites([...prev, notation])
        const { error } = await supabase
          .from('dice_roll_favorites')
          .insert({ channel_id: channelId, user_id: user.id, notation })
        if (error) {
          console.error('Failed to save dice favorite', error)
          setFavorites(prev)
        }
      }
    } finally {
      pending.current.delete(notation)
    }
  }

  return { favorites, isFavorite, canFavorite, toggleFavorite }
}
