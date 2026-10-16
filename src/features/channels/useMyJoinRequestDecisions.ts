import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toError } from '../../lib/errors'
import { useAuth } from '../auth/useAuth'
import { parseRow, MyJoinRequestDecisionRowSchema } from '../validation/rowSchemas'

export type JoinRequestDecision = {
  id: string
  channel_id: string
  channel_name: string
  status: string
  decided_at: string
  /** The caller's access right now: an approval does not guarantee it. */
  is_member?: boolean | null
}

// The caller's own decided applications that they have not acknowledged yet
// (#722), for the Lobby notice.
//
// Push covers a decision to a subscribed device; this is the in-app cue for
// everyone else. get_my_join_request_decisions is SECURITY DEFINER so a rejected
// applicant — not a member, and looking at a channel that has since been
// unlisted or archived — still learns the outcome. Acknowledging stamps the row
// so a dismissed notice stays dismissed.
export function useMyJoinRequestDecisions() {
  const { user } = useAuth()
  const [decisions, setDecisions] = useState<JoinRequestDecision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [refetchKey, setRefetchKey] = useState(0)

  const refetch = useCallback(() => setRefetchKey((key) => key + 1), [])

  const dismiss = useCallback(async (id: string) => {
    const { error: rpcError } = await supabase.rpc('acknowledge_join_request_decision', {
      p_request_id: id,
    })
    if (rpcError) throw rpcError
    // Only a stamped row may disappear: a failed acknowledgement must leave the
    // notice up rather than hide a decision the server still owes the applicant.
    setDecisions((prev) => prev.filter((decision) => decision.id !== id))
  }, [])

  useEffect(() => {
    let mounted = true
    // Keyed on the user: the list belongs to whoever is signed in, so a
    // different account on the same device must not see the previous one's
    // decisions while the new fetch is in flight.
    setDecisions([])
    setLoading(true)
    setError(null)

    if (!user?.id) {
      setLoading(false)
      return
    }

    async function fetchDecisions() {
      try {
        const { data, error: rpcError } = await supabase.rpc('get_my_join_request_decisions')
        if (rpcError) throw rpcError
        // One malformed row drops; the rest of the notice stays usable.
        const parsed = (data ?? []).flatMap((row) => {
          const decision = parseRow(MyJoinRequestDecisionRowSchema, row)
          return decision ? [decision as JoinRequestDecision] : []
        })
        if (mounted) setDecisions(parsed)
      } catch (err) {
        console.error('Error fetching join request decisions:', err)
        if (mounted) setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void fetchDecisions()
    return () => {
      mounted = false
    }
  }, [user?.id, refetchKey])

  return { decisions, loading, error, refetch, dismiss }
}
