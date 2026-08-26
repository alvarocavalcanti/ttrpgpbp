import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSignedImageUrl, isBucketImagePath } from './useSignedImageUrl'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: vi.fn() },
  },
}))

describe('useSignedImageUrl', () => {
  const mockCreateSignedUrl = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/images/c1/avatar/u.jpg?token=abc' }, error: null })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrl: mockCreateSignedUrl } as any)
  })

  it('passes external URLs through unchanged', () => {
    const { result } = renderHook(() => useSignedImageUrl('https://game-icons.net/x.svg'))
    expect(result.current).toBe('https://game-icons.net/x.svg')
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('passes through a null value', () => {
    const { result } = renderHook(() => useSignedImageUrl(null))
    expect(result.current).toBeNull()
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('signs a private-bucket object path', async () => {
    const { result } = renderHook(() => useSignedImageUrl('c1/avatar/u.jpg'))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe('https://signed/images/c1/avatar/u.jpg?token=abc'))
    expect(mockCreateSignedUrl).toHaveBeenCalledWith('c1/avatar/u.jpg', expect.any(Number))
  })

  it('returns null when signing fails', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: new Error('denied') })
    const { result } = renderHook(() => useSignedImageUrl('c1/message/u.jpg'))
    await waitFor(() => expect(result.current).toBeNull())
  })

  it('ignores a late signing result after unmount', async () => {
    let resolve!: (v: any) => void
    mockCreateSignedUrl.mockReturnValue(new Promise((r) => { resolve = r }))
    const { result, unmount } = renderHook(() => useSignedImageUrl('c1/message/u.jpg'))
    unmount()
    resolve({ data: { signedUrl: 'https://signed/x.jpg' }, error: null })
    // No state update on an unmounted hook; src stays null (pending initial).
    expect(result.current).toBeNull()
  })

  it('detects bucket paths vs external URLs', () => {
    expect(isBucketImagePath('c1/avatar/u.jpg')).toBe(true)
    expect(isBucketImagePath('https://x.example/a.png')).toBe(false)
    expect(isBucketImagePath(null)).toBe(false)
    expect(isBucketImagePath(undefined)).toBe(false)
  })
})