// `isAutomatedBrowser` marks any Playwright-driven browser — used to keep the
// SEO prerender's telemetry out of Sentry.
export function isAutomatedBrowser(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver === true
}

// `isPrerender` is true only while the SEO prerender (or its hydration
// verifier) is driving the page, signalled by an init script. Client-only
// transient UI must not render there, or the prerendered snapshot captures a
// later state than the client's first hydration render and React reports a
// mismatch (#418). Kept separate from `isAutomatedBrowser` so real E2E tests
// still exercise that UI.
export function isPrerender(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__ === true
  )
}
