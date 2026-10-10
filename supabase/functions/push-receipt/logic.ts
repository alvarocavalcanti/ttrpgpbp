// Pure logic for the push-receipt edge function, kept dependency-free so it
// runs both in the Deno function and in vitest (mirrors the push-notifications
// split).

import { z } from 'npm:zod@^4'

// The client-side milestone the service worker (or the page) reports. Mirrors
// the push_client_log.status CHECK constraint.
export const RECEIPT_STATUSES = [
  'received',
  'invalid_payload',
  'shown',
  'show_error',
  'clicked',
  'subscribed',
  'unsubscribed',
  'reconcile_ok',
  'reconcile_error',
] as const

export const ReceiptSchema = z.object({
  subscription_id: z.string().uuid(),
  ack_token: z.string().uuid(),
  // Present for push-derived receipts, absent for page subscribe/reconcile
  // milestones.
  event_id: z.string().uuid().nullish(),
  event_kind: z.string().max(32).nullish(),
  status: z.enum(RECEIPT_STATUSES),
  detail: z.string().max(500).nullish(),
})

export type Receipt = z.infer<typeof ReceiptSchema>

// Minimal client surface needed to record a receipt. The real service-role
// supabase client satisfies it; tests pass a fake.
export interface ReceiptDb {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          maybeSingle(): PromiseLike<{ data: { id: string; user_id: string } | null; error: { message?: string } | null }>
        }
      }
    }
    insert(row: Record<string, unknown>): PromiseLike<{ error: { message?: string } | null }>
  }
}

export type ReceiptOutcome = 'ok' | 'unknown' | 'error'

// Token-gated write. The subscription is looked up by (id, ack_token): a caller
// that does not hold the device's ack_token matches no row and cannot write.
// The stored user_id comes from the matched row, never from the request.
export async function applyReceipt(
  db: ReceiptDb,
  receipt: Receipt,
  userAgent: string | null
): Promise<ReceiptOutcome> {
  const { data: subscription, error: lookupError } = await db
    .from('push_subscriptions')
    .select('id, user_id')
    .eq('id', receipt.subscription_id)
    .eq('ack_token', receipt.ack_token)
    .maybeSingle()

  if (lookupError) return 'error'
  if (!subscription) return 'unknown'

  const { error } = await db.from('push_client_log').insert({
    event_id: receipt.event_id ?? null,
    subscription_id: subscription.id,
    user_id: subscription.user_id,
    event_kind: receipt.event_kind ?? null,
    status: receipt.status,
    detail: receipt.detail ?? null,
    user_agent: userAgent,
  })
  return error ? 'error' : 'ok'
}
