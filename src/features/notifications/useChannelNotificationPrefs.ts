import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

export interface ChannelNotificationPrefs {
  notify_all_messages: boolean
  notify_gm_messages: boolean
  notify_turn: boolean
}

const DEFAULT_PREFS: ChannelNotificationPrefs = {
  notify_all_messages: true,
  notify_gm_messages: true,
  notify_turn: true
}

export function useChannelNotificationPrefs(channelId: string | undefined, myMemberId: string | undefined) {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState<ChannelNotificationPrefs>(DEFAULT_PREFS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true
    if (!channelId || !user?.id) {
      setLoading(false)
      return
    }

    async function fetchPrefs() {
      try {
        const { data, error: fetchError } = await supabase
          .from('channel_members')
          .select('notify_all_messages, notify_gm_messages, notify_turn')
          .eq('user_id', user!.id)
          .eq('channel_id', channelId as string)
          .single()

        if (fetchError) throw fetchError

        if (mounted && data) {
          setPrefs({
            notify_all_messages: data.notify_all_messages,
            notify_gm_messages: data.notify_gm_messages,
            notify_turn: data.notify_turn
          })
        }
      } catch (err: any) {
        console.error('Error fetching notification prefs:', err)
        if (mounted) setError(err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchPrefs()

    return () => { mounted = false }
  }, [channelId, user?.id])

  const updatePrefs = useCallback(async (updates: Partial<ChannelNotificationPrefs>) => {
    if (!channelId || !user || !myMemberId) throw new Error('Not a channel member')

    setSaving(true)
    try {
      const { error: updateError } = await supabase
        .from('channel_members')
        .update(updates)
        .eq('id', myMemberId)

      if (updateError) throw updateError
      setPrefs(prev => ({ ...prev, ...updates }))
    } finally {
      setSaving(false)
    }
  }, [channelId, user, myMemberId])

  return { prefs, loading, saving, error, updatePrefs }
}
