import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/crimson-pro/400.css'
import '@fontsource/crimson-pro/400-italic.css'
import '@fontsource/crimson-pro/600.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initAnalytics } from './lib/analytics'
import { initSentry } from './lib/sentry'
import { applyStoredTextSize } from './hooks/useTextSize'

void initSentry()

initAnalytics()

// Restore the persisted text size before first paint so it doesn't flash back
// to normal on every full page load (see useTextSize).
applyStoredTextSize()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
