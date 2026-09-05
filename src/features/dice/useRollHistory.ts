import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { z } from 'zod'
import { subscribeWithRetry } from '../../lib/realtime'

const rollBreakdownSchema = z.object({
  rolls: z.array(z.number()).optional(),
  dropped: z.array(z.number()).optional(),
  modifier: z.number().optional()
})
export type RollBreakdown = z.infer<typeof rollBreakdownSchema>

const rollHistorySchema = z.object({
  id: z.string(),
  notation: z.string(),
  result: z.number(),
  breakdown: rollBreakdownSchema,
  created_at: z.string(),
  roller_id: z.string(),
  roller_display_name: z.string().nullable()
})

// Realtime INSERTs carry the raw dice_rolls row, which has no
// roller_display_name (that's joined in by get_channel_roll_history).
const rollRealtimeSchema = rollHistorySchema.omit({ roller_display_name: true })

export type DiceRoll = {
  id: string
  notation: string
  result: number
  breakdown: RollBreakdown
  created_at: string
  roller_id: string
  roller_display_name: string | null
  roller?: { display_name: string | null } | null
}

// Data layer for the roll history (ARCH-1): the history RPC, the realtime
// dice_rolls subscription, and the visibility refetch live here; the modal
// only renders.
export function useRollHistory(channelId: string) {
  const [rolls, setRolls] = useState<DiceRoll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function fetchRolls() {
      try {
        // get_channel_roll_history runs server-side and excludes rolls whose
        // message has been soft-deleted, so the history can't be polluted by
        // deleted messages.
        const { data, error: rpcError } = await supabase.rpc('get_channel_roll_history', { p_channel_id: channelId })
        if (rpcError) throw rpcError
        const parsed = z.array(rollHistorySchema).safeParse(data)
        if (!parsed.success) {
          if (mounted) setError('Failed to load roll history.')
          return
        }
        const fetched = parsed.data.map(r => ({ ...r, roller: { display_name: r.roller_display_name } }))
        if (!mounted) return
        setRolls(prev => {
          const fetchedIds = new Set(fetched.map(roll => roll.id))
          return [...prev.filter(roll => !fetchedIds.has(roll.id)), ...fetched]
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
            .slice(0, 50)
        })
        setError(null)
      } catch (err) {
        console.error('Failed to fetch roll history', err)
        if (mounted) setError('Failed to load roll history.')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchRolls()

    let firstSubscribe = true
    const realtimeChannel = supabase
      .channel(`dice_rolls:${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dice_rolls',
        filter: `channel_id=eq.${channelId}`
      }, async (payload) => {
        const parsed = rollRealtimeSchema.safeParse(payload.new)
        if (!parsed.success) return
        // Fetch profile
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', parsed.data.roller_id)
          .single()

        const newRoll: DiceRoll = { ...parsed.data, roller_display_name: null, roller: data }
        setRolls(prev => prev.some(roll => roll.id === newRoll.id)
          ? prev
          : [newRoll, ...prev].slice(0, 50))
      })
    const stopRealtime = subscribeWithRetry(realtimeChannel, `dice_rolls:${channelId}`, (status) => {
      if (status !== 'SUBSCRIBED') return
      if (firstSubscribe) {
        firstSubscribe = false
      } else {
        void fetchRolls()
      }
    })

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void fetchRolls()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
  }, [channelId])

  return { rolls, loading, error }
}
