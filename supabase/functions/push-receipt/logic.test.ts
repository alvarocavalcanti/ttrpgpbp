import { describe, it, expect } from 'vitest'
import { ReceiptSchema, RECEIPT_STATUSES } from './logic.ts'

const SUB = '11111111-1111-4111-8111-111111111111'
const TOKEN = '22222222-2222-4222-8222-222222222222'
const EVENT = '33333333-3333-4333-8333-333333333333'

describe('ReceiptSchema', () => {
  it('accepts a push-derived receipt', () => {
    const result = ReceiptSchema.safeParse({
      subscription_id: SUB,
      ack_token: TOKEN,
      event_id: EVENT,
      event_kind: 'message',
      status: 'shown',
      detail: null,
    })
    expect(result.success).toBe(true)
  })

  it('accepts a page-derived milestone without event fields', () => {
    const result = ReceiptSchema.safeParse({
      subscription_id: SUB,
      ack_token: TOKEN,
      status: 'subscribed',
    })
    expect(result.success).toBe(true)
  })

  it.each(RECEIPT_STATUSES)('accepts the %s status', (status) => {
    expect(ReceiptSchema.safeParse({ subscription_id: SUB, ack_token: TOKEN, status }).success).toBe(true)
  })

  it('rejects an unknown status', () => {
    expect(ReceiptSchema.safeParse({ subscription_id: SUB, ack_token: TOKEN, status: 'delivered' }).success).toBe(false)
  })

  it('rejects a non-uuid subscription or token', () => {
    expect(ReceiptSchema.safeParse({ subscription_id: 'nope', ack_token: TOKEN, status: 'received' }).success).toBe(false)
    expect(ReceiptSchema.safeParse({ subscription_id: SUB, ack_token: 'nope', status: 'received' }).success).toBe(false)
  })

  it('rejects an oversized detail', () => {
    expect(ReceiptSchema.safeParse({
      subscription_id: SUB,
      ack_token: TOKEN,
      status: 'show_error',
      detail: 'x'.repeat(501),
    }).success).toBe(false)
  })
})
