// Runtime validation for the push-notifications edge function's external
// inputs (issue #305): the trigger payload in the request body and the
// push_subscriptions rows read from the DB. Malformed input is rejected at the
// trust boundary instead of flowing into web-push or the delivery pipeline.

import { z } from 'npm:zod@^4'

export const MessageTriggerSchema = z.object({
  table: z.literal('messages'),
  message_id: z.string(),
})
export type MessageTrigger = z.infer<typeof MessageTriggerSchema>

export const TurnTriggerSchema = z.object({
  table: z.literal('channel_members'),
  member_id: z.string(),
})
export type TurnTrigger = z.infer<typeof TurnTriggerSchema>

export const AdminTriggerSchema = z.object({
  table: z.literal('admin_messages'),
  message_id: z.string(),
})
export type AdminTrigger = z.infer<typeof AdminTriggerSchema>

export const TriggerPayloadSchema = z.discriminatedUnion('table', [
  MessageTriggerSchema,
  TurnTriggerSchema,
  AdminTriggerSchema,
])
export type TriggerPayload = z.infer<typeof TriggerPayloadSchema>

export const PushSubscriptionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
})
export type PushSubscription = z.infer<typeof PushSubscriptionSchema>