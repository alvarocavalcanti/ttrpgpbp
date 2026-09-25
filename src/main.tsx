import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initAnalytics } from './lib/analytics'
import { hasAnalyticsConsent } from './lib/analyticsConsent'
import { initSentry } from './lib/sentry'

void initSentry()

// Analytics loads only after the visitor allows it (see AnalyticsConsentBanner).
if (hasAnalyticsConsent()) initAnalytics()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
