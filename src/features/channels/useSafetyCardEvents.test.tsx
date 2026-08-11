import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { useSafetyCardEvents } from './useSafetyCardEvents'
import { ToastProvider } from '../../contexts/ToastContext'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn()
  }
}))

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>
}

describe('useSafetyCardEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers an X-Card anonymously and confirms to the presser', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    let success = false
    await act(async () => {
      success = await result.current.triggerXCard()
    })

    expect(success).toBe(true)
    expect(mockInsert).toHaveBeenCalledWith({ channel_id: 'c1', message_id: null })

    const toast = document.body.textContent
    expect(toast).toContain('X-Card sent to the GM')
  })

  it('includes message_id when flagging a specific message', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    await act(async () => {
      await result.current.triggerXCard('m42')
    })

    expect(mockInsert).toHaveBeenCalledWith({ channel_id: 'c1', message_id: 'm42' })
  })

  it('reports failure and shows error toast when insert fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockInsert = vi.fn().mockResolvedValue({ error: { message: 'RLS block' } })
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    let success = true
    await act(async () => {
      success = await result.current.triggerXCard()
    })

    expect(success).toBe(false)
    expect(document.body.textContent).toContain('Failed to trigger X-Card.')
  })

  it('refuses to trigger without a channel id', async () => {
    const mockInsert = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ insert: mockInsert } as any)
    vi.mocked(supabase.channel).mockReturnValue({ on: vi.fn().mockReturnValue({ subscribe: vi.fn() }) } as any)

    const { result } = renderHook(() => useSafetyCardEvents(undefined, false), { wrapper })

    let success = true
    await act(async () => {
      success = await result.current.triggerXCard()
    })

    expect(success).toBe(false)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('activates the GM alert when an X-Card event arrives', async () => {
    let cardCallback: ((payload: unknown) => void) | undefined
    const mockOn = vi.fn().mockImplementation((_event, _config, callback) => {
      cardCallback = callback
      return { on: mockOn, subscribe: vi.fn() }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)
    vi.mocked(supabase.from).mockReturnValue({} as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', true), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(false)
    })

    act(() => {
      cardCallback?.({})
    })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(true)
      expect(result.current.alertCount).toBe(1)
    })

    // Non-GM never sees the alert state change even if the payload arrives.
    act(() => {
      cardCallback?.({})
    })

    await waitFor(() => {
      expect(result.current.alertCount).toBe(2)
    })

    act(() => {
      result.current.dismissAlert()
    })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(false)
    })
  })

  it('ignores X-Card events for non-GM clients', async () => {
    let cardCallback: ((payload: unknown) => void) | undefined
    const mockOn = vi.fn().mockImplementation((_event, _config, callback) => {
      cardCallback = callback
      return { on: mockOn, subscribe: vi.fn() }
    })
    vi.mocked(supabase.channel).mockReturnValue({ on: mockOn } as any)
    vi.mocked(supabase.from).mockReturnValue({} as any)

    const { result } = renderHook(() => useSafetyCardEvents('c1', false), { wrapper })

    await waitFor(() => {
      expect(result.current.alertActive).toBe(false)
    })

    act(() => {
      cardCallback?.({})
    })

    expect(result.current.alertActive).toBe(false)
    expect(result.current.alertCount).toBe(0)
  })
})
