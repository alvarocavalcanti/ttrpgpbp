import { supabase } from './supabase'
import { updateAppBadge } from './appBadge'

// Called once a channel has been read (last_read_at committed). Asks the
// service worker to dismiss that channel's system-tray notifications and
// refreshes the launcher badge to the current total unread.
export async function notifyChannelRead(channelId: string, userId: string, badgeEnabled: boolean): Promise<void> {
  navigator.serviceWorker?.getRegistration().then(reg => {
    reg?.active?.postMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId })
  })

  const { data } = await supabase.rpc('get_user_channels_unread', { p_user_id: userId })
  const total = (data || []).reduce((sum: number, row: { unread_count: number }) => sum + row.unread_count, 0)
  updateAppBadge(total, badgeEnabled)
}
