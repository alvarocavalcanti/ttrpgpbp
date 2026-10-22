import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePublicChannelAnonDetail } from './usePublicChannelAnonDetail'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}))

const anonRow = {
  name: 'Shared Delves',
  game_system: 'shadowdark',
  description: 'A weekly game.',
  constraints: 'Be kind.',
  application_prompt: 'Why join?',
  gm_display_name: 'Aria',
}

describe('usePublicChannelAnonDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('fetches the anon game projection', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [anonRow], error: null } as never)

    const { result } = renderHook(() => usePublicChannelAnonDetail('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(supabase.rpc).toHaveBeenCalledWith('get_public_channel_anon', { p_channel_id: '123' })
    expect(result.current.detail).toMatchObject({ name: 'Shared Delves', application_prompt: 'Why join?' })
    expect(result.current.notFound).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('reports notFound when the game is not listed', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as never)

    const { result } = renderHook(() => usePublicChannelAnonDetail('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notFound).toBe(true)
    expect(result.current.detail).toBeNull()
  })

  it('surfaces a fetch error instead of notFound', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('boom') } as never)

    const { result } = renderHook(() => usePublicChannelAnonDetail('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.notFound).toBe(false)
  })

  it('treats a malformed row as notFound', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [{ description: 'no name' }], error: null } as never)

    const { result } = renderHook(() => usePublicChannelAnonDetail('123'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.detail).toBeNull()
    expect(result.current.notFound).toBe(true)
  })

  it('treats a malformed channel id as notFound, not a fetch error', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: null,
      error: { code: '22P02', message: 'invalid input syntax for type uuid: "abc"' },
    } as never)

    const { result } = renderHook(() => usePublicChannelAnonDetail('abc'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.notFound).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('ignores a stale response after the id changes', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    let resolveSecond: (value: unknown) => void = () => {}
    vi.mocked(supabase.rpc)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }) as never)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }) as never)

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePublicChannelAnonDetail(id),
      { initialProps: { id: 'first' } },
    )
    rerender({ id: 'second' })

    resolveSecond({ data: [{ ...anonRow, name: 'Second Game' }], error: null })
    await waitFor(() => expect(result.current.detail?.name).toBe('Second Game'))

    // The first game's response settles last; it must not overwrite the newer.
    resolveFirst({ data: [{ ...anonRow, name: 'First Game' }], error: null })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(result.current.detail?.name).toBe('Second Game')
  })

  it('skips the query without a channel id', () => {
    const { result } = renderHook(() => usePublicChannelAnonDetail(null))
    expect(result.current.loading).toBe(false)
    expect(result.current.detail).toBeNull()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('skips the query when disabled', () => {
    const { result } = renderHook(() => usePublicChannelAnonDetail('123', { enabled: false }))
    expect(result.current.loading).toBe(false)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
