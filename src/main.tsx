import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initAnalytics } from './lib/analytics'
import { hasAnalyticsConsent } from './lib/analyticsConsent'
import { hasPersistedSession } from './lib/authSessionHint'
import { initSentry } from './lib/sentry'

void initSentry()

// Analytics loads only after the visitor allows it (see AnalyticsConsentBanner).
if (hasAnalyticsConsent()) initAnalytics()

const container = document.getElementById('root')!

const tree = (
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)

// Public routes are prerendered to static HTML (issue #643), so hydrate that
// markup. The app shell (app/auth routes) has an empty #root and mounts fresh.
//
// A persisted session means the `/` snapshot is the marketing landing but the
// client will render the lobby: drop the prerendered DOM so React never
// hydrates (or paints) the wrong page (issue #658). The inline index.html
// script already hid #root to cover the pre-paint window; App removes that
// attribute after its first commit.
if (hasPersistedSession()) container.replaceChildren()

if (container.firstElementChild) {
  hydrateRoot(container, tree)
} else {
  createRoot(container).render(tree)
}
