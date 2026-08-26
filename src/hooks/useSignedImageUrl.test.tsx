import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useSignedImageUrl, isBucketImagePath } from './useSignedImageUrl'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({
  supabase: {
    storage: { from: vi.fn() },
  },
}))

const CHANNEL_ID = '00000000-0000-0000-0000-000000000001'

describe('useSignedImageUrl', () => {
  const mockCreateSignedUrl = vi.fn()
  let resolveCreateSignedUrl!: (v: { data: { signedUrl: string | null } | null; error: Error | null }) => void

  const deferred = () => {
    resolveCreateSignedUrl = () => {}
    mockCreateSignedUrl.mockImplementation(() => new Promise((r) => { resolveCreateSignedUrl = r }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x.jpg' }, error: null })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrl: mockCreateSignedUrl } as any)
  })

  it('passes external URLs through unchanged', () => {
    const { result } = renderHook(() => useSignedImageUrl('https://game-icons.net/x.svg'))
    expect(result.current).toEqual({ src: 'https://game-icons.net/x.svg', loading: false })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('passes relative in-app URLs through unchanged (not a bucket path)', () => {
    const { result } = renderHook(() => useSignedImageUrl('/assets/map.png'))
    expect(result.current).toEqual({ src: '/assets/map.png', loading: false })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('passes through a null value', () => {
    const { result } = renderHook(() => useSignedImageUrl(null))
    expect(result.current).toEqual({ src: null, loading: false })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('signs a private-bucket object path and shows loading while pending', async () => {
    deferred()
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/avatar/u.jpg`))
    expect(result.current).toEqual({ src: null, loading: true })
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/x.jpg' }, error: null }))
    expect(result.current).toEqual({ src: 'https://signed/x.jpg', loading: false })
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`${CHANNEL_ID}/avatar/u.jpg`, expect.any(Number))
  })

  it('returns null src when signing fails', async () => {
    deferred()
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/u.jpg`))
    await act(async () => resolveCreateSignedUrl({ data: null, error: new Error('denied') }))
    expect(result.current).toEqual({ src: null, loading: false })
  })

  it('returns null src when signedUrl is empty', async () => {
    deferred()
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/u.jpg`))
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: null }, error: null }))
    expect(result.current).toEqual({ src: null, loading: false })
  })

  it('ignores a late signing result after unmount', async () => {
    deferred()
    const { result, unmount } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/u.jpg`))
    unmount()
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/x.jpg' }, error: null }))
    // No state update on an unmounted hook; still shows the pending state.
    expect(result.current).toEqual({ src: null, loading: true })
  })

  it('does not let a stale signing result overwrite a newer source', async () => {
    deferred()
    const { result, rerender } = renderHook(({ value }) => useSignedImageUrl(value), {
      initialProps: { value: `${CHANNEL_ID}/message/u1.jpg` },
    })
    // The first request resolves AFTER the value changes to a new bucket path.
    const resolveOld = resolveCreateSignedUrl
    rerender({ value: `${CHANNEL_ID}/message/u2.jpg` })
    const resolveNew = resolveCreateSignedUrl
    expect(resolveOld).not.toBe(resolveNew)

    await act(async () => resolveOld({ data: { signedUrl: 'https://signed/OLD.jpg' }, error: null }))
    // Old request cancelled; src stays pending for the new path.
    expect(result.current).toEqual({ src: null, loading: true })

    await act(async () => resolveNew({ data: { signedUrl: 'https://signed/NEW.jpg' }, error: null }))
    expect(result.current).toEqual({ src: 'https://signed/NEW.jpg', loading: false })
  })

  it('detects UUID bucket paths vs other values', () => {
    expect(isBucketImagePath(`${CHANNEL_ID}/avatar/u.jpg`)).toBe(true)
    expect(isBucketImagePath('https://x.example/a.png')).toBe(false)
    expect(isBucketImagePath('/assets/map.png')).toBe(false)
    expect(isBucketImagePath('assets/map.png')).toBe(false)
    expect(isBucketImagePath(null)).toBe(false)
    expect(isBucketImagePath(undefined)).toBe(false)
  })
})