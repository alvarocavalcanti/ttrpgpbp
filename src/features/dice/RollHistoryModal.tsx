import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { z } from 'zod'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { subscribeWithRetry } from '../../lib/realtime'

const rollBreakdownSchema = z.object({
  rolls: z.array(z.number()).optional(),
  dropped: z.array(z.number()).optional(),
  modifier: z.number().optional()
})
type RollBreakdown = z.infer<typeof rollBreakdownSchema>

const rollHistorySchema = z.object({
  id: z.string(),
  notation: z.string(),
  result: z.number(),
  breakdown: rollBreakdownSchema,
  created_at: z.string(),
  roller_id: z.string(),
  roller_display_name: z.string().nullable()
})

type DiceRoll = {
  id: string
  notation: string
  result: number
  breakdown: RollBreakdown
  created_at: string
  roller_id: string
  roller_display_name: string | null
  roller?: { display_name: string | null } | null
}

interface RollHistoryModalProps {
  channelId: string
  onClose: () => void
}

export function RollHistoryModal({ channelId, onClose }: RollHistoryModalProps) {
  useEscapeToClose(onClose)
  const [rolls, setRolls] = useState<DiceRoll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchRolls() {
      try {
        // get_channel_roll_history runs server-side and excludes rolls whose
        // message has been soft-deleted, so the history can't be polluted by
        // deleted messages.
        const { data, error } = await supabase.rpc('get_channel_roll_history', { p_channel_id: channelId })
        if (error) throw error
        const parsed = z.array(rollHistorySchema).safeParse(data)
        if (!parsed.success) {
          setError('Failed to load roll history.')
          return
        }
        const fetched = parsed.data.map(r => ({ ...r, roller: { display_name: r.roller_display_name } }))
        setRolls(prev => {
          const fetchedIds = new Set(fetched.map(roll => roll.id))
          return [...prev.filter(roll => !fetchedIds.has(roll.id)), ...fetched]
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
            .slice(0, 50)
        })
        setError(null)
      } catch (err) {
        console.error('Failed to fetch roll history', err)
        setError('Failed to load roll history.')
      } finally {
        setLoading(false)
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
        const newRoll = payload.new as DiceRoll
        // Fetch profile
        const { data } = await supabase
          .from('profiles')
          .select('display_name')
          .eq('id', newRoll.roller_id)
          .single()

        newRoll.roller = data
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
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      stopRealtime()
      void supabase.removeChannel(realtimeChannel)
    }
  }, [channelId])

  return (
    <div className="fixed z-20 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6 h-[80vh] flex flex-col">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100" id="modal-title">
              Roll History
            </h3>
            <button type="button" onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400">
              <span className="sr-only">Close</span>
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto pr-2">
            {loading ? (
              <div className="flex justify-center py-8">
                <svg className="animate-spin h-8 w-8 text-indigo-600 dark:text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              </div>
            ) : error ? (
              <p className="text-center text-red-600 dark:text-red-400 py-8" role="alert">{error}</p>
            ) : rolls.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">No dice rolls yet.</p>
            ) : (
              <ul className="space-y-4">
                {rolls.map(roll => {
                  const bd = roll.breakdown
                  return (
                    <li key={roll.id} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{roll.roller?.display_name || 'Unknown User'}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(roll.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Notation</div>
                          <div className="font-mono text-sm text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded">{roll.notation}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Result</div>
                          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{roll.result}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 pt-2 flex flex-wrap gap-x-4">
                        <div><span className="font-semibold">Rolls:</span> [{bd?.rolls?.join(', ')}]</div>
                        {bd?.dropped && bd.dropped.length > 0 && (
                          <div className="text-red-500 dark:text-red-400"><span className="font-semibold">Dropped:</span> [{bd.dropped.join(', ')}]</div>
                        )}
                        {bd?.modifier !== undefined && bd.modifier !== 0 && (
                          <div><span className="font-semibold">Modifier:</span> {bd.modifier > 0 ? `+${bd.modifier}` : bd.modifier}</div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
