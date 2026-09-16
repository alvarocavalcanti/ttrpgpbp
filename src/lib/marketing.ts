// Shared knowledge of the public marketing routes. Consumed by the gates
// that keep app-only surfaces (install banner, changelog auto-open) off the
// marketing pages (#526, #536).
export const FEATURES_PATH = '/features'

export function isMarketingPath(pathname: string): boolean {
  return pathname === FEATURES_PATH || pathname === `${FEATURES_PATH}/`
}
