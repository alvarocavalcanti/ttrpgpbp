import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAppSetting } from './useAppSetting'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

describe('useAppSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the stored value', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { value: 15 }, error: null })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect } as any)

    const { result } = renderHook(() => useAppSetting<number>('max_channels_per_user', 10))

    expect(result.current.value).toBe(10)
    await waitFor(() => expect(result.current.value).toBe(15))
    expect(result.current.loading).toBe(false)
  })

  it('falls back when the key is absent', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
    } as any)

    const { result } = renderHook(() => useAppSetting<number>('max_channels_per_user', 10))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.value).toBe(10)
  })

  it('sets error and keeps fallback on failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(supabase.from).mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('down') }) }) }),
    } as any)

    const { result } = renderHook(() => useAppSetting<number>('max_channels_per_user', 10))

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error))
    expect(result.current.value).toBe(10)
  })
})
