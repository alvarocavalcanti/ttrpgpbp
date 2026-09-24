// Pure logic for the upload-image edge function. Dependency-free so it runs both
// in the Deno edge function and in vitest.

// Deployed app origins. Override with the ALLOWED_ORIGINS secret (comma
// separated) for self-hosting. Mirrors delete-account/logic.ts.
export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://ttrpgpbp.pages.dev',
  'https://rolebypost.com',
]

export function isAllowedOrigin(origin: string, envList?: string[]): boolean {
  const allowed = envList && envList.length > 0 ? envList : DEFAULT_ALLOWED_ORIGINS
  if (allowed.includes(origin)) return true
  return origin.endsWith('.ttrpgpbp.pages.dev')
}

// Headers the Supabase browser client sends on functions.invoke. The CORS
// preflight only passes when every requested header is echoed here; a missing
// one blocks the request before it reaches this function (#593: x-client-info).
// Kept in sync with @supabase/supabase-js/cors.
export const CORS_ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage'

// Builds the full CORS header set for a request. Pure: no IO, so it runs in
// vitest. The origin is echoed only when allowlisted; a null origin (non-
// browser call) gets headers without Allow-Origin.
export function buildCorsHeaders(
  origin: string | null,
  envList?: string[]
): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': CORS_ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
  if (origin && isAllowedOrigin(origin, envList)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

// Upload paths are `{channelId}/{folder}/{uuid}.jpg` (see useImageUpload), and
// only the GM of the owning channel may write them. The function stores with
// the service role, which bypasses RLS, so the path shape and the channel
// match are checked here first.
const UPLOAD_PATH =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(avatar|message|map|resources|npc|character)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

export function isValidUploadPath(path: string, channelId: string): boolean {
  const match = UPLOAD_PATH.exec(path)
  return match !== null && match[1] === channelId
}

// Default size cap (MB) mirroring enforce_image_upload_rules(): the DB trigger
// COALESCEs a missing image_max_size_mb row to 5.
export const DEFAULT_IMAGE_MAX_SIZE_MB = 5

export type UploadGuard = 'ok' | 'disabled' | 'too_large'

// Upload gate mirroring the DB store-time trigger (image_uploading_enabled /
// image_max_size_mb): disabled or oversized uploads are refused. Absent rows
// fall back to the trigger's defaults (off / 5 MB). Parses defensively — the
// JSONB column historically held both native types and castable strings — but
// never coerces null (Number(null) is 0, which would block every upload
// instead of defaulting like COALESCE does).
export function evaluateUploadGuards(
  rows: ReadonlyArray<{ key: string; value: unknown }>,
  byteLength: number
): UploadGuard {
  const settings = new Map(rows.map(r => [r.key, r.value]))
  const enabledValue = settings.get('image_uploading_enabled')
  if (enabledValue !== true && enabledValue !== 'true') return 'disabled'

  const rawMax = settings.get('image_max_size_mb')
  const parsedMax =
    typeof rawMax === 'number'
      ? rawMax
      : typeof rawMax === 'string' && rawMax.trim() !== ''
        ? Number(rawMax)
        : NaN
  const maxMb = Number.isFinite(parsedMax) ? parsedMax : DEFAULT_IMAGE_MAX_SIZE_MB
  return byteLength > maxMb * 1024 * 1024 ? 'too_large' : 'ok'
}

// Upload dimensions arrive as strings from the FormData. Absent must stay
// absent — Number(null) is 0, which would write a bogus 0x0 box into the object
// metadata (the client uses it to reserve space before the image loads).
export function buildImageMetadata(
  widthValue: unknown,
  heightValue: unknown
): { width: number; height: number } | undefined {
  if (typeof widthValue !== 'string' || typeof heightValue !== 'string') return undefined
  const width = Number(widthValue)
  const height = Number(heightValue)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined
  }
  return { width, height }
}
