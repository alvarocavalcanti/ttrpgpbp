import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface ChannelMediaItem {
  /** Full bucket object path, e.g. `{channelId}/message/{uuid}.jpg`. */
  path: string
  /** Bare object name (the uuid filename). */
  name: string
}

export interface ChannelMediaApi {
  items: ChannelMediaItem[]
  loading: boolean
  error: string | null
  refetch: () => void
}

// Newest-first is the useful order for a media browser; 100 is plenty for a
// channel's message images without paginating. ponytail: raise limit or add
// paging only if a channel ever holds more than 100 message images.
const MESSAGE_FOLDER = 'message'
const MAX_ITEMS = 100

// Lists the channel's `message/` images from the private 'images' bucket.
// Storage RLS already scopes reads to channel members, so players can browse;
// the panel decides who may insert.
export function useChannelMedia(channelId: string | undefined): ChannelMediaApi {
  const [items, setItems] = useState<ChannelMediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    if (!channelId) {
      setItems([])
      setError(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    supabase.storage
      .from('images')
      .list(`${channelId}/${MESSAGE_FOLDER}`, {
        limit: MAX_ITEMS,
        sortBy: { column: 'created_at', order: 'desc' },
      })
      .then(({ data, error: listError }) => {
        if (cancelled) return
        if (listError) {
          setItems([])
          setError(listError.message)
          return
        }
        setItems((data ?? []).map(o => ({ path: `${channelId}/${MESSAGE_FOLDER}/${o.name}`, name: o.name })))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [channelId, nonce])

  const refetch = useCallback(() => setNonce(n => n + 1), [])

  return { items, loading, error, refetch }
}
