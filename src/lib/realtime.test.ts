import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeWithRetry, useRealtimeStatus } from './realtime'

describe('realtime status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reports offline and online transitions', () => {
    const { result } = renderHook(() => useRealtimeStatus())

    act(() => window.dispatchEvent(new Event('offline')))
    expect(result.current).toBe('Offline')

    act(() => window.dispatchEvent(new Event('online')))
    expect(result.current).toBe('Connected')
  })

  it('retries failed channels with backoff and clears status on cleanup', () => {
    let statusCallback: ((status: string) => void) | undefined
    const unsubscribe = vi.fn()
    const channel = {
      subscribe: vi.fn((callback: (status: string) => void) => {
        statusCallback = callback
        return { unsubscribe }
      })
    }
    const { result } = renderHook(() => useRealtimeStatus())
    const stop = subscribeWithRetry(channel as any, 'test-channel')

    act(() => statusCallback?.('CHANNEL_ERROR'))
    expect(result.current).toBe('Reconnecting')
    expect(channel.subscribe).toHaveBeenCalledTimes(1)

    act(() => vi.advanceTimersByTime(1000))
    expect(channel.subscribe).toHaveBeenCalledTimes(2)

    act(() => statusCallback?.('SUBSCRIBED'))
    expect(result.current).toBe('Connected')

    act(() => {
      statusCallback?.('CHANNEL_ERROR')
      statusCallback?.('SUBSCRIBED')
      vi.advanceTimersByTime(30_000)
    })
    expect(channel.subscribe).toHaveBeenCalledTimes(2)

    stop()
    expect(unsubscribe).toHaveBeenCalled()
    expect(result.current).toBe('Connected')
  })
})
