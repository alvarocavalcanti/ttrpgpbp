import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    // The signed-URL cache is module-scoped, so start each test on a clock just
    // past the 1h TTL to expire anything a previous test cached.
    vi.useFakeTimers()
    vi.advanceTimersByTime(3600 * 1000 + 1)
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('serves a remount of the same path from cache with exactly one createSignedUrl call', async () => {
    const path = `${CHANNEL_ID}/cache/u.jpg`
    const first = renderHook(() => useSignedImageUrl(path))
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/x.jpg' }, error: null }))
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1)
    first.unmount()

    // Remount: no RPC, no loading flicker — the cached URL is already there on
    // the very first render.
    const second = renderHook(() => useSignedImageUrl(path))
    expect(second.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false })
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1)
    second.unmount()
  })

  it('re-signs after the cached URL expires past the TTL', async () => {
    const path = `${CHANNEL_ID}/cache/expired.jpg`
    const first = renderHook(() => useSignedImageUrl(path))
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/x.jpg' }, error: null }))
    first.unmount()

    vi.advanceTimersByTime(3600 * 1000 + 1)
    const second = renderHook(() => useSignedImageUrl(path))
    expect(second.result.current).toEqual({ src: null, loading: true })
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/x.jpg' }, error: null }))
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2)
  })

  it('caches different paths independently', async () => {
    const a = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/cache/a.jpg`))
    await act(async () => {})
    const b = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/cache/b.jpg`))
    expect(b.result.current).toEqual({ src: null, loading: true })
    await act(async () => {})

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2)
    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(1, `${CHANNEL_ID}/cache/a.jpg`, expect.any(Number))
    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(2, `${CHANNEL_ID}/cache/b.jpg`, expect.any(Number))
    // Each path got its own cached URL.
    expect(a.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false })
    expect(b.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false })
    a.unmount()
    b.unmount()
  })

  it('evicts the oldest entry once the cache exceeds 100 entries', async () => {
    const evictedPath = `${CHANNEL_ID}/cache/evicted.jpg`
    const first = renderHook(() => useSignedImageUrl(evictedPath))
    await act(async () => {})
    first.unmount()

    const { rerender } = renderHook(({ value }) => useSignedImageUrl(value), {
      initialProps: { value: `${CHANNEL_ID}/cache/bulk-0.jpg` },
    })
    for (let i = 0; i < 100; i++) {
      await act(async () => {
        rerender({ value: `${CHANNEL_ID}/cache/bulk-${i}.jpg` })
      })
    }
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(101)

    // The first path was pushed out of the cache, so it signs again.
    const again = renderHook(() => useSignedImageUrl(evictedPath))
    expect(again.result.current).toEqual({ src: null, loading: true })
    await act(async () => {})
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(102)
    expect(mockCreateSignedUrl).toHaveBeenLastCalledWith(evictedPath, expect.any(Number))
    again.unmount()
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