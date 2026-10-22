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
