import * as Sentry from '@sentry/react'
import { env } from '../env'

// Sentry breadcrumbs and request URLs carry the full page URL, query string
// included — lobby search terms must never leave the device. beforeSend runs
// for every event (breadcrumbs, exceptions, traces), so scrubbing here closes
// the leak in one place.
export function scrubUrl(url: string): string {
  return new URL(url, window.location.origin).pathname
}

export function scrubSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request?.url) {
    event.request.url = scrubUrl(event.request.url)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    const data = breadcrumb.data as Record<string, unknown> | undefined
    if (data && typeof data.url === 'string') {
      data.url = scrubUrl(data.url)
    }
  }
  return event
}

// No-op when no VITE_SENTRY_DSN is set (local dev / self-hosted instances).
export function initSentry(): void {
  if (!env.VITE_SENTRY_DSN) return
  Sentry.init({
    dsn: env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend: scrubSentryEvent,
  })
}