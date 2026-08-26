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
}

// Resolves a stored image value to a usable src. External/relative URLs pass
// through unchanged; bucket paths are exchanged for a fresh signed URL (the
// bucket is private, so the public URL no longer resolves). Returns a null src
// until a bucket path is signed.
export function useSignedImageUrl(value: string | null | undefined): SignedImageResolution {
  const [state, setState] = useState<SignedImageResolution>(() => ({
    src: value && !isBucketImagePath(value) ? value : null,
    loading: isBucketImagePath(value),
  }))

  useEffect(() => {
    if (!value) {
      setState({ src: null, loading: false })
      return
    }
    if (!isBucketImagePath(value)) {
      setState({ src: value, loading: false })
      return
    }
    let cancelled = false
    setState({ src: null, loading: true })
    supabase.storage
      .from(IMAGES_BUCKET)
      .createSignedUrl(value, SIGN_TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return
        setState({ src: error || !data?.signedUrl ? null : data.signedUrl, loading: false })
      })
    return () => {
      cancelled = true
    }
  }, [value])

  return state
}