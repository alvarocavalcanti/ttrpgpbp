import { supabase } from './supabase'
import { updateAppBadge } from './appBadge'

// Generation counter shared by every refreshAppBadge caller (the badge sync
// hook, the Lobby, channel reads). Each new refresh invalidates older
// in-flight ones, so a slow RPC can never restore a badge that a later state
// — sign-out, badge disable — already cleared (#517 review).
let badgeGeneration = 0
export function invalidateBadgeRefresh(): void {
  badgeGeneration += 1
}

// Refreshes the launcher badge to the current total unread (channel
// messages plus admin threads, #517). Exposed on its own so a re-read that
// happened after the tab was away (when the badge may have grown) can update
// the badge without dismissing notifications again (#502).
export async function refreshAppBadge(userId: string, badgeEnabled: boolean): Promise<void> {
  const generation = ++badgeGeneration
  try {
    const { data, error } = await supabase.rpc('get_user_unread_total', { p_user_id: userId })
    // Leave the badge untouched when the count can't be read: showing a stale
    // number is better than clearing a badge that may still be accurate.
    if (error) return
    // Drop superseded refreshes: a newer state (or a newer refresh) has taken
    // over since this RPC was sent.
    if (generation !== badgeGeneration) return
    // The RPC returns BIGINT, which the client may deliver as a string;
    // coerce so the badge always gets a number.
    updateAppBadge(Number(data) || 0, badgeEnabled)
  } catch (err) {
    console.error('Failed to refresh app badge', err)
  }
}

// Called once a channel or room has been read (its read mark committed). Asks
// the service worker to dismiss that surface's system-tray notifications —
// exactly the channel for Main, exactly `/channel/:id/sub/:room` for a room, so
// an unread room's notification survives opening Main — and refreshes the
// launcher badge to the current total unread.
export async function notifyChannelRead(channelId: string, userId: string, badgeEnabled: boolean, subChannelId?: string | null): Promise<void> {
  navigator.serviceWorker?.getRegistration().then(reg => {
    reg?.active?.postMessage({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId, subChannelId: subChannelId ?? null })
  })

  await refreshAppBadge(userId, badgeEnabled)
}
