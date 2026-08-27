import { describe, it, expect } from 'vitest'
import { TriggerPayloadSchema, PushSubscriptionSchema } from './validation.ts'

describe('TriggerPayloadSchema', () => {
  it('accepts a messages trigger', () => {
    expect(TriggerPayloadSchema.safeParse({ table: 'messages', message_id: 'abc' }).success).toBe(true)
  })

  it('accepts a channel_members trigger', () => {
    expect(TriggerPayloadSchema.safeParse({ table: 'channel_members', member_id: 'abc' }).success).toBe(true)
  })

  it('accepts an admin_messages trigger', () => {
    const parsed = TriggerPayloadSchema.safeParse({ table: 'admin_messages', message_id: 'abc' })
    expect(parsed.success).toBe(true)
  })

  it('rejects unknown tables', () => {
    expect(TriggerPayloadSchema.safeParse({ table: 'nope', message_id: 'abc' }).success).toBe(false)
  })

  it('rejects a trigger missing its id', () => {
    expect(TriggerPayloadSchema.safeParse({ table: 'messages' }).success).toBe(false)
    expect(TriggerPayloadSchema.safeParse({ table: 'channel_members' }).success).toBe(false)
  })

  it('rejects a non-string id', () => {
    expect(TriggerPayloadSchema.safeParse({ table: 'messages', message_id: 42 }).success).toBe(false)
  })
})

describe('PushSubscriptionSchema', () => {
  it('accepts a complete row', () => {
    const row = { id: 's1', user_id: 'u1', endpoint: 'https://push.example.com', p256dh: 'a', auth: 'b' }
    expect(PushSubscriptionSchema.safeParse(row).success).toBe(true)
  })

  it('rejects rows missing web-push fields', () => {
    expect(PushSubscriptionSchema.safeParse({ id: 's1', user_id: 'u1' }).success).toBe(false)
    expect(PushSubscriptionSchema.safeParse({ id: 's1', user_id: 'u1', endpoint: '', p256dh: '', auth: '' }).success).toBe(false)
  })
})