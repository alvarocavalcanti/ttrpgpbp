import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelNotificationPrefs } from './useChannelNotificationPrefs'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn()
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('useChannelNotificationPrefs', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as any)
  })

  it('uses defaults when no channel id', async () => {
    const { result } = renderHook(() => useChannelNotificationPrefs(undefined, 'm1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.prefs).toEqual({
        notify_all_messages: true,
        notify_gm_messages: true,
        notify_turn: true
      })
    })
  })

  it('fetches existing preferences', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { notify_all_messages: false, notify_gm_messages: true, notify_turn: false },
      error: null
    })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqChannel })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqUser }) } as any)

    const { result } = renderHook(() => useChannelNotificationPrefs('c1', 'm1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.prefs).toEqual({
        notify_all_messages: false,
        notify_gm_messages: true,
        notify_turn: false
      })
    })
  })

  it('sets error on fetch failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const mockEqChannel = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqChannel })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqUser }) } as any)

    const { result } = renderHook(() => useChannelNotificationPrefs('c1', 'm1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error?.message).toBe('boom')
    })
  })

  it('updates preferences', async () => {
    const mockSingle = vi.fn().mockResolvedValue({
      data: { notify_all_messages: true, notify_gm_messages: true, notify_turn: true },
      error: null
    })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) } as any)

    const { result } = renderHook(() => useChannelNotificationPrefs('c1', 'm1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    vi.mocked(supabase.from).mockReturnValue({ update: mockUpdate } as any)

    await act(async () => {
      await result.current.updatePrefs({ notify_all_messages: false })
    })

    expect(mockUpdate).toHaveBeenCalledWith({ notify_all_messages: false })
    expect(result.current.prefs.notify_all_messages).toBe(false)
  })

  it('throws when not a channel member', async () => {
    const { result } = renderHook(() => useChannelNotificationPrefs('c1', undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await expect(result.current.updatePrefs({ notify_turn: false })).rejects.toThrow('Not a channel member')
  })
})
