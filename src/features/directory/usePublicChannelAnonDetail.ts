import { useCallback, useEffect, useState } from 'react'
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

  const fetchDetail = useCallback(async () => {
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
    if (rpcError) {
      setError(rpcError)
      setLoading(false)
      return
    }
    // RETURNS TABLE gives an empty array for no row (no longer listed, archived, or an
    // unknown id). A row that fails validation is equally not a public game.
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
