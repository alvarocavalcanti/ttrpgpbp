// Force a real page reload.
//
// Safari's standalone PWA (macOS/iOS) silently ignores window.location.reload()
// — a WebKit container restriction, made worse when a service worker controls
// the page. Navigating the location to the current URL performs the same
// reload WebKit does honour (#554), so the "New version available" banner
// actually updates the app instead of sitting on "Updating…" forever.
//
// ponytail: same-URL navigation, no cache-busting param — except on the PWA
// self-heal path (#601), which passes bustCache so a container that pinned the
// old shell can't serve it a second time.
export function hardReload(options?: { bustCache?: boolean }): void {
  try {
    let href = window.location.href
    if (options?.bustCache) {
      const url = new URL(href)
      url.searchParams.set('v', String(Date.now()))
      href = url.toString()
    }
    window.location.replace(href)
  } catch {
    // Some embedded webviews refuse location.replace; reload() is the last
    // resort (and is always correct outside those containers).
    window.location.reload()
  }
}
