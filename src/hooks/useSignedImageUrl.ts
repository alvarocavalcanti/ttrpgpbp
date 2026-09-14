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
//
// `reserveDimensions` opts in to reading the stored intrinsic size (one extra
// info() request per uncached path). Callers that don't reserve the box —
// fixed-size avatars, thumbnails — leave it off and skip the lookup entirely.
export function useSignedImageUrl(
  value: string | null | undefined,
  reserveDimensions = false
): SignedImageResolution {
  const [state, setState] = useState<SignedImageResolution>(() => {
    if (value && isBucketImagePath(value)) {
      const cachedUrl = getCachedUrl(value)
      const dims = getCachedDims(value)
      return { src: cachedUrl, loading: !cachedUrl, width: dims?.width ?? null, height: dims?.height ?? null }
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

    let cancelled = false
    const cachedUrl = getCachedUrl(value)
    const cachedDims = getCachedDims(value)
    setState({
      src: cachedUrl,
      loading: !cachedUrl,
      width: cachedDims?.width ?? null,
      height: cachedDims?.height ?? null,
    })

    // Signing and metadata are independent: a slow/failed metadata read must
    // never keep the image on its placeholder. Dimensions only update state
    // once they land.
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
            setState((prev) => ({ ...prev, src: null, loading: false }))
            return
          }
          cacheSignedUrl(value, data.signedUrl)
          setState((prev) => ({ ...prev, src: data.signedUrl, loading: false }))
        })
    }

    return () => {
      cancelled = true
    }
  }, [value, reserveDimensions])

  return state
}
