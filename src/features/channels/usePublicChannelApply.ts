import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import {
  parseRow,
  PublicChannelDetailRowSchema,
  type PublicChannelDetail,
} from '../validation/rowSchemas'

// Data layer for the listing detail sheet (#674): the get_public_channel
// projection plus the apply / withdraw RPCs. The sheet owns the copy and the
// inner states; apply/withdraw rethrow so it can surface the server's message.
export function usePublicChannelApply(channelId: string | null) {
  const [detail, setDetail] = useState<PublicChannelDetail | null>(null)
  const [loading, setLoading] = useState(channelId !== null)
  const [error, setError] = useState<Error | null>(null)
  const [busy, setBusy] = useState(false)

  const fetchDetail = useCallback(async () => {
    if (!channelId) {
      setDetail(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('get_public_channel', { p_channel_id: channelId })
    if (rpcError) {
      setError(rpcError)
      setLoading(false)
      return
    }
    // At most one row; no row means the listing is gone (no longer listed,
    // archived, or the caller is blocked), which the sheet then shows as an
    // error state.
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null
    setDetail(row === null ? null : parseRow(PublicChannelDetailRowSchema, row))
    setLoading(false)
  }, [channelId])

  useEffect(() => {
    void fetchDetail()
  }, [fetchDetail])

  const apply = useCallback(
    async (characterName: string, message: string) => {
      if (!channelId) return
      setBusy(true)
      try {
        const { error: rpcError } = await supabase.rpc('request_to_join_channel', {
          p_channel_id: channelId,
          p_character_name: characterName,
          p_message: message || undefined,
        })
        if (rpcError) throw rpcError
        await fetchDetail()
      } finally {
        setBusy(false)
      }
    },
    [channelId, fetchDetail],
  )

  const withdraw = useCallback(
    async (requestId: string) => {
      setBusy(true)
      try {
        const { error: rpcError } = await supabase.rpc('withdraw_join_request', { p_request_id: requestId })
        if (rpcError) throw rpcError
        await fetchDetail()
      } finally {
        setBusy(false)
      }
    },
    [fetchDetail],
  )

  return { detail, loading, error, busy, refetch: fetchDetail, apply, withdraw }
}
