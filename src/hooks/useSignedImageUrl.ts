import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const IMAGES_BUCKET = 'images'
// Signed URLs need only cover a viewing session; 1h is plenty and keeps the
// bearer token's blast radius small when it does leak.
const SIGN_TTL_SECONDS = 3600
const EXTERNAL_RE = /^https?:\/\//i

// A stored image value is either an external URL (game-icons, Google avatars,
// user-typed map/resources links) or a bare object path into the 'images'
// bucket (`{channel_id}/{folder}/{uuid}.jpg`). Everything that isn't an
// http(s) URL is treated as a bucket path.
export function isBucketImagePath(value: string | null | undefined): boolean {
  if (!value) return false
  return !EXTERNAL_RE.test(value)
}

// Resolves a stored image value to a renderable src. External URLs pass
// through unchanged; bucket paths are exchanged for a fresh signed URL (the
// bucket is private, so the public URL no longer resolves). Returns null while
// a bucket path is being signed so callers never render a broken href.
export function useSignedImageUrl(value: string | null | undefined): string | null {
  const [src, setSrc] = useState<string | null>(() =>
    value && !isBucketImagePath(value) ? value : null,
  )

  useEffect(() => {
    if (!value) {
      setSrc(null)
      return
    }
    if (!isBucketImagePath(value)) {
      setSrc(value)
      return
    }
    let cancelled = false
    setSrc(null)
    supabase.storage
      .from(IMAGES_BUCKET)
      .createSignedUrl(value, SIGN_TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return
        setSrc(error || !data?.signedUrl ? null : data.signedUrl)
      })
    return () => {
      cancelled = true
    }
  }, [value])

  return src
}