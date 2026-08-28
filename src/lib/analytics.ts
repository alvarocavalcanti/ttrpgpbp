import { env } from '../env'

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

// gtag is only defined once the gtag.js script loads; guard every call so a
// failure to load (or analytics being disabled) never throws.
function push(...args: unknown[]): void {
  window.gtag?.(...args)
}

function gtagScriptSrc(id: string): string {
  return `https://www.googletagmanager.com/gtag/js?id=${id}`
}

// Loads gtag.js and registers the configured property. No-op when no
// VITE_GA_MEASUREMENT_ID is set (e.g. local dev / self-hosted instances).
export function initAnalytics(): void {
  const id = env.VITE_GA_MEASUREMENT_ID
  if (!id) return

  const existing = document.getElementById('gtag-script')
  if (!existing) {
    const script = document.createElement('script')
    script.id = 'gtag-script'
    script.async = true
    script.src = gtagScriptSrc(id)
    document.head.appendChild(script)
  }

  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer!.push(args)
  }
  window.gtag('js', new Date())
  window.gtag('config', id)
}

// Fires a page_view for SPA route changes. Guards against gtag being
// unavailable (analytics disabled or script not yet loaded). Only the
// pathname is reported — the query string is stripped so search terms (e.g.
// lobby search) never leave the device.
export function trackPageView(pagePath: string): void {
  const pathname = pagePath.split('?')[0]
  push('event', 'page_view', { page_path: pathname })
}
