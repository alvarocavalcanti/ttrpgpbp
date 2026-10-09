import { supabase } from './supabase'
import { captureException } from './sentry'
import { isAutomatedBrowser } from './automation'

export interface AppErrorContext {
  detail?: Record<string, unknown>
}

// Best-effort durable error report. Never throws: telemetry must not break the
// caller. Writes to public.app_error_log through report_app_error(), which
// clamps every field server-side; also mirrors to Sentry when a DSN is set
// (captureException is itself DSN-gated and no-ops in automated browsers).
export function reportAppError(error: unknown, context: AppErrorContext = {}): void {
  if (isAutomatedBrowser()) return

  const err = error instanceof Error ? error : new Error(String(error))
  // Pathname only — never a query string (lobby search terms must not leak).
  const route = typeof window !== 'undefined' ? window.location.pathname : undefined
  const detail = {
    ...context.detail,
    ...(err.stack ? { stack: err.stack.slice(0, 1500) } : {}),
  }

  void captureException(err, context.detail)

  supabase
    .rpc('report_app_error', {
      p_message: err.message,
      p_route: route,
      p_detail: detail,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      p_app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : undefined,
    })
    .then(
      ({ error: rpcError }) => {
        if (rpcError) console.error('Failed to report app error:', rpcError)
      },
      (rpcError: unknown) => {
        console.error('Failed to report app error:', rpcError)
      },
    )
}
