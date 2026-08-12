import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSearch } from './useSearch'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('useSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initializes with empty state', () => {
    const { result } = renderHook(() => useSearch('channel-1'))
    
    expect(result.current.searchTerm).toBe('')
    expect(result.current.results).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('does not search if term is empty', async () => {
    const { result } = renderHook(() => useSearch('channel-1'))
    
    act(() => {
      result.current.setSearchTerm('   ')
    })
    
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(result.current.results).toEqual([])
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('performs search when term is provided and debounced', async () => {
    const mockData = [{ id: 'msg-1', content: 'hello world', sender: { display_name: 'Hero' } }]
    const mockAbortSignal = vi.fn().mockResolvedValue({ data: mockData, error: null })
    const mockLimit = vi.fn().mockReturnValue({ abortSignal: mockAbortSignal })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockTextSearch = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq = vi.fn().mockReturnValue({ textSearch: mockTextSearch })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const { result } = renderHook(() => useSearch('channel-1'))
    
    act(() => {
      result.current.setSearchTerm('hello')
    })

    // Before timer, no search
    expect(supabase.from).not.toHaveBeenCalled()
    
    act(() => {
      vi.advanceTimersByTime(300)
    })
    
    vi.useRealTimers()

    // Wait for the async effect
    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockTextSearch).toHaveBeenCalledWith('search_vector', 'hello', { type: 'websearch', config: 'english' })
    expect(result.current.results).toEqual(mockData)
  })

  it('handles search errors', async () => {
    const mockAbortSignal = vi.fn().mockResolvedValue({ data: null, error: new Error('DB Error') })
    const mockLimit = vi.fn().mockReturnValue({ abortSignal: mockAbortSignal })
    const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit })
    const mockTextSearch = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq = vi.fn().mockReturnValue({ textSearch: mockTextSearch })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() => useSearch('channel-1'))
    
    act(() => {
      result.current.setSearchTerm('hello')
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })
    
    vi.useRealTimers()

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.error).toBeTruthy()
    })
  })
})
