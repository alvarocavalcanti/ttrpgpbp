import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { z } from 'zod'

// The roller only renders tappable chips from these rows, so only the fields
// it uses are trusted from the RPC payload (audit finding #9): anything else
// is stripped and malformed rows are dropped instead of crashing the merge.
const recentRollRowSchema = z.object({
  notation: z.string(),
  created_at: z.string()
})

// Data layer for the quick-roll chips (ARCH-1): the history RPC, sorting,
// dedup, and the cap live here; DiceRoller keeps the form UX.
export function useRecentRolls(channelId: string | undefined, enabled: boolean) {
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    if (!enabled || !channelId) return
    let cancelled = false
    void supabase
      .rpc('get_channel_roll_history', { p_channel_id: channelId })
      .then(({ data }) => {
        if (cancelled || !data) return
        const rows: z.infer<typeof recentRollRowSchema>[] = []
        if (Array.isArray(data)) {
          for (const row of data) {
            const parsed = recentRollRowSchema.safeParse(row)
            if (parsed.success) rows.push(parsed.data)
          }
        }
        rows.sort((a, b) => b.created_at.localeCompare(a.created_at))
        const notations: string[] = []
        for (const r of rows) {
          if (!notations.includes(r.notation)) notations.push(r.notation)
          if (notations.length >= 3) break
        }
        // The server snapshot may predate rolls made while it was in flight —
        // keep the local (newer) entries first and let stale history only fill
        // the remaining slots.
        setRecent(prev => {
          const merged = [...prev]
          for (const n of notations) {
            if (!merged.includes(n)) merged.push(n)
          }
          return merged.slice(0, 3)
        })
      })
    return () => { cancelled = true }
  }, [enabled, channelId])

  const recordRoll = (notation: string) => {
    setRecent(prev => [notation, ...prev.filter(n => n !== notation)].slice(0, 3))
  }

  return { recent, recordRoll }
}
