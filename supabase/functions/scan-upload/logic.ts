// Pure logic for the scan-upload edge function. Dependency-free so it runs both
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
// only the GM of the owning channel may write them (storage.objects write
// policies). The function stores with the service role, which bypasses RLS, so
// the path shape and the channel match are checked here first.
const UPLOAD_PATH =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(avatar|message|map|resources|npc|character)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/

export function isValidUploadPath(path: string, channelId: string): boolean {
  const match = UPLOAD_PATH.exec(path)
  return match !== null && match[1] === channelId
}

export type ScanVerdict = 'match' | 'clear'

// Interprets a Thorn Safer matching response. Fails closed: anything that is
// not an explicitly recognized shape throws, and the caller 500s without
// storing the image. The contract is not confirmed yet, so an unrecognized
// payload must never be read as "no match".
//
// Recognized: an object carrying a `hashes` key — non-empty means a match,
// empty/false/null means clear. A payload without `hashes` (including one that
// wraps the body in an unexpected envelope, e.g. `{ data: ... }`) is refused.
// When Safer API access is granted, confirm the real clean-response shape here
// and extend this function rather than assuming.
export function interpretSaferResponse(payload: unknown): ScanVerdict {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Unrecognized Safer response')
  }

  const body = payload as Record<string, unknown>
  if (!('hashes' in body)) {
    throw new Error('Unrecognized Safer response')
  }

  const hashes = body.hashes
  if (hashes === undefined || hashes === null || hashes === false) return 'clear'
  if (Array.isArray(hashes)) return hashes.length > 0 ? 'match' : 'clear'
  if (typeof hashes === 'object') return Object.keys(hashes).length > 0 ? 'match' : 'clear'
  throw new Error('Unrecognized Safer response')
}

// Provider requests are capped so a hanging Safer call cannot pin the invocation.
export const SAFER_TIMEOUT_MS = 15000

// Rolling per-user attempt ceiling (enforced in index.ts). Bounds how much paid
// provider quota one GM can burn in an hour; raise it if a heavy session ever
// legitimately hits it.
export const MAX_UPLOADS_PER_HOUR = 100

// Default size cap (MB) mirroring enforce_image_upload_rules(): the DB trigger
// COALESCEs a missing image_max_size_mb row to 5.
export const DEFAULT_IMAGE_MAX_SIZE_MB = 5

// Postgres unique_violation. The content_hashes insert is the quota gate: a
// 23505 on object_path means the path was already attempted (a replay that
// would otherwise scan without incrementing the cap).
export const POSTGRES_UNIQUE_VIOLATION = '23505'

export type PreScanGuard = 'ok' | 'disabled' | 'too_large'

// Pre-scan gate mirroring the DB store-time trigger (image_uploading_enabled /
// image_max_size_mb): disabled or oversized uploads must never touch the paid
// provider. Absent rows fall back to the trigger's defaults (off / 5 MB).
// Parses defensively — the JSONB column historically held both native types
// and castable strings — but never coerces null (Number(null) is 0, which
// would block every upload instead of defaulting like COALESCE does).
export function evaluatePreScanGuards(
  rows: ReadonlyArray<{ key: string; value: unknown }>,
  byteLength: number
): PreScanGuard {
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

// Replays of an attempted path get the throttled client status; any other
// provenance-insert failure degrades to unavailable (fail closed — the row is
// the quota counter, so no row means no paid call).
export function attemptInsertFailureStatus(code: string | undefined): 'throttled' | 'unavailable' {
  return code === POSTGRES_UNIQUE_VIOLATION ? 'throttled' : 'unavailable'
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

export interface CsamAlertDetails {
  uploaderId: string
  uploaderName: string
  channelId: string
  channelName: string
  objectPath: string
  sha256: string
  detectedAt: string
  // Whether the automatic suspension landed. The alert must state the truth:
  // a failed suspension needs a human to finish it.
  suspended: boolean
}

// Backslash-escapes Markdown metacharacters in user-controlled labels before
// they are interpolated into the alert body (mirrors escape_markdown() in
// SQL: code, emphasis, links, images, headers, quotes).
export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_\[\]()#!>]/g, '\\$&')
}

// Builds the markdown body posted to the admin's System thread on a Safer
// match (#562 P1). Root-relative links so the admin inbox's SPA renderer can
// intercept them; the channel link points at the admin's read-only channel
// view because the admin is not a channel member.
export function buildCsamAlertMessage(details: CsamAlertDetails): string {
  return [
    '**Blocked upload — possible child sexual abuse material**',
    '',
    `- **Uploaded by:** [${escapeMarkdown(details.uploaderName)}](/admin?user=${details.uploaderId})`,
    `- **Channel:** [${escapeMarkdown(details.channelName)}](/admin/channels/${details.channelId})`,
    `- **Attempted path:** \`${details.objectPath}\``,
    `- **SHA-256:** \`${details.sha256}\``,
    `- **Detected:** ${details.detectedAt}`,
    '',
    details.suspended
      ? 'The upload was blocked and the account suspended automatically. If this is confirmed CSAM, file a report with NCMEC (US) or an INHOPE hotline such as Hotline.ie (IE), then reply here to record it.'
      : 'The upload was blocked, but the automatic suspension FAILED — suspend the account manually, then file a report with NCMEC (US) or an INHOPE hotline such as Hotline.ie (IE) if this is confirmed CSAM, and reply here to record it.',
  ].join('\n')
}
