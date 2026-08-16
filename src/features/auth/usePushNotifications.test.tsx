import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePushNotifications } from './usePushNotifications'
import { useAuth } from './useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('./useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('usePushNotifications', () => {
  let mockPushManager: any

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)

    // Setup mock ServiceWorker
    mockPushManager = {
      getSubscription: vi.fn().mockResolvedValue(null),
      subscribe: vi.fn().mockResolvedValue({
        toJSON: () => ({
          endpoint: 'https://push.example.com/xyz',
          keys: { p256dh: 'p256dh-key', auth: 'auth-key' }
        }),
        unsubscribe: vi.fn().mockResolvedValue(true)
      })
    }

    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: mockPushManager
        })
      }
    })

    vi.stubGlobal('PushManager', vi.fn())

    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted')
    })

    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'BKkocaBKa6mLOSX5eX2Rbn21sm_mHbo0Her3UPiBcXHsO31TRLfLyOuSOBQLVJ-vqE-CMPoBgjunINMm6KlTAus'
  })

  it('handles general error in fetchPrefsAndSub', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    
    // Simulate error that throws outside of the expected supabase return structure
    vi.mocked(supabase.from).mockImplementation(() => {
      throw new Error('Unexpected DB Error')
    })

    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(console.error).toHaveBeenCalledWith('Error in fetchPrefsAndSub', expect.any(Error))
      expect(result.current.error).toBeInstanceOf(Error)
    })
  })

  it('handles fetch error when fetching preferences', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER_ERR' } })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(console.error).toHaveBeenCalled()
      expect(result.current.preferences).toBeNull() // because of error, it didn't set default either
      expect(result.current.error).toBeTruthy()
    })
  })

  it('handles subscription failure when permission denied', async () => {
    vi.stubGlobal('Notification', {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('denied')
    })
    
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.subscribeToPush()).rejects.toThrow('Permission not granted for Notification')
  })

  it('fetches preferences and subscription state', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { push_enabled: true, badge_enabled: false }, error: null })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.isSupported).toBe(true)
      expect(result.current.preferences?.badge_enabled).toBe(false)
    })
  })

  it('handles subscribing to push', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.subscribeToPush()
    })

    expect(window.Notification.requestPermission).toHaveBeenCalled()
    expect(mockPushManager.subscribe).toHaveBeenCalled()
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        endpoint: 'https://push.example.com/xyz',
        p256dh: 'p256dh-key',
        auth: 'auth-key'
      }),
      { onConflict: 'user_id,endpoint' }
    )
    expect(result.current.isSubscribed).toBe(true)
  })

  it('handles unsubscribing from push', async () => {
    // Mock that we are already subscribed
    mockPushManager.getSubscription.mockResolvedValue({
      unsubscribe: vi.fn().mockResolvedValue(true),
      toJSON: () => ({
        endpoint: 'https://push.example.com/xyz',
        keys: { p256dh: 'k', auth: 'a' }
      })
    })

    const mockMatch = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ match: mockMatch })
    
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      delete: mockDelete,
      upsert: vi.fn().mockResolvedValue({ error: null })
    } as any)

    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isSubscribed).toBe(true)

    await act(async () => {
      await result.current.unsubscribeFromPush()
    })

    expect(mockDelete).toHaveBeenCalled()
    expect(mockMatch).toHaveBeenCalledWith({ user_id: 'u1', endpoint: 'https://push.example.com/xyz' })
    expect(result.current.isSubscribed).toBe(false)
  })

  it('updates preferences', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: { push_enabled: false }, error: null })
    const mockSelectUpsert = vi.fn().mockReturnValue({ single: mockSingle })
    const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectUpsert })
    
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updatePreferences({ push_enabled: false })
    })

    // The 'temp' id from default fallback should be omitted
    const calledArg = mockUpsert.mock.calls[0][0]
    expect(calledArg).not.toHaveProperty('id', 'temp')
    expect(calledArg.id).toBeUndefined()

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        push_enabled: false
      }),
      { onConflict: 'user_id' }
    )
    expect(result.current.preferences?.push_enabled).toBe(false)
  })

  it('exposes isConfigured correctly based on VAPID key', () => {
    const original = import.meta.env.VITE_VAPID_PUBLIC_KEY

    // Test when key exists
    import.meta.env.VITE_VAPID_PUBLIC_KEY = 'test_key'
    const { result: r1, unmount: u1 } = renderHook(() => usePushNotifications())
    expect(r1.current.isConfigured).toBe(true)
    u1()

    // Test when key is missing
    import.meta.env.VITE_VAPID_PUBLIC_KEY = ''
    const { result: r2, unmount: u2 } = renderHook(() => usePushNotifications())
    expect(r2.current.isConfigured).toBe(false)
    u2()

    // Restore original
    import.meta.env.VITE_VAPID_PUBLIC_KEY = original
  })

  it('sets needsInstall true on iOS non-standalone', () => {
    // iOS tabs do not expose PushManager — only installed PWAs do
    Reflect.deleteProperty(window, 'PushManager')
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
      serviceWorker: {
        ready: Promise.resolve({ pushManager: mockPushManager })
      }
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any

    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.needsInstall).toBe(true)
    expect(result.current.isSupported).toBe(false)
  })

  it('sets needsInstall false on iOS standalone (installed PWA)', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      serviceWorker: {
        ready: Promise.resolve({ pushManager: mockPushManager })
      }
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as any

    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.needsInstall).toBe(false)
  })

  it('sets needsInstall false on non-iOS devices', () => {
    vi.stubGlobal('navigator', {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      serviceWorker: {
        ready: Promise.resolve({ pushManager: mockPushManager })
      }
    })
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as any

    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.needsInstall).toBe(false)
  })

  it('falls back to needsInstall false when matchMedia is unavailable', () => {
    window.matchMedia = undefined as any

    const { result } = renderHook(() => usePushNotifications())
    expect(result.current.needsInstall).toBe(false)
  })

  it('throws when subscribing without a user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)

    const { result } = renderHook(() => usePushNotifications())
    await expect(result.current.subscribeToPush()).rejects.toThrow('Push not supported or not logged in')
  })

  it('throws when subscribing without a VAPID key', async () => {
    const original = import.meta.env.VITE_VAPID_PUBLIC_KEY
    import.meta.env.VITE_VAPID_PUBLIC_KEY = ''
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.subscribeToPush()).rejects.toThrow('Missing VAPID public key')
    expect(mockPushManager.subscribe).not.toHaveBeenCalled()

    import.meta.env.VITE_VAPID_PUBLIC_KEY = original
  })

  it('throws when saving the push subscription fails', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: new Error('DB error') })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.subscribeToPush()).rejects.toThrow('DB error')
    expect(result.current.isSubscribed).toBe(false)
  })

  it('does nothing when unsubscribing without a user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)

    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.unsubscribeFromPush()
    })
    expect(mockPushManager.getSubscription).not.toHaveBeenCalled()
  })

  it('does nothing when unsubscribing with no active subscription', async () => {
    const mockDelete = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      delete: mockDelete
    } as any)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.unsubscribeFromPush()
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it('does nothing when updating preferences without a user', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)

    const { result } = renderHook(() => usePushNotifications())
    await act(async () => {
      await result.current.updatePreferences({ push_enabled: false })
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('throws when updating preferences fails', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') })
    const mockSelectUpsert = vi.fn().mockReturnValue({ single: mockSingle })
    const mockUpsert = vi.fn().mockReturnValue({ select: mockSelectUpsert })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.updatePreferences({ push_enabled: false })).rejects.toThrow('DB error')
  })

  it('reconciles the current subscription on startup', async () => {
    mockPushManager.getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.com/xyz', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } })
    })
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.isSubscribed).toBe(true)
    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: 'https://push.example.com/xyz', p256dh: 'p256dh-key', auth: 'auth-key' },
      { onConflict: 'user_id,endpoint' }
    )
    expect(result.current.error).toBeNull()
  })

  it('surfaces subscription persistence failures on startup', async () => {
    mockPushManager.getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.com/xyz', keys: { p256dh: 'p256dh-key', auth: 'auth-key' } })
    })
    const mockUpsert = vi.fn().mockResolvedValue({ error: new Error('DB error') })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(result.current.error?.message).toBe('DB error')
  })

  it('persists a rotated subscription relayed by the service worker', async () => {
    let messageHandler: ((event: any) => void) | undefined
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({ pushManager: mockPushManager }),
        addEventListener: (type: string, cb: any) => { if (type === 'message') messageHandler = cb },
        removeEventListener: () => {}
      }
    })

    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      messageHandler?.({ data: { type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: { endpoint: 'https://push.example.com/rotated', keys: { p256dh: 'np', auth: 'na' } } } })
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      { user_id: 'u1', endpoint: 'https://push.example.com/rotated', p256dh: 'np', auth: 'na' },
      { onConflict: 'user_id,endpoint' }
    )
  })

  it('reconciles again when the app returns to the foreground', async () => {
    mockPushManager.getSubscription.mockResolvedValue(null)
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } }) }) }),
      upsert: mockUpsert
    } as any)

    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockUpsert).not.toHaveBeenCalled()

    mockPushManager.getSubscription.mockResolvedValue({
      toJSON: () => ({ endpoint: 'https://push.example.com/foreground', keys: { p256dh: 'fp', auth: 'fa' } })
    })

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        { user_id: 'u1', endpoint: 'https://push.example.com/foreground', p256dh: 'fp', auth: 'fa' },
        { onConflict: 'user_id,endpoint' }
      )
    })
    expect(result.current.error).toBeNull()
  })
})
