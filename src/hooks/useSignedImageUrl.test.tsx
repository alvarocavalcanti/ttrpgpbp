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
  const mockInfo = vi.fn()
  let resolveCreateSignedUrl!: (v: { data: { signedUrl: string | null } | null; error: Error | null }) => void

  const deferred = () => {
    resolveCreateSignedUrl = () => {}
    mockCreateSignedUrl.mockImplementation(() => new Promise((r) => { resolveCreateSignedUrl = r }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed/x.jpg' }, error: null })
    // Default: no stored dimensions (external/legacy images).
    mockInfo.mockResolvedValue({ data: { metadata: {} }, error: null })
    vi.mocked(supabase.storage.from).mockReturnValue({ createSignedUrl: mockCreateSignedUrl, info: mockInfo } as any)
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
    expect(result.current).toEqual({ src: 'https://game-icons.net/x.svg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('passes relative in-app URLs through unchanged (not a bucket path)', () => {
    const { result } = renderHook(() => useSignedImageUrl('/assets/map.png'))
    expect(result.current).toEqual({ src: '/assets/map.png', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('passes through a null value', () => {
    const { result } = renderHook(() => useSignedImageUrl(null))
    expect(result.current).toEqual({ src: null, loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('signs a private-bucket object path and shows loading while pending', async () => {
    deferred()
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/avatar/u.jpg`))
    expect(result.current).toEqual({ src: null, loading: true, error: false, width: null, height: null, retry: expect.any(Function) })
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/x.jpg' }, error: null }))
    expect(result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(`${CHANNEL_ID}/avatar/u.jpg`, expect.any(Number))
  })

  it('returns the stored dimensions when the caller reserves the box', async () => {
    mockInfo.mockResolvedValue({ data: { metadata: { width: 512, height: 288 } }, error: null })
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/dims.jpg`, true))
    await act(async () => {})

    expect(mockInfo).toHaveBeenCalledWith(`${CHANNEL_ID}/message/dims.jpg`)
    expect(result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: 512, height: 288, retry: expect.any(Function) })
  })

  it('falls back to null dimensions when the metadata read fails', async () => {
    mockInfo.mockRejectedValue(new Error('info unavailable'))
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/unknown-size.jpg`, true))
    await act(async () => {})

    // The image still resolves; only the reserved box is lost.
    expect(result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
  })

  it('resolves the signed URL without waiting on a pending metadata read', async () => {
    // Critical: a slow/hanging info() must not keep the image's src unresolved.
    mockInfo.mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/hanging.jpg`, true))
    await act(async () => {})

    // src is ready; the box is simply not reserved.
    expect(result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })

    // Bounded lookup: the timeout gives up without changing the outcome.
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
  })

  it('ignores out-of-range or non-integer stored dimensions', async () => {
    mockInfo.mockResolvedValue({ data: { metadata: { width: 999999, height: -5 } }, error: null })
    const huge = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/huge.jpg`, true))
    await act(async () => {})
    expect(huge.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })

    mockInfo.mockResolvedValue({ data: { metadata: { width: 512.5, height: 288 } }, error: null })
    const fractional = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/fractional.jpg`, true))
    await act(async () => {})
    expect(fractional.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
  })

  it('skips the metadata request for callers that do not reserve the box', async () => {
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/avatar/plain.jpg`))
    await act(async () => {})

    expect(result.current.src).toBe('https://signed/x.jpg')
    expect(result.current.width).toBeNull()
    expect(result.current.height).toBeNull()
    expect(mockInfo).not.toHaveBeenCalled()
  })

  it('fetches dimensions for a reserving caller even when the URL is already cached', async () => {
    const path = `${CHANNEL_ID}/message/late-dims.jpg`
    // A non-reserving caller (e.g. avatar/thumbnail) signs and caches the URL,
    // but never reads metadata.
    const first = renderHook(() => useSignedImageUrl(path))
    await act(async () => {})
    expect(mockInfo).not.toHaveBeenCalled()
    first.unmount()

    // A reserving caller (message image) then needs the dimensions.
    mockInfo.mockResolvedValue({ data: { metadata: { width: 400, height: 300 } }, error: null })
    const second = renderHook(() => useSignedImageUrl(path, true))
    // The URL is cached but the dimensions are not: the first render must
    // already be pending, so the caller shows its placeholder rather than the
    // image without a reserved box.
    expect(second.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
    await act(async () => {})

    expect(second.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: 400, height: 300, retry: expect.any(Function) })
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1) // URL reused from cache
    expect(mockInfo).toHaveBeenCalledTimes(1)
    second.unmount()
  })

  it('returns null src when signing fails', async () => {
    deferred()
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/u.jpg`))
    await act(async () => resolveCreateSignedUrl({ data: null, error: new Error('denied') }))
    expect(result.current).toEqual({ src: null, loading: false, error: true, width: null, height: null, retry: expect.any(Function) })
  })

  it('returns null src when signedUrl is empty', async () => {
    deferred()
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/u.jpg`))
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: null }, error: null }))
    expect(result.current).toEqual({ src: null, loading: false, error: true, width: null, height: null, retry: expect.any(Function) })
  })

  it('re-signs on retry after a failure and clears the error on success', async () => {
    deferred()
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/retry.jpg`))
    await act(async () => resolveCreateSignedUrl({ data: null, error: new Error('denied') }))
    expect(result.current.error).toBe(true)

    // Retry re-invokes signing for the same path: back to pending first.
    await act(async () => { result.current.retry() })
    expect(result.current).toEqual({ src: null, loading: true, error: false, width: null, height: null, retry: expect.any(Function) })
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2)

    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/retry.jpg' }, error: null }))
    expect(result.current).toEqual({ src: 'https://signed/retry.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
  })

  it('surfaces a thrown signing failure as an error instead of loading forever', async () => {
    mockCreateSignedUrl.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/throw.jpg`))
    await act(async () => {})

    expect(result.current).toEqual({ src: null, loading: false, error: true, width: null, height: null, retry: expect.any(Function) })
  })

  it('ignores a late signing result after unmount', async () => {
    deferred()
    const { result, unmount } = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/message/u.jpg`))
    unmount()
    await act(async () => resolveCreateSignedUrl({ data: { signedUrl: 'https://signed/x.jpg' }, error: null }))
    // No state update on an unmounted hook; still shows the pending state.
    expect(result.current).toEqual({ src: null, loading: true, error: false, width: null, height: null, retry: expect.any(Function) })
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
    expect(result.current).toEqual({ src: null, loading: true, error: false, width: null, height: null, retry: expect.any(Function) })

    await act(async () => resolveNew({ data: { signedUrl: 'https://signed/NEW.jpg' }, error: null }))
    expect(result.current).toEqual({ src: 'https://signed/NEW.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
  })

  it('serves a remount of the same path from cache with exactly one createSignedUrl call', async () => {
    mockInfo.mockResolvedValue({ data: { metadata: { width: 300, height: 200 } }, error: null })
    const path = `${CHANNEL_ID}/cache/u.jpg`
    const first = renderHook(() => useSignedImageUrl(path, true))
    await act(async () => {})
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1)
    first.unmount()

    // Remount: no RPC, no loading flicker — the cached URL and dimensions are
    // already there on the very first render.
    const second = renderHook(() => useSignedImageUrl(path, true))
    expect(second.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: 300, height: 200, retry: expect.any(Function) })
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(1)
    expect(mockInfo).toHaveBeenCalledTimes(1)
    second.unmount()
  })

  it('re-signs after the cached URL expires past the TTL', async () => {
    const path = `${CHANNEL_ID}/cache/expired.jpg`
    const first = renderHook(() => useSignedImageUrl(path))
    await act(async () => {})
    first.unmount()

    vi.advanceTimersByTime(3600 * 1000 + 1)
    const second = renderHook(() => useSignedImageUrl(path))
    expect(second.result.current).toEqual({ src: null, loading: true, error: false, width: null, height: null, retry: expect.any(Function) })
    await act(async () => {})
    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2)
  })

  it('caches different paths independently', async () => {
    const a = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/cache/a.jpg`))
    await act(async () => {})
    const b = renderHook(() => useSignedImageUrl(`${CHANNEL_ID}/cache/b.jpg`))
    expect(b.result.current).toEqual({ src: null, loading: true, error: false, width: null, height: null, retry: expect.any(Function) })
    await act(async () => {})

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2)
    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(1, `${CHANNEL_ID}/cache/a.jpg`, expect.any(Number))
    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(2, `${CHANNEL_ID}/cache/b.jpg`, expect.any(Number))
    // Each path got its own cached URL.
    expect(a.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
    expect(b.result.current).toEqual({ src: 'https://signed/x.jpg', loading: false, error: false, width: null, height: null, retry: expect.any(Function) })
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
    expect(again.result.current).toEqual({ src: null, loading: true, error: false, width: null, height: null, retry: expect.any(Function) })
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
