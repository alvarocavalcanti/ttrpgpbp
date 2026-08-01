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
      delete: mockDelete
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

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      push_enabled: false
    }))
    expect(result.current.preferences?.push_enabled).toBe(false)
  })
})
