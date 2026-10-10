import { describe, it, expect, vi } from 'vitest'
import { ReceiptSchema, RECEIPT_STATUSES, applyReceipt } from './logic.ts'
import type { ReceiptDb } from './logic.ts'

const SUB = '11111111-1111-4111-8111-111111111111'
const TOKEN = '22222222-2222-4222-8222-222222222222'
const EVENT = '33333333-3333-4333-8333-333333333333'

function fakeDb(opts: {
  subscription?: { id: string; user_id: string } | null
  lookupError?: { message: string } | null
  insertError?: { message: string } | null
} = {}) {
  const insert = vi.fn().mockResolvedValue({ error: opts.insertError ?? null })
  const maybeSingle = vi.fn().mockResolvedValue({ data: opts.subscription ?? null, error: opts.lookupError ?? null })
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  const from = vi.fn((table: string) => (table === 'push_subscriptions' ? { select } : { insert }))
  return { from, select, eq1, eq2, maybeSingle, insert }
}

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

describe('applyReceipt', () => {
  const receipt = { subscription_id: SUB, ack_token: TOKEN, status: 'shown' as const }

  it('writes under the subscription-derived user when the token matches', async () => {
    const db = fakeDb({ subscription: { id: SUB, user_id: 'user-1' } })

    await expect(applyReceipt(db as unknown as ReceiptDb, receipt, 'UA')).resolves.toBe('ok')

    expect(db.from).toHaveBeenCalledWith('push_subscriptions')
    expect(db.from).toHaveBeenCalledWith('push_client_log')
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({
      subscription_id: SUB,
      user_id: 'user-1',
      status: 'shown',
      user_agent: 'UA',
    }))
  })

  it('rejects a mismatched token without writing', async () => {
    const db = fakeDb({ subscription: null })

    await expect(applyReceipt(db as unknown as ReceiptDb, receipt, 'UA')).resolves.toBe('unknown')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('returns error on a lookup failure and never inserts', async () => {
    const db = fakeDb({ lookupError: { message: 'boom' } })

    await expect(applyReceipt(db as unknown as ReceiptDb, receipt, 'UA')).resolves.toBe('error')
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('returns error on an insert failure', async () => {
    const db = fakeDb({ subscription: { id: SUB, user_id: 'user-1' }, insertError: { message: 'boom' } })

    await expect(applyReceipt(db as unknown as ReceiptDb, receipt, 'UA')).resolves.toBe('error')
  })

  it('derives the user from the matched subscription, ignoring any request value', async () => {
    const db = fakeDb({ subscription: { id: SUB, user_id: 'user-1' } })

    await applyReceipt(db as unknown as ReceiptDb, { ...receipt, user_id: 'attacker' } as never, null)

    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1' }))
  })
})
