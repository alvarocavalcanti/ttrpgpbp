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

// Newest-first is the useful order for a media browser. Supabase caps a list
// call at 100 objects, so page with `offset` until a short page ends the set.
// MAX_PAGES is a safety cap (a runaway loop is worse than a truncated grid).
const MESSAGE_FOLDER = 'message'
const PAGE_SIZE = 100
const MAX_PAGES = 50

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
    const prefix = `${channelId}/${MESSAGE_FOLDER}`
    const collected: ChannelMediaItem[] = []

    const load = async () => {
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error: listError } = await supabase.storage
          .from('images')
          .list(prefix, {
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
            sortBy: { column: 'created_at', order: 'desc' },
          })
        if (cancelled) return
        if (listError) {
          setItems([])
          setError(listError.message)
          return
        }
        const batch = data ?? []
        collected.push(...batch.map(o => ({ path: `${prefix}/${o.name}`, name: o.name })))
        if (batch.length < PAGE_SIZE) break
      }
      setItems(collected)
    }

    load().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [channelId, nonce])

  const refetch = useCallback(() => setNonce(n => n + 1), [])

  return { items, loading, error, refetch }
}
