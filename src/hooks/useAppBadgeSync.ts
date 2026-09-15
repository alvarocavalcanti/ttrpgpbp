import { useEffect, useRef } from 'react'
import { useAuth } from '../features/auth/useAuth'
import { usePushNotifications } from '../features/notifications/usePushNotifications'
import { refreshAppBadge, invalidateBadgeRefresh } from '../lib/channelRead'
import { updateAppBadge } from '../lib/appBadge'

// Owns the launcher badge for every route (#517). The Lobby and the channel
// read path refresh it on data change; this covers the rest: cold start,
// return-to-foreground, focus, and pushes that landed while the app was
// closed. iOS never clears the badge by itself, so without this the number
// the service worker set in the background stays up forever on screens that
// never visit the Lobby or re-read a channel.
export function useAppBadgeSync() {
  const { user } = useAuth()
  const { preferences, loading: prefsLoading } = usePushNotifications()
  const userId = user?.id
  const badgeEnabled = preferences?.badge_enabled !== false

  // Set on the first authenticated run so the initial signed-out state (auth
  // still resolving) doesn't clear a badge that may still be accurate.
  const hadUserRef = useRef(false)

  useEffect(() => {
    if (!userId) {
      if (hadUserRef.current) updateAppBadge(0, true)
      hadUserRef.current = false
      return
    }
    hadUserRef.current = true
    if (prefsLoading) return

    // Leading-edge throttle (one sync per 2s window) so foreground/focus/
    // push bursts cost one unread RPC, mirroring useChannels. userId and
    // badgeEnabled come from this run's closure, so handlers stay fresh.
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      if (timer) return
      timer = setTimeout(() => { timer = undefined }, 2000)
      void refreshAppBadge(userId, badgeEnabled)
    }

    sync()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync()
    }
    const onPush = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') sync()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', sync)
    navigator.serviceWorker?.addEventListener('message', onPush)
    return () => {
      if (timer) clearTimeout(timer)
      // Drop any in-flight refresh before the next run (or unmount) acts:
      // on sign-out the run below clears the badge, and a slow RPC from the
      // previous run must not restore it afterwards (#517 review).
      invalidateBadgeRefresh()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', sync)
      navigator.serviceWorker?.removeEventListener('message', onPush)
    }
  }, [userId, prefsLoading, badgeEnabled])
}
