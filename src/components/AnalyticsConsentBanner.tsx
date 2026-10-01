import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { env } from '../env'
import { initAnalytics, trackPageView } from '../lib/analytics'
import { getAnalyticsConsent, setAnalyticsConsent } from '../lib/analyticsConsent'
import { isPrerender } from '../lib/automation'

// Prior-consent banner for Google Analytics. Rendered only when the operator
// configured a measurement ID and the visitor has not chosen yet; GA does not
// load until they allow it. The choice is remembered per device.
export function AnalyticsConsentBanner() {
  // Start hidden regardless of stored consent so the client's first hydration
  // render matches the prerendered snapshot (which omits this banner), then
  // reveal it after the effect reads the stored choice. Otherwise a returning
  // visitor who already answered would mismatch (React #418) — issue #643.
  const [decided, setDecided] = useState(true)
  useEffect(() => {
    setDecided(getAnalyticsConsent() !== null)
  }, [])
  if (isPrerender() || decided || !env.VITE_GA_MEASUREMENT_ID) return null

  const allow = () => {
    setAnalyticsConsent('granted')
    initAnalytics()
    // initAnalytics disables automatic page views and RouteTracker only fires
    // on pathname change, so report the current route now or it is never sent.
    trackPageView(window.location.pathname)
    setDecided(true)
  }
  const deny = () => {
    setAnalyticsConsent('denied')
    setDecided(true)
  }

  return (
    <div
      role="region"
      aria-label="Usage analytics choice"
      className="fixed bottom-3 inset-x-0 z-[70] mx-auto w-[min(92%,32rem)] rounded-lg border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 shadow-lg p-4"
    >
      <p className="text-sm text-surface-700 dark:text-surface-300">
        {"We'd like to collect anonymous usage statistics to see which screens are used. Nothing you write is included. See the "}
        <Link to="/privacy" className="text-primary-600 dark:text-primary-400 hover:underline">
          Privacy Policy
        </Link>.
      </p>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={deny}
          className="inline-flex items-center min-h-11 px-4 rounded-md text-sm font-medium text-surface-700 dark:text-surface-300 border border-surface-300 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          No thanks
        </button>
        <button
          type="button"
          onClick={allow}
          className="inline-flex items-center min-h-11 px-4 rounded-md text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          Allow
        </button>
      </div>
    </div>
  )
}
