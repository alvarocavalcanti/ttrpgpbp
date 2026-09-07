import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useRecentRolls } from './useRecentRolls'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn()
  }
}))

describe('useRecentRolls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not fetch when disabled', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    const { rerender } = renderHook(({ channelId, enabled }) => useRecentRolls(channelId, enabled), {
      initialProps: { channelId: 'c1', enabled: false }
    })
    expect(supabase.rpc).not.toHaveBeenCalled()

    rerender({ channelId: 'c1', enabled: true })
    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('get_channel_roll_history', { p_channel_id: 'c1' })
    })
  })

  it('does not fetch without a channel id', () => {
    renderHook(() => useRecentRolls(undefined, true))
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('sorts desc, dedupes notations, and caps at 3', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { id: '1', notation: '2d6+1', created_at: '2026-01-01T00:00:03Z' },
        { id: '2', notation: '1d20', created_at: '2026-01-01T00:00:02Z' },
        { id: '3', notation: '2d6+1', created_at: '2026-01-01T00:00:01Z' },
        { id: '4', notation: '1d8', created_at: '2026-01-01T00:00:00Z' },
        { id: '5', notation: '1d4', created_at: '2026-01-01T00:00:00Z' }
      ],
      error: null
    } as any)

    const { result } = renderHook(() => useRecentRolls('c1', true))
    await waitFor(() => {
      expect(result.current.recent).toEqual(['2d6+1', '1d20', '1d8'])
    })
  })

  it('drops malformed rows from the RPC payload', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [
        { notation: 42, created_at: '2026-01-01T00:00:05Z' },
        { notation: '1d20' },
        { created_at: '2026-01-01T00:00:04Z' },
        { notation: '2d6', created_at: '2026-01-01T00:00:03Z' },
        'garbage',
        { notation: '1d4', created_at: '2026-01-01T00:00:02Z', id: '9' }
      ],
      error: null
    } as any)

    const { result } = renderHook(() => useRecentRolls('c1', true))
    await waitFor(() => {
      expect(result.current.recent).toEqual(['2d6', '1d4'])
    })
  })

  it('treats a non-array payload as an empty list', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { not: 'an array' }, error: null } as any)

    const { result } = renderHook(() => useRecentRolls('c1', true))
    await act(async () => {})
    expect(result.current.recent).toEqual([])
  })

  it('keeps a null payload a no-op', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as any)

    const { result } = renderHook(() => useRecentRolls('c1', true))
    await act(async () => {})
    expect(result.current.recent).toEqual([])
  })

  it('merges server history local-first so a stale snapshot never evicts the roll just made', async () => {
    let resolveHistory: (value: unknown) => void = () => {}
    vi.mocked(supabase.rpc).mockImplementation(
      (() => new Promise(resolve => { resolveHistory = resolve })) as any
    )

    const { result } = renderHook(() => useRecentRolls('c1', true))
    act(() => { result.current.recordRoll('1d20') })

    await act(async () => {
      resolveHistory({
        data: [
          { notation: '2d6+1', created_at: '2026-01-01T00:00:03Z' },
          { notation: '1d8', created_at: '2026-01-01T00:00:02Z' },
          { notation: '1d4', created_at: '2026-01-01T00:00:01Z' }
        ]
      })
    })

    expect(result.current.recent).toEqual(['1d20', '2d6+1', '1d8'])
  })

  it('recordRoll dedupes to the front and caps at 3', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)

    const { result } = renderHook(() => useRecentRolls('c1', true))
    await act(async () => {})
    act(() => { result.current.recordRoll('1d20') })
    act(() => { result.current.recordRoll('1d8') })
    act(() => { result.current.recordRoll('2d6') })
    act(() => { result.current.recordRoll('1d20') })
    act(() => { result.current.recordRoll('1d4') })

    // A repeat roll moves back to the front, so 2d6 survives the cap.
    expect(result.current.recent).toEqual(['1d4', '1d20', '2d6'])
  })

  it('ignores the response when disabled mid-flight', async () => {
    let resolveHistory: (value: unknown) => void = () => {}
    vi.mocked(supabase.rpc).mockImplementation(
      (() => new Promise(resolve => { resolveHistory = resolve })) as any
    )

    const { result, rerender } = renderHook(({ channelId, enabled }) => useRecentRolls(channelId, enabled), {
      initialProps: { channelId: 'c1', enabled: true }
    })
    rerender({ channelId: 'c1', enabled: false })

    await act(async () => {
      resolveHistory({
        data: [{ notation: '2d6', created_at: '2026-01-01T00:00:03Z' }]
      })
    })

    expect(result.current.recent).toEqual([])
  })
})
