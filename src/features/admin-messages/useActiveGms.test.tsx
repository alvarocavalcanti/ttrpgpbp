import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useActiveGms } from './useActiveGms'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

describe('useActiveGms', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads and validates the GM list', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: 'gm-1', display_name: 'GM Alice' },
        { id: 'gm-2', display_name: 'GM Bob', extra: 'ignored' }
      ],
      error: null
    } as any)

    const { result } = renderHook(() => useActiveGms(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.gms).toEqual([
      { id: 'gm-1', display_name: 'GM Alice' },
      { id: 'gm-2', display_name: 'GM Bob' }
    ])
    expect(result.current.error).toBeNull()
  })

  it('skips rows without a display name', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ id: 'gm-1', display_name: 'GM Alice' }, { id: 'gm-2', display_name: null }],
      error: null
    } as any)

    const { result } = renderHook(() => useActiveGms(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.gms).toEqual([{ id: 'gm-1', display_name: 'GM Alice' }])
  })

  it('surfaces an RPC error and retries on demand', async () => {
    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: null, error: { message: 'denied' } } as any)
      .mockResolvedValueOnce({ data: [{ id: 'gm-1', display_name: 'GM Alice' }], error: null } as any)

    const { result } = renderHook(() => useActiveGms(true))

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.gms).toEqual([])

    await act(async () => { await result.current.refetch() })

    expect(result.current.error).toBeNull()
    expect(result.current.gms).toEqual([{ id: 'gm-1', display_name: 'GM Alice' }])
  })

  it('handles a rejecting RPC without an unhandled rejection', async () => {
    vi.mocked(supabase.rpc).mockRejectedValue(new Error('network down'))

    const { result } = renderHook(() => useActiveGms(true))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toEqual(new Error('network down'))
    expect(result.current.gms).toEqual([])
  })

  it('does not fetch when disabled', async () => {
    renderHook(() => useActiveGms(false))

    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
