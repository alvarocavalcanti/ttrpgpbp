import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const IMAGES_BUCKET = 'images'
// Signed URLs need only cover a viewing session; 1h is plenty and keeps the
// bearer token's blast radius small when it does leak.
const SIGN_TTL_SECONDS = 3600

// Uploaded objects live at `{channel_id}/{folder}/{uuid}.jpg` where the first
// segment is always a UUID. Anything else — external http(s) URLs, relative
// in-app URLs like /assets/map.png — is not a bucket object.
const BUCKET_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//

// True when `value` is a bare object path into the private 'images' bucket that
// needs signing before it can render. External and relative URLs are not bucket
// paths and pass through unchanged.
export function isBucketImagePath(value: string | null | undefined): boolean {
  if (!value) return false
  return BUCKET_PATH_RE.test(value)
}

export interface SignedImageResolution {
  src: string | null
  // True while a bucket path is being exchanged for a signed URL; callers show
  // a placeholder instead of collapsing so late-arriving images don't shift
  // the layout.
  loading: boolean
  // Intrinsic size of the stored image, when known (bucket images whose upload
  // wrote width/height into the object's metadata). Null for external URLs and
  // for images uploaded before dimensions were stored. Callers use it to
  // reserve the image's box before the bytes load (no layout shift).
  width: number | null
  height: number | null
}

// Module-scoped TTL cache so remounts reuse the same signed URL (and its
// dimensions) instead of firing new RPCs for the same path in the same session.
interface CacheEntry {
  url: string
  expiresAt: number
  width: number | null
  height: number | null
}

const cache = new Map<string, CacheEntry>()
const CACHE_MAX_ENTRIES = 100

function getCached(path: string): CacheEntry | null {
  const hit = cache.get(path)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    cache.delete(path)
    return null
  }
  return hit
}

function cacheSignedUrl(path: string, url: string, width: number | null, height: number | null) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Evict expired entries first, then oldest insertion (Map keeps order).
    for (const [key, hit] of cache) {
      if (Date.now() >= hit.expiresAt) cache.delete(key)
    }
    while (cache.size >= CACHE_MAX_ENTRIES) {
      for (const key of cache.keys()) {
        cache.delete(key)
        break
      }
    }
  }
  cache.set(path, { url, expiresAt: Date.now() + SIGN_TTL_SECONDS * 1000, width, height })
}

function positiveDimension(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : null
}

// Dimensions ride in the object's metadata (written at upload). Best-effort: a
// failure, a test double without `info`, or an image uploaded before dimensions
// were stored yields nulls and must never block the signed URL.
async function fetchImageDimensions(path: string): Promise<{ width: number | null; height: number | null }> {
  try {
    const { data } = await supabase.storage.from(IMAGES_BUCKET).info(path)
    return {
      width: positiveDimension(data?.metadata?.width),
      height: positiveDimension(data?.metadata?.height),
    }
  } catch {
    return { width: null, height: null }
  }
}

// Resolves a stored image value to a usable src. External/relative URLs pass
// through unchanged; bucket paths are exchanged for a fresh signed URL (the
// bucket is private, so the public URL no longer resolves). Returns a null src
// until a bucket path is signed.
export function useSignedImageUrl(value: string | null | undefined): SignedImageResolution {
  const [state, setState] = useState<SignedImageResolution>(() => {
    if (value && isBucketImagePath(value)) {
      const cached = getCached(value)
      if (cached) return { src: cached.url, loading: false, width: cached.width, height: cached.height }
    }
    return {
      src: value && !isBucketImagePath(value) ? value : null,
      loading: isBucketImagePath(value),
      width: null,
      height: null,
    }
  })

  useEffect(() => {
    if (!value) {
      setState({ src: null, loading: false, width: null, height: null })
      return
    }
    if (!isBucketImagePath(value)) {
      setState({ src: value, loading: false, width: null, height: null })
      return
    }
    const cached = getCached(value)
    if (cached) {
      setState({ src: cached.url, loading: false, width: cached.width, height: cached.height })
      return
    }
    let cancelled = false
    setState({ src: null, loading: true, width: null, height: null })
    // Sign and read metadata in parallel; the metadata read is best-effort.
    // Dimensions update the state as soon as they land (independently of the
    // signed URL) so the placeholder can reserve its box while signing.
    const dimsPromise = fetchImageDimensions(value)
    void dimsPromise.then((dims) => {
      if (cancelled || dims.width === null || dims.height === null) return
      setState((prev) => (prev.width === null ? { ...prev, width: dims.width, height: dims.height } : prev))
    })
    Promise.all([
      supabase.storage.from(IMAGES_BUCKET).createSignedUrl(value, SIGN_TTL_SECONDS),
      dimsPromise,
    ]).then(([signed, dims]) => {
      if (!signed.error && signed.data?.signedUrl) {
        cacheSignedUrl(value, signed.data.signedUrl, dims.width, dims.height)
        if (cancelled) return
        setState({ src: signed.data.signedUrl, loading: false, width: dims.width, height: dims.height })
        return
      }
      if (cancelled) return
      setState({ src: null, loading: false, width: null, height: null })
    })
    return () => {
      cancelled = true
    }
  }, [value])

  return state
}
