// Sets or clears the launcher icon badge to match the total unread count.
// Only iOS 16.4+/desktop support setAppBadge; Android shows its own
// notification dot and needs no badge call here.
export function updateAppBadge(totalUnread: number, badgeEnabled: boolean): void {
  if ('setAppBadge' in navigator && badgeEnabled) {
    if (totalUnread > 0) {
      navigator.setAppBadge(totalUnread).catch(console.error)
    } else {
      navigator.clearAppBadge().catch(console.error)
    }
  } else if ('clearAppBadge' in navigator) {
    navigator.clearAppBadge().catch(console.error)
  }
}
