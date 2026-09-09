import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMessageRecipients } from './useMessageRecipients'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

describe('useMessageRecipients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls the admin recipients RPC and validates rows', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: 'r-1', display_name: 'GM Alice', avatar_url: null },
        { id: 'r-2', display_name: 'Bob', avatar_url: 'http://x/y.png', extra: 'ignored' }
      ],
      error: null
    } as any)

    const { result } = renderHook(() => useMessageRecipients(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledWith('admin_list_message_recipients')
    expect(result.current.recipients).toEqual([
      { id: 'r-1', display_name: 'GM Alice', avatar_url: null },
      { id: 'r-2', display_name: 'Bob', avatar_url: 'http://x/y.png' }
    ])
    expect(result.current.error).toBeNull()
  })

  it('skips rows without a display name', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: 'r-1', display_name: 'Alice' }, { id: 'r-2', display_name: null }],
      error: null
    } as any)

    const { result } = renderHook(() => useMessageRecipients(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.recipients).toEqual([{ id: 'r-1', display_name: 'Alice', avatar_url: null }])
  })

  it('surfaces an RPC error and retries on demand', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: null, error: { message: 'denied' } } as any)
      .mockResolvedValueOnce({ data: [{ id: 'r-1', display_name: 'Alice' }], error: null } as any)

    const { result } = renderHook(() => useMessageRecipients(true))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.recipients).toEqual([])

    await act(async () => { await result.current.refetch() })

    expect(result.current.error).toBeNull()
    expect(result.current.recipients).toEqual([{ id: 'r-1', display_name: 'Alice', avatar_url: null }])
  })

  it('handles a rejecting RPC without an unhandled rejection', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useMessageRecipients(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toEqual(new Error('network down'))
    expect(result.current.recipients).toEqual([])
  })

  it('does not fetch when disabled', async () => {
    renderHook(() => useMessageRecipients(false))

    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
