import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  subscriptionToRow,
  subscriptionJsonToRow,
  getActiveSubscription,
  persistPushSubscription,
  ensurePushSubscription,
  logPushClientEvent,
  urlBase64ToUint8Array,
  isPushOptedOut,
  markPushOptedOut,
  clearPushOptedOut
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

describe('ensurePushSubscription (existing subscription only)', () => {
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

    await expect(ensurePushSubscription('u1', '', client as any)).resolves.toEqual({ ok: true })
    expect(client.upsert).not.toHaveBeenCalled()
  })

  it('upserts the active subscription', async () => {
    mockPushManager.getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.com/e', keys: { p256dh: 'p', auth: 'a' } })
    })
    const client = mockClient({ error: null })

    await expect(ensurePushSubscription('u1', '', client as any)).resolves.toEqual({ ok: true })
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

    const result = await ensurePushSubscription('u1', '', client as any)
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('DB error')
  })

  it('surfaces errors thrown while reading the subscription', async () => {
    mockPushManager.getSubscription.mockRejectedValue(new Error('SW not ready'))

    const result = await ensurePushSubscription('u1', '', mockClient() as any)
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('SW not ready')
  })
})

describe('urlBase64ToUint8Array', () => {
  it('decodes a base64url VAPID key to its 65 raw bytes', () => {
    const key = 'BKkocaBKa6mLOSX5eX2Rbn21sm_mHbo0Her3UPiBcXHsO31TRLfLyOuSOBQLVJ-vqE-CMPoBgjunINMm6KlTAus'
    const bytes = urlBase64ToUint8Array(key)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes).toHaveLength(65)
    // Uncompressed P-256 point: first byte is 0x04.
    expect(bytes[0]).toBe(4)
  })
})

describe('ensurePushSubscription', () => {
  let mockPushManager: any

  beforeEach(() => {
    clearPushOptedOut()
    mockPushManager = { getSubscription: vi.fn(), subscribe: vi.fn() }
    vi.stubGlobal('navigator', {
      userAgent: 'test-agent',
      serviceWorker: { ready: Promise.resolve({ pushManager: mockPushManager }) }
    })
    vi.stubGlobal('PushManager', vi.fn())
  })

  afterEach(() => clearPushOptedOut())

  it('creates and persists a subscription when permission is granted and none exists', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    mockPushManager.subscribe.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.com/new', keys: { p256dh: 'p', auth: 'a' } })
    })
    vi.stubGlobal('Notification', { permission: 'granted' })
    const client = mockClient({ error: null })

    const result = await ensurePushSubscription('u1', 'BKkocaBKa6mLOSX5eX2Rbn21sm_mHbo0Her3UPiBcXHsO31TRLfLyOuSOBQLVJ-vqE-CMPoBgjunINMm6KlTAus', client as any)

    expect(result).toEqual({ ok: true, created: true })
    expect(mockPushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array)
    })
    expect(client.upsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: 'https://push.example.com/new', p256dh: 'p', auth: 'a' },
      { onConflict: 'user_id,endpoint' }
    )
  })

  it('does not create when permission is not granted', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    vi.stubGlobal('Notification', { permission: 'default' })
    const client = mockClient()

    await expect(ensurePushSubscription('u1', 'BKkocaBKa6mLOSX5eX2Rbn21sm_mHbo0Her3UPiBcXHsO31TRLfLyOuSOBQLVJ-vqE-CMPoBgjunINMm6KlTAus', client as any)).resolves.toEqual({ ok: true })
    expect(mockPushManager.subscribe).not.toHaveBeenCalled()
    expect(client.upsert).not.toHaveBeenCalled()
  })

  it('does not create without a VAPID key', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    vi.stubGlobal('Notification', { permission: 'granted' })
    const client = mockClient()

    await expect(ensurePushSubscription('u1', '', client as any)).resolves.toEqual({ ok: true })
    expect(mockPushManager.subscribe).not.toHaveBeenCalled()
  })

  it('persists an existing subscription without recreating it', async () => {
    mockPushManager.getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.com/e', keys: { p256dh: 'p', auth: 'a' } })
    })
    const client = mockClient()

    await expect(ensurePushSubscription('u1', 'BKkocaBKa6mLOSX5eX2Rbn21sm_mHbo0Her3UPiBcXHsO31TRLfLyOuSOBQLVJ-vqE-CMPoBgjunINMm6KlTAus', client as any)).resolves.toEqual({ ok: true })
    expect(mockPushManager.subscribe).not.toHaveBeenCalled()
    expect(client.upsert).toHaveBeenCalled()
  })

  it('surfaces a failed create instead of throwing', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    mockPushManager.subscribe.mockRejectedValue(new Error('subscribe denied'))
    vi.stubGlobal('Notification', { permission: 'granted' })

    const result = await ensurePushSubscription('u1', 'BKkocaBKa6mLOSX5eX2Rbn21sm_mHbo0Her3UPiBcXHsO31TRLfLyOuSOBQLVJ-vqE-CMPoBgjunINMm6KlTAus', mockClient() as any)
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('subscribe denied')
  })

  it('does not recreate a subscription after a device opt-out', async () => {
    markPushOptedOut()
    mockPushManager.getSubscription.mockResolvedValue(null)
    vi.stubGlobal('Notification', { permission: 'granted' })
    const client = mockClient()

    await expect(ensurePushSubscription('u1', 'BKkocaBKa6mLOSX5eX2Rbn21sm_mHbo0Her3UPiBcXHsO31TRLfLyOuSOBQLVJ-vqE-CMPoBgjunINMm6KlTAus', client as any))
      .resolves.toEqual({ ok: true })
    expect(mockPushManager.subscribe).not.toHaveBeenCalled()
    expect(client.upsert).not.toHaveBeenCalled()
  })
})

describe('push opt-out marker', () => {
  afterEach(() => clearPushOptedOut())

  it('round-trips the marker in storage', () => {
    expect(isPushOptedOut()).toBe(false)
    markPushOptedOut()
    expect(isPushOptedOut()).toBe(true)
    clearPushOptedOut()
    expect(isPushOptedOut()).toBe(false)
  })
})

describe('logPushClientEvent', () => {
  it('inserts the milestone under the user id', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null })
    const client = { from: vi.fn().mockReturnValue({ insert }) }

    await logPushClientEvent('u1', 'reconcile_ok', 'recreated', client as any)

    expect(client.from).toHaveBeenCalledWith('push_client_log')
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'u1', status: 'reconcile_ok', detail: 'recreated' })
    )
  })

  it('never throws when the write fails', async () => {
    const client = { from: vi.fn().mockReturnValue({ insert: vi.fn().mockRejectedValue(new Error('nope')) }) }

    await expect(logPushClientEvent('u1', 'reconcile_error', 'boom', client as any)).resolves.toBeUndefined()
  })
})
