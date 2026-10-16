import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// Pending applications per channel, for the GM's Lobby rows (#674).
//
// One query: RLS already scopes channel_join_requests to the channels the caller
// GMs, so this counts what it may see and reduces it to a channelId -> count map.
// A channel with no pending applications is simply absent from the map.
export function usePendingJoinRequestCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let mounted = true
    async function fetchCounts() {
      try {
        const { data, error } = await supabase
          .from('channel_join_requests')
          .select('channel_id')
          .eq('status', 'pending')
        if (error) throw error
        const next: Record<string, number> = {}
        for (const row of data ?? []) {
          // Only the id is needed, so a row without one is skipped rather than
          // counted under a bogus key.
          if (typeof row.channel_id !== 'string') continue
          next[row.channel_id] = (next[row.channel_id] ?? 0) + 1
        }
        if (mounted) setCounts(next)
      } catch (err) {
        // A badge is not worth an error state: the Lobby stays usable and this
        // renders nothing rather than inventing a count.
        console.error('Error fetching pending join request counts:', err)
      }
    }

    void fetchCounts()
    return () => {
      mounted = false
    }
  }, [])

  return counts
}
