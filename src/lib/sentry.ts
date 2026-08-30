import type * as SentryTypes from '@sentry/react'
import { env } from '../env'

// Sentry breadcrumbs and request URLs carry the full page URL, query string
// included — lobby search terms must never leave the device. beforeSend runs
// for every event (breadcrumbs, exceptions, traces), so scrubbing here closes
// the leak in one place.
export function scrubUrl(url: string): string {
  return new URL(url, window.location.origin).pathname
}

export function scrubSentryEvent(event: SentryTypes.ErrorEvent): SentryTypes.ErrorEvent {
  if (event.request?.url) {
    event.request.url = scrubUrl(event.request.url)
  }
  for (const breadcrumb of event.breadcrumbs ?? []) {
    const data = breadcrumb.data as Record<string, unknown> | undefined
    if (!data) continue
    // Navigation breadcrumbs carry URLs as data.from/data.to, all other
    // URL-bearing breadcrumbs as data.url.
    for (const key of ['url', 'from', 'to'] as const) {
      if (typeof data[key] === 'string') {
        data[key] = scrubUrl(data[key] as string)
      }
    }
  }
  return event
}

// @sentry/react is ~100 kB minified; load it behind import() so it never lands
// in the main chunk. Sentry initializes a beat after first render — fine for
// error/tracing telemetry (self-hosted instances have no DSN and load nothing).
export async function initSentry(): Promise<void> {
  if (!env.VITE_SENTRY_DSN) return
  try {
    const Sentry = await import('@sentry/react')
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
  } catch {
    // best-effort: chunk fetch failed (e.g. stale service worker), skip telemetry
  }
}

// Thin async wrapper so callers (ErrorBoundary) never import Sentry statically.
// Chunk-load failures (stale service worker serving old HTML post-deploy) must
// never surface as unhandled rejections or break the caller — telemetry is
// best-effort.
export async function captureException(error: unknown, extra?: Record<string, unknown>): Promise<void> {
  if (!env.VITE_SENTRY_DSN) return
  try {
    const Sentry = await import('@sentry/react')
    Sentry.captureException(error, extra ? { extra } : undefined)
  } catch {
    // best-effort: chunk fetch failed, nothing we can report to
  }
}
