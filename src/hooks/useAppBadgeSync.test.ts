import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAppBadgeSync } from './useAppBadgeSync'
import { useAuth } from '../features/auth/useAuth'
import { usePushNotifications } from '../features/notifications/usePushNotifications'
import { refreshAppBadge } from '../lib/channelRead'
import { updateAppBadge } from '../lib/appBadge'

vi.mock('../features/auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('../features/notifications/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}))

vi.mock('../lib/channelRead', () => ({
  refreshAppBadge: vi.fn(),
}))

vi.mock('../lib/appBadge', () => ({
  updateAppBadge: vi.fn(),
}))

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

describe('useAppBadgeSync', () => {
  let swHandlers: Record<string, (e: MessageEvent) => void>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    swHandlers = {}
    vi.stubGlobal('navigator', {
      serviceWorker: {
        addEventListener: vi.fn((type: string, handler: (e: MessageEvent) => void) => {
          swHandlers[type] = handler
        }),
        removeEventListener: vi.fn(),
      },
    })
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: true },
      loading: false,
    } as any)
    vi.mocked(refreshAppBadge).mockResolvedValue(undefined)
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('syncs the badge on mount', () => {
    renderHook(() => useAppBadgeSync())
    expect(refreshAppBadge).toHaveBeenCalledWith('u1', true)
  })

  it('waits for preferences before the first sync', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: null,
      loading: true,
    } as any)

    const { rerender } = renderHook(() => useAppBadgeSync())
    expect(refreshAppBadge).not.toHaveBeenCalled()

    vi.mocked(usePushNotifications).mockReturnValue({
      preferences: { badge_enabled: false },
      loading: false,
    } as any)
    rerender()
    expect(refreshAppBadge).toHaveBeenCalledWith('u1', false)
  })

  it('re-syncs when the tab returns to the foreground', () => {
    renderHook(() => useAppBadgeSync())
    expect(refreshAppBadge).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(refreshAppBadge).toHaveBeenCalledTimes(2)
  })

  it('ignores visibility changes to hidden', () => {
    renderHook(() => useAppBadgeSync())

    act(() => { vi.advanceTimersByTime(2000) })
    setVisibility('hidden')
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(refreshAppBadge).toHaveBeenCalledTimes(1)
  })

  it('re-syncs on window focus', () => {
    renderHook(() => useAppBadgeSync())

    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(refreshAppBadge).toHaveBeenCalledTimes(2)
  })

  it('re-syncs on push receipt but ignores other service worker messages', () => {
    renderHook(() => useAppBadgeSync())

    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { swHandlers.message({ data: { type: 'PUSH_RECEIVED' } } as MessageEvent) })
    expect(refreshAppBadge).toHaveBeenCalledTimes(2)

    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { swHandlers.message({ data: { type: 'OTHER' } } as MessageEvent) })
    expect(refreshAppBadge).toHaveBeenCalledTimes(2)
  })

  it('throttles event bursts to one sync per window', () => {
    renderHook(() => useAppBadgeSync())
    expect(refreshAppBadge).toHaveBeenCalledTimes(1)

    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    act(() => { window.dispatchEvent(new Event('focus')) })
    expect(refreshAppBadge).toHaveBeenCalledTimes(1)

    act(() => { vi.advanceTimersByTime(2000) })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(refreshAppBadge).toHaveBeenCalledTimes(2)
  })

  it('does nothing while signed out', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    renderHook(() => useAppBadgeSync())
    expect(refreshAppBadge).not.toHaveBeenCalled()
    expect(updateAppBadge).not.toHaveBeenCalled()
  })

  it('clears the previous user badge on sign-out', () => {
    const { rerender } = renderHook(() => useAppBadgeSync())
    expect(refreshAppBadge).toHaveBeenCalledTimes(1)

    vi.mocked(useAuth).mockReturnValue({ user: null } as any)
    rerender()
    expect(updateAppBadge).toHaveBeenCalledWith(0, true)
  })
})
