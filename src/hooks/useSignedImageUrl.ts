import { useCallback, useEffect, useState } from 'react'
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
  // True only when a bucket path's signing failed or returned no URL
  // (issue #561). Lets callers tell "no image" apart from "signing failed"
  // instead of collapsing both into a null src.
  error: boolean
  // Intrinsic size of the stored image, when known (bucket images whose upload
  // wrote width/height into the object's metadata). Null for external URLs and
  // for images uploaded before dimensions were stored. Callers use it to
  // reserve the image's box before the bytes load (no layout shift).
  width: number | null
  height: number | null
  // Re-invokes signing for the current value (issue #561). Stable across
  // renders; a no-op for non-bucket values, which never need signing.
  retry: () => void
}

interface Dimensions {
  width: number
  height: number
}

// Signed URLs are short-lived (per the TTL); dimensions are immutable, so they
// live in their own cache with no expiry — re-signing never re-reads metadata.
const urlCache = new Map<string, { url: string; expiresAt: number }>()
const dimsCache = new Map<string, Dimensions>()
const CACHE_MAX_ENTRIES = 100

function getCachedUrl(path: string): string | null {
  const hit = urlCache.get(path)
  if (!hit) return null
  if (Date.now() >= hit.expiresAt) {
    urlCache.delete(path)
    return null
  }
  return hit.url
}

function cacheSignedUrl(path: string, url: string) {
  if (urlCache.size >= CACHE_MAX_ENTRIES) {
    // Evict expired entries first, then oldest insertion (Map keeps order).
    for (const [key, hit] of urlCache) {
      if (Date.now() >= hit.expiresAt) urlCache.delete(key)
    }
    while (urlCache.size >= CACHE_MAX_ENTRIES) {
      for (const key of urlCache.keys()) {
        urlCache.delete(key)
        break
      }
    }
  }
  urlCache.set(path, { url, expiresAt: Date.now() + SIGN_TTL_SECONDS * 1000 })
}

function getCachedDims(path: string): Dimensions | null {
  return dimsCache.get(path) ?? null
}

function cacheDims(path: string, dims: Dimensions) {
  if (dimsCache.size >= CACHE_MAX_ENTRIES) {
    for (const key of dimsCache.keys()) {
      dimsCache.delete(key)
      break
    }
  }
  dimsCache.set(path, dims)
}

// Object metadata is untrusted input (the upload trigger validates size and
// mimetype, not these). Only whole pixels within a sane range are used for
// layout, so a hand-crafted value can never reserve an absurd image box.
const MAX_IMAGE_DIMENSION = 20000

function positiveDimension(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value < 1 || value > MAX_IMAGE_DIMENSION) return null
  return value
}

// Bound the metadata lookup: if info() never settles the caller should not wait
// on it. The timeout handle is cleared on the success path too, so a channel
// full of images does not leave a timer per image.
const DIMENSIONS_TIMEOUT_MS = 3000

// Dimensions ride in the object's metadata (written at upload). Best-effort: a
// failure, a test double without `info`, an image uploaded before dimensions
// were stored, or a hung request yields nulls and must never block the signed
// URL.
async function fetchImageDimensions(path: string): Promise<{ width: number | null; height: number | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      supabase.storage.from(IMAGES_BUCKET).info(path),
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), DIMENSIONS_TIMEOUT_MS) }),
    ])
    if (!result) return { width: null, height: null }
    return {
      width: positiveDimension(result.data?.metadata?.width),
      height: positiveDimension(result.data?.metadata?.height),
    }
  } catch {
    return { width: null, height: null }
  } finally {
    clearTimeout(timer)
  }
}

// Resolves a stored image value to a usable src. External/relative URLs pass
// through unchanged; bucket paths are exchanged for a fresh signed URL (the
// bucket is private, so the public URL no longer resolves). Returns a null src
// until a bucket path is signed.
//
// `reserveDimensions` opts in to reading the stored intrinsic size (one extra
// info() request per uncached path). Callers that don't reserve the box —
// fixed-size avatars, thumbnails — leave it off and skip the lookup entirely.
export function useSignedImageUrl(
  value: string | null | undefined,
  reserveDimensions = false
): SignedImageResolution {
  // Bumping the attempt re-runs the signing effect without changing the
  // value — the only way to re-invoke signing, since a failed sign caches
  // nothing.
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((a) => a + 1), [])

  const [state, setState] = useState<SignedImageResolution>(() => {
    if (value && isBucketImagePath(value)) {
      const cachedUrl = getCachedUrl(value)
      const dims = getCachedDims(value)
      return {
        src: cachedUrl,
        loading: !cachedUrl,
        error: false,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        retry,
      }
    }
    return {
      src: value && !isBucketImagePath(value) ? value : null,
      loading: isBucketImagePath(value),
      error: false,
      width: null,
      height: null,
      retry,
    }
  })

  useEffect(() => {
    if (!value) {
      setState({ src: null, loading: false, error: false, width: null, height: null, retry })
      return
    }
    if (!isBucketImagePath(value)) {
      setState({ src: value, loading: false, error: false, width: null, height: null, retry })
      return
    }

    let cancelled = false
    const cachedUrl = getCachedUrl(value)
    const cachedDims = getCachedDims(value)
    setState({
      src: cachedUrl,
      loading: !cachedUrl,
      error: false,
      width: cachedDims?.width ?? null,
      height: cachedDims?.height ?? null,
      retry,
    })

    // Signing and metadata are independent: a slow/failed metadata read must
    // never keep the image's src unresolved. Dimensions only update state once
    // they land; the caller reserves nothing until they do.
    if (reserveDimensions && !cachedDims) {
      void fetchImageDimensions(value).then((dims) => {
        if (cancelled || dims.width === null || dims.height === null) return
        cacheDims(value, { width: dims.width, height: dims.height })
        setState((prev) => (prev.width === null ? { ...prev, width: dims.width, height: dims.height } : prev))
      })
    }

    if (!cachedUrl) {
      supabase.storage
        .from(IMAGES_BUCKET)
        .createSignedUrl(value, SIGN_TTL_SECONDS)
        .then(({ data, error }) => {
          if (cancelled) return
          if (error || !data?.signedUrl) {
            setState((prev) => ({ ...prev, src: null, loading: false, error: true }))
            return
          }
          cacheSignedUrl(value, data.signedUrl)
          setState((prev) => ({ ...prev, src: data.signedUrl, loading: false, error: false }))
        })
        .catch(() => {
          // A thrown failure (network drop) is still a signing failure, not
          // a pending sign — surface it instead of loading forever.
          if (cancelled) return
          setState((prev) => ({ ...prev, src: null, loading: false, error: true }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [value, reserveDimensions, attempt, retry])

  return state
}
