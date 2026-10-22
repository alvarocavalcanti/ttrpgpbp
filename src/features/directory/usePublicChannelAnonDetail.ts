import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  parseRow,
  AnonPublicChannelDetailRowSchema,
  type AnonPublicChannelDetail,
} from '../validation/rowSchemas'

// Data layer for the anonymous shareable game page (#755): the
// get_public_channel_anon projection, which returns the GM-authored listing
// copy and no membership state. A missing row means the game is no longer
// listed (or never was), which the page renders as a plain not-found state.
export function usePublicChannelAnonDetail(
  channelId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const [detail, setDetail] = useState<AnonPublicChannelDetail | null>(null)
  const [loading, setLoading] = useState(enabled && channelId !== null)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  // A mounted page can change ids (back/forward between two shared links), so
  // an older response settling last must not replace the newer game's state.
  const requestIdRef = useRef(0)

  const fetchDetail = useCallback(async () => {
    const requestId = ++requestIdRef.current
    if (!channelId || !enabled) {
      setDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setNotFound(false)
    const { data, error: rpcError } = await supabase.rpc('get_public_channel_anon', {
      p_channel_id: channelId,
    })
    if (requestId !== requestIdRef.current) return
    if (rpcError) {
      // A malformed id (e.g. a truncated link) is rejected by Postgres before
      // the query runs — a bad link, not a fetch failure. Retry cannot help.
      if (rpcError.code === '22P02') {
        setDetail(null)
        setNotFound(true)
        setLoading(false)
        return
      }
      setError(rpcError)
      setLoading(false)
      return
    }
    // RETURNS TABLE gives an empty array for no row (no longer listed, archived,
    // or an unknown id). A row that fails validation is equally not a public
    // game.
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    const parsed = row === null ? null : parseRow(AnonPublicChannelDetailRowSchema, row)
    setDetail(parsed)
    setNotFound(parsed === null)
    setLoading(false)
  }, [channelId, enabled])

  useEffect(() => {
    void fetchDetail()
  }, [fetchDetail])

  return { detail, loading, notFound, error, refetch: fetchDetail }
}
