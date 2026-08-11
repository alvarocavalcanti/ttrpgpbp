import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSafetyTools } from './useSafetyTools'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

describe('useSafetyTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses defaults when no channel id', async () => {
    const { result } = renderHook(() => useSafetyTools(undefined))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.safetyTools).toBeNull()
    })
  })

  it('fetches existing safety tools row', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: { channel_id: 'c1', lines: 'no gore', veils: 'romance', updated_at: '2026-01-01' },
      error: null
    })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) } as any)

    const { result } = renderHook(() => useSafetyTools('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.safetyTools?.lines).toBe('no gore')
      expect(result.current.safetyTools?.veils).toBe('romance')
    })
  })

  it('leaves safetyTools null when no row exists', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) } as any)

    const { result } = renderHook(() => useSafetyTools('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.safetyTools).toBeNull()
    })
  })

  it('logs and returns false on fetch error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    vi.mocked(supabase.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) } as any)

    const { result } = renderHook(() => useSafetyTools('c1'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.safetyTools).toBeNull()
    })
    expect(console.error).toHaveBeenCalled()
  })

  it('saves safety tools via upsert and updates state', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect, upsert: mockUpsert } as any)

    const { result } = renderHook(() => useSafetyTools('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success = false
    await act(async () => {
      success = await result.current.saveSafetyTools('no gore', 'romance')
    })

    expect(success).toBe(true)
    expect(mockUpsert).toHaveBeenCalledWith({
      channel_id: 'c1',
      lines: 'no gore',
      veils: 'romance',
      updated_at: expect.any(String)
    })
    expect(result.current.safetyTools?.lines).toBe('no gore')
    expect(result.current.safetyTools?.veils).toBe('romance')
  })

  it('returns false and logs when save fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const mockUpsert = vi.fn().mockResolvedValue({ error: { message: 'RLS block' } })
    const mockSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }) })
    vi.mocked(supabase.from).mockReturnValue({ select: mockSelect, upsert: mockUpsert } as any)

    const { result } = renderHook(() => useSafetyTools('c1'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success = true
    await act(async () => {
      success = await result.current.saveSafetyTools('x', 'y')
    })

    expect(success).toBe(false)
    expect(console.error).toHaveBeenCalled()
  })

  it('refuses to save without a channel id', async () => {
    const mockUpsert = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as any)

    const { result } = renderHook(() => useSafetyTools(undefined))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let success = true
    await act(async () => {
      success = await result.current.saveSafetyTools('x', 'y')
    })

    expect(success).toBe(false)
    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
