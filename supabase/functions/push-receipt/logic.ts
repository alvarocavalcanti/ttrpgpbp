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
