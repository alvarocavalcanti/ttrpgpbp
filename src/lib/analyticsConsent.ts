import { safeGetItem, safeSetItem } from './safeStorage'

// Prior-consent choice for Google Analytics. Stored per device so the app can
// load GA only after the visitor allows it (GDPR/ePrivacy). A missing value
// means "not asked yet" — analytics stays off until then.
//
// localStorage is preferred (persists across sessions); sessionStorage is a
// fallback for browsers where localStorage throws (Safari private mode), so the
// choice still holds for the current session instead of silently not sticking.
export const ANALYTICS_CONSENT_KEY = 'analytics-consent'

export type AnalyticsConsent = 'granted' | 'denied'

function sessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function sessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // session storage unavailable — nothing more we can persist
  }
}

export function getAnalyticsConsent(): AnalyticsConsent | null {
  const value = safeGetItem(ANALYTICS_CONSENT_KEY) ?? sessionGet(ANALYTICS_CONSENT_KEY)
  return value === 'granted' || value === 'denied' ? value : null
}

export function setAnalyticsConsent(value: AnalyticsConsent): void {
  safeSetItem(ANALYTICS_CONSENT_KEY, value)
  sessionSet(ANALYTICS_CONSENT_KEY, value)
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === 'granted'
}
