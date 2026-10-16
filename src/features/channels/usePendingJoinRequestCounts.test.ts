import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePendingJoinRequestCounts } from './usePendingJoinRequestCounts'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

// The hook awaits select().eq().
function queryChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = () => chain
  chain.eq = () => chain
  // eslint-disable-next-line unicorn/no-thenable
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

describe('usePendingJoinRequestCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('counts pending applications per channel', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      queryChain({
        data: [
          { channel_id: 'c1' },
          { channel_id: 'c2' },
          { channel_id: 'c1' },
        ],
        error: null,
      }) as any,
    )

    const { result } = renderHook(() => usePendingJoinRequestCounts())

    await waitFor(() => expect(result.current).toEqual({ c1: 2, c2: 1 }))
    expect(supabase.from).toHaveBeenCalledWith('channel_join_requests')
  })

  it('skips rows without a channel id', async () => {
    vi.mocked(supabase.from).mockReturnValue(
      queryChain({ data: [{ channel_id: 'c1' }, { nope: true }], error: null }) as any,
    )

    const { result } = renderHook(() => usePendingJoinRequestCounts())

    await waitFor(() => expect(result.current).toEqual({ c1: 1 }))
  })

  it('degrades to no badges on error rather than throwing', async () => {
    vi.mocked(supabase.from).mockReturnValue(queryChain({ data: null, error: new Error('boom') }) as any)

    const { result } = renderHook(() => usePendingJoinRequestCounts())

    await waitFor(() => expect(console.error).toHaveBeenCalled())
    expect(result.current).toEqual({})
  })
})
