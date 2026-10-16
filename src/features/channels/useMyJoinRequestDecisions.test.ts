import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useMyJoinRequestDecisions } from './useMyJoinRequestDecisions'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: vi.fn() },
}))

vi.mock('../auth/useAuth', () => ({
  useAuth: vi.fn(),
}))

describe('useMyJoinRequestDecisions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u1' } } as never)
  })

  const decision = {
    id: 'r1',
    channel_id: 'c1',
    channel_name: 'Sunless Citadel',
    status: 'approved',
    decided_at: '2026-10-15T10:00:00Z',
    is_member: true,
  }

  it('loads the caller\u2019s decided applications', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [decision], error: null } as never)

    const { result } = renderHook(() => useMyJoinRequestDecisions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('get_my_join_request_decisions')
    expect(result.current.decisions).toEqual([decision])
  })

  it('drops a malformed row and keeps the rest', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [decision, { id: 'broken' }],
      error: null,
    } as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useMyJoinRequestDecisions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.decisions).toEqual([decision])
  })

  it('renders nothing usable when the fetch fails, without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('down') } as never)

    const { result } = renderHook(() => useMyJoinRequestDecisions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.decisions).toEqual([])
    expect(result.current.error).toBeInstanceOf(Error)
  })

  it('acknowledges a decision and drops it from the notice', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [decision], error: null } as never)

    const { result } = renderHook(() => useMyJoinRequestDecisions())
    await waitFor(() => expect(result.current.decisions).toHaveLength(1))

    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await act(async () => {
      await result.current.dismiss('r1')
    })

    expect(supabase.rpc).toHaveBeenCalledWith('acknowledge_join_request_decision', { p_request_id: 'r1' })
    expect(result.current.decisions).toEqual([])
  })

  it('keeps the decision when the acknowledgement fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [decision], error: null } as never)

    const { result } = renderHook(() => useMyJoinRequestDecisions())
    await waitFor(() => expect(result.current.decisions).toHaveLength(1))

    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('nope') } as never)
    await expect(result.current.dismiss('r1')).rejects.toThrow('nope')

    expect(result.current.decisions).toEqual([decision])
  })

  it('re-fetches for the signed-in user and drops the previous account\u2019s rows', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [decision], error: null } as never)

    const { result, rerender } = renderHook(() => useMyJoinRequestDecisions())
    await waitFor(() => expect(result.current.decisions).toHaveLength(1))

    // A different account on the same device must never see the first one's
    // decisions, not even for the moment the new fetch is in flight.
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'u2' } } as never)
    rerender()

    expect(result.current.decisions).toEqual([])
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('fetches nothing while signed out', async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as never)

    const { result } = renderHook(() => useMyJoinRequestDecisions())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(result.current.decisions).toEqual([])
  })
})
