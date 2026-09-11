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
      offset: 0,
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

  it('pages through every result set until a short page', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ name: `p1-${i}.jpg` }))
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: [{ name: 'last.jpg' }], error: null })
    mockFrom.mockReturnValue({ list } as any)

    const { result } = renderHook(() => useChannelMedia('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(list).toHaveBeenCalledTimes(2)
    expect(list).toHaveBeenNthCalledWith(1, 'c1/message', expect.objectContaining({ offset: 0 }))
    expect(list).toHaveBeenNthCalledWith(2, 'c1/message', expect.objectContaining({ offset: 100 }))
    expect(result.current.items).toHaveLength(101)
    expect(result.current.items[100]).toEqual({ path: 'c1/message/last.jpg', name: 'last.jpg' })
  })

  it('stops paging when a page errors', async () => {
    const firstPage = Array.from({ length: 100 }, (_, i) => ({ name: `p1-${i}.jpg` }))
    const list = vi
      .fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    mockFrom.mockReturnValue({ list } as any)

    const { result } = renderHook(() => useChannelMedia('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(list).toHaveBeenCalledTimes(2)
    expect(result.current.items).toEqual([])
    expect(result.current.error).toBe('permission denied')
  })
})