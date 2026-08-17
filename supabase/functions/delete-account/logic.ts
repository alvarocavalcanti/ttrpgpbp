// Pure logic for the delete-account edge function. Kept dependency-free so it
// can run in the Deno edge function and in vitest.

export type DeletionDecision =
  | { allow: true }
  | { allow: false; status: number; reason: string }

// The sole server_admin can't self-delete: it would leave the app without an
// admin (profiles.server_admin is a singleton via partial unique index).
export function evaluateDeletion(isServerAdmin: boolean): DeletionDecision {
  if (isServerAdmin) {
    return {
      allow: false,
      status: 403,
      reason: 'Server admin cannot delete their own account. Transfer admin first.',
    }
  }
  return { allow: true }
}

// Deployed app origins. Override with the ALLOWED_ORIGINS secret (comma
// separated) for self-hosting.
export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://ttrpgpbp.pages.dev',
  'https://rolebypost.com',
]

// Origin allowlist used for CORS. Explicit origins are allowed verbatim;
// Cloudflare Pages preview deployments (<hash>.ttrpgpbp.pages.dev) are always
// allowed. If envList is provided and non-empty it replaces the default list
// (previews still pass). Pure: no IO, so it runs in vitest.
export function isAllowedOrigin(origin: string, envList?: string[]): boolean {
  const allowed = envList && envList.length > 0 ? envList : DEFAULT_ALLOWED_ORIGINS
  if (allowed.includes(origin)) return true
  return origin.endsWith('.ttrpgpbp.pages.dev')
}
