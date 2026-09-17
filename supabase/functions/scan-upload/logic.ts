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

// Thorn Safer answers with a `hashes` key only when the image matches a known
// CSAM hash; an absent or empty value means no match. A non-2xx response is an
// error (the caller fails closed), so this only interprets a successful body.
// Pure, so the interpretation is tested without the HTTP call.
export function interpretSaferResponse(payload: unknown): ScanVerdict {
  if (payload === null || typeof payload !== 'object') return 'clear'
  const hashes = (payload as Record<string, unknown>).hashes
  if (Array.isArray(hashes)) return hashes.length > 0 ? 'match' : 'clear'
  if (hashes !== null && typeof hashes === 'object') {
    return Object.keys(hashes).length > 0 ? 'match' : 'clear'
  }
  return 'clear'
}
