// Delivery hardening for the push-notifications edge function (#191).
// Kept dependency-free so it runs in the Deno edge function and in vitest.
//
// web-push throws WebPushError with a `statusCode` for HTTP responses;
// transport/network failures surface as errors without one.

export type ErrorCategory = 'invalid' | 'transient' | 'other'

// Invalid: the subscription is gone (HTTP 404/410) and must be deleted.
// Transient: provider/network trouble worth retrying (5xx, no HTTP status).
// Other: permanent client/provider errors that retrying won't fix.
export function classifyWebPushError(err: unknown): ErrorCategory {
  if (err && typeof err === 'object' && 'statusCode' in err) {
    const status = (err as { statusCode?: number }).statusCode
    if (status === 404 || status === 410) return 'invalid'
    if (typeof status === 'number' && status >= 500) return 'transient'
    return 'other'
  }
  return 'transient'
}

export type DeliveryOutcome =
  | { status: 'sent' }
  | { status: 'invalid' }
  | { status: 'transient' }
  | { status: 'failed' }

export interface SendRetryOptions {
  maxAttempts?: number
  backoffMs?: number
}

// Sends with bounded retries. Only transient failures are retried, with
// exponential backoff. `send` is injected so web-push stays out of this module.
export async function sendWithRetry(
  send: (subscription: unknown, payload: unknown) => Promise<unknown>,
  subscription: unknown,
  payload: unknown,
  options: SendRetryOptions = {}
): Promise<DeliveryOutcome> {
  const maxAttempts = options.maxAttempts ?? 3
  const backoffMs = options.backoffMs ?? 250

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await send(subscription, payload)
      return { status: 'sent' }
    } catch (err) {
      const category = classifyWebPushError(err)
      if (category === 'invalid') return { status: 'invalid' }
      if (category === 'other') return { status: 'failed' }
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, backoffMs * 2 ** (attempt - 1)))
      }
    }
  }
  return { status: 'transient' }
}
