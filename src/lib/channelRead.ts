import { supabase } from './supabase'
import { updateAppBadge } from './appBadge'

// Refreshes the launcher badge to the current total unread (channel
// messages plus admin threads, #517). Exposed on its own so a re-read that
// happened after the tab was away (when the badge may have grown) can update
// the badge without dismissing notifications again (#502).
export async function refreshAppBadge(userId: string, badgeEnabled: boolean): Promise<void> {
  try {
    const { data, error } = await supabase.rpc('get_user_unread_total', { p_user_id: userId })
    // Leave the badge untouched when the count can't be read: showing a stale
    // number is better than clearing a badge that may still be accurate.
    if (error) return
    // The RPC returns BIGINT, which the client may deliver as a string;
    // coerce so the badge always gets a number.
    updateAppBadge(Number(data) || 0, badgeEnabled)
  } catch (err) {
    console.error('Failed to refresh app badge', err)
  }
}

// Called once a channel has been read (last_read_at committed). Asks the
// service worker to dismiss that channel's system-tray notifications and
// refreshes the launcher badge to the current total unread.
export async function notifyChannelRead(channelId: string, userId: string, badgeEnabled: boolean): Promise<void> {
  navigator.serviceWorker?.getRegistration().then(reg => {
    reg?.active?.postMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId })
  })

  await refreshAppBadge(userId, badgeEnabled)
}
