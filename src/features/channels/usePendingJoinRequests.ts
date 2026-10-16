import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { toError } from '../../lib/errors'
import { parseRow, JoinRequestRowSchema, type JoinRequest } from '../validation/rowSchemas'

const COLUMNS = 'id, channel_id, user_id, character_name, message, status, created_at'

// Pending applications for one channel (#674). RLS scopes channel_join_requests
// to the applicant and the channel's GM, so this is a GM-facing read: the
// ChannelSettings queue renders the rows, ChannelView's Settings badge counts
// them. Decisions go through decide_join_request, never a direct write.
export function usePendingJoinRequests(channelId: string | undefined) {
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(Boolean(channelId))
  const [error, setError] = useState<Error | null>(null)
  // Bumped by refetch() to re-run the fetch (post-decision, error-state Retry).
  const [refetchKey, setRefetchKey] = useState(0)

  const refetch = useCallback(() => {
    setError(null)
    setLoading(true)
    setRefetchKey((key) => key + 1)
  }, [])

  // Approve or reject one application. Server-side: it sets the decision, and on
  // approval creates the membership from the requested character name and posts
  // the system join message. Callers refresh afterwards (queue + badge).
  const decide = useCallback(async (requestId: string, approve: boolean) => {
    const { error } = await supabase.rpc('decide_join_request', {
      p_request_id: requestId,
      p_approve: approve,
    })
    if (error) throw error
  }, [])

  useEffect(() => {
    if (!channelId) {
      setRequests([])
      setLoading(false)
      return
    }

    let mounted = true
    async function fetchRequests() {
      try {
        const { data, error: queryError } = await supabase
          .from('channel_join_requests')
          .select(COLUMNS)
          .eq('channel_id', channelId as string)
          .eq('status', 'pending')
          // Oldest first, so the longest wait is at the top of the queue.
          .order('created_at', { ascending: true })
        if (queryError) throw queryError
        // One malformed row drops; the rest of the queue stays usable.
        const parsed = (data ?? []).flatMap((row) => {
          const request = parseRow(JoinRequestRowSchema, row)
          return request ? [request] : []
        })
        if (mounted) setRequests(parsed)
      } catch (err) {
        console.error('Error fetching join requests:', err)
        if (mounted) setError(toError(err))
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void fetchRequests()
    return () => {
      mounted = false
    }
  }, [channelId, refetchKey])

  return { requests, loading, error, refetch, decide }
}
