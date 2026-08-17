import { renderHook, waitFor } from '@testing-library/react'
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
})
