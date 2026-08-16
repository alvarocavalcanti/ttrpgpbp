import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  subscriptionToRow,
  subscriptionJsonToRow,
  getActiveSubscription,
  persistPushSubscription,
  reconcilePushSubscription
} from './pushSubscription'

function mockClient(upsertResult: { error?: Error | null } = {}) {
  const upsert = vi.fn().mockResolvedValue(upsertResult)
  const from = vi.fn().mockReturnValue({ upsert })
  return { from, upsert }
}

describe('subscriptionToRow', () => {
  it('maps endpoint and keys to DB columns', () => {
    const subscription = { toJSON: () => ({ endpoint: 'https://push.example.com/e', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }) }
    expect(subscriptionToRow(subscription as any)).toEqual({
      endpoint: 'https://push.example.com/e',
      p256dh: 'p256dh-key',
      auth: 'auth-key'
    })
  })

  it('falls back to empty strings when keys are missing', () => {
    const subscription = { toJSON: () => ({ endpoint: 'https://push.example.com/e', keys: {} }) }
    expect(subscriptionToRow(subscription as any)).toEqual({
      endpoint: 'https://push.example.com/e',
      p256dh: '',
      auth: ''
    })
  })
})

describe('subscriptionJsonToRow', () => {
  it('maps the service-worker relayed JSON to DB columns', () => {
    expect(subscriptionJsonToRow({ endpoint: 'https://push.example.com/e', keys: { p256dh: 'p', auth: 'a' } })).toEqual({
      endpoint: 'https://push.example.com/e',
      p256dh: 'p',
      auth: 'a'
    })
  })

  it('handles null/undefined/empty input', () => {
    expect(subscriptionJsonToRow(null)).toEqual({ endpoint: '', p256dh: '', auth: '' })
    expect(subscriptionJsonToRow(undefined)).toEqual({ endpoint: '', p256dh: '', auth: '' })
    expect(subscriptionJsonToRow({})).toEqual({ endpoint: '', p256dh: '', auth: '' })
  })
})

describe('persistPushSubscription', () => {
  it('upserts the row with the right payload and conflict target', async () => {
    const client = mockClient({ error: null })
    const result = await persistPushSubscription('u1', { endpoint: 'https://push.example.com/e', p256dh: 'p', auth: 'a' }, client as any)

    expect(result).toEqual({ ok: true })
    expect(client.from).toHaveBeenCalledWith('push_subscriptions')
    expect(client.upsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: 'https://push.example.com/e', p256dh: 'p', auth: 'a' },
      { onConflict: 'user_id,endpoint' }
    )
  })

  it('returns the error instead of throwing on DB failure', async () => {
    const client = mockClient({ error: new Error('DB error') })
    const result = await persistPushSubscription('u1', { endpoint: 'e', p256dh: 'p', auth: 'a' }, client as any)

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error?.message).toBe('DB error')
  })
})

describe('getActiveSubscription', () => {
  let mockPushManager: any

  beforeEach(() => {
    mockPushManager = { getSubscription: vi.fn() }
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ pushManager: mockPushManager }) }
    })
    vi.stubGlobal('PushManager', vi.fn())
  })

  it('returns the active subscription', async () => {
    const sub = { endpoint: 'e' }
    mockPushManager.getSubscription.mockResolvedValue(sub)
    await expect(getActiveSubscription()).resolves.toBe(sub)
  })

  it('returns null when there is no subscription', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    await expect(getActiveSubscription()).resolves.toBeNull()
  })

  it('returns null when PushManager is unavailable', async () => {
    Reflect.deleteProperty(window, 'PushManager')
    await expect(getActiveSubscription()).resolves.toBeNull()
    expect(mockPushManager.getSubscription).not.toHaveBeenCalled()
  })
})

describe('reconcilePushSubscription', () => {
  let mockPushManager: any

  beforeEach(() => {
    mockPushManager = { getSubscription: vi.fn() }
    vi.stubGlobal('navigator', {
      serviceWorker: { ready: Promise.resolve({ pushManager: mockPushManager }) }
    })
    vi.stubGlobal('PushManager', vi.fn())
  })

  it('does nothing when there is no active subscription', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    const client = mockClient({ error: null })

    await expect(reconcilePushSubscription('u1', client as any)).resolves.toEqual({ ok: true })
    expect(client.upsert).not.toHaveBeenCalled()
  })

  it('upserts the active subscription', async () => {
    mockPushManager.getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.com/e', keys: { p256dh: 'p', auth: 'a' } })
    })
    const client = mockClient({ error: null })

    await expect(reconcilePushSubscription('u1', client as any)).resolves.toEqual({ ok: true })
    expect(client.upsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: 'https://push.example.com/e', p256dh: 'p', auth: 'a' },
      { onConflict: 'user_id,endpoint' }
    )
  })

  it('surfaces upsert failures', async () => {
    mockPushManager.getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'e', keys: { p256dh: 'p', auth: 'a' } })
    })
    const client = mockClient({ error: new Error('DB error') })

    const result = await reconcilePushSubscription('u1', client as any)
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('DB error')
  })

  it('surfaces errors thrown while reading the subscription', async () => {
    mockPushManager.getSubscription.mockRejectedValue(new Error('SW not ready'))

    const result = await reconcilePushSubscription('u1', mockClient() as any)
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('SW not ready')
  })
})
