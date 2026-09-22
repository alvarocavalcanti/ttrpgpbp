// Force a real page reload.
//
// Safari's standalone PWA (macOS/iOS) silently ignores window.location.reload()
// — a WebKit container restriction, made worse when a service worker controls
// the page. Navigating the location to the current URL performs the same
// reload WebKit does honour (#554), so the "New version available" banner
// actually updates the app instead of sitting on "Updating…" forever.
//
// ponytail: same-URL navigation, no cache-busting param. The service worker's
// navigation fallback serves the current shell; add a query param only if a
// future engine is found to no-op location.replace too.
export function hardReload(): void {
  try {
    window.location.replace(window.location.href)
  } catch {
    // Some embedded webviews refuse location.replace; reload() is the last
    // resort (and is always correct outside those containers).
    window.location.reload()
  }
}
