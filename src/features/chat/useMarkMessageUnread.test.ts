import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMarkMessageUnread } from './useMarkMessageUnread'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}))

describe('useMarkMessageUnread', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls mark_message_unread with the message id', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)

    const { result } = renderHook(() => useMarkMessageUnread())
    await result.current.markUnreadMessage('m1')

    expect(supabase.rpc).toHaveBeenCalledWith('mark_message_unread', { p_message_id: 'm1' })
  })

  it('resolves null on success and the error on failure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    const { result } = renderHook(() => useMarkMessageUnread())
    await expect(result.current.markUnreadMessage('m1')).resolves.toBeNull()

    const failure = { message: 'Message not found.', code: 'P0001' }
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: failure } as never)
    await expect(result.current.markUnreadMessage('m2')).resolves.toBe(failure)
  })

  it('turns a transport failure into an error instead of throwing (#806)', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useMarkMessageUnread())
    const error = await result.current.markUnreadMessage('m1')
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('network down')
  })

  it('keeps one stable callback so memoized message rows never re-render (#408)', () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    const { result, rerender } = renderHook(() => useMarkMessageUnread())
    const before = result.current.markUnreadMessage
    rerender()
    expect(result.current.markUnreadMessage).toBe(before)
  })
})
