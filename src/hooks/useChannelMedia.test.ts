import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useChannelMedia } from './useChannelMedia'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: vi.fn() },
  },
}))

const mockFrom = vi.mocked(supabase.storage.from)

describe('useChannelMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue({
      list: vi.fn().mockResolvedValue({
        data: [
          { name: 'b.jpg' },
          { name: 'a.jpg' },
        ],
        error: null,
      }),
    } as any)
  })

  it('lists the channel message folder newest first and maps to full paths', async () => {
    const { result } = renderHook(() => useChannelMedia('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(mockFrom).toHaveBeenCalledWith('images')
    expect(mockFrom.mock.results[0].value.list).toHaveBeenCalledWith('c1/message', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    })
    expect(result.current.items).toEqual([
      { path: 'c1/message/b.jpg', name: 'b.jpg' },
      { path: 'c1/message/a.jpg', name: 'a.jpg' },
    ])
    expect(result.current.error).toBeNull()
  })

  it('surfaces list errors without items', async () => {
    mockFrom.mockReturnValue({
      list: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
    } as any)

    const { result } = renderHook(() => useChannelMedia('c1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
    expect(result.current.error).toBe('permission denied')
  })

  it('skips the list call without a channel id', async () => {
    const { result } = renderHook(() => useChannelMedia(undefined))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.items).toEqual([])
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('refetches on demand', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ name: 'a.jpg' }], error: null })
      .mockResolvedValueOnce({ data: [{ name: 'b.jpg' }], error: null })
    mockFrom.mockReturnValue({ list } as any)

    const { result } = renderHook(() => useChannelMedia('c1'))
    await waitFor(() => expect(result.current.items).toEqual([{ path: 'c1/message/a.jpg', name: 'a.jpg' }]))

    result.current.refetch()
    await waitFor(() => expect(result.current.items).toEqual([{ path: 'c1/message/b.jpg', name: 'b.jpg' }]))
    expect(list).toHaveBeenCalledTimes(2)
  })
})