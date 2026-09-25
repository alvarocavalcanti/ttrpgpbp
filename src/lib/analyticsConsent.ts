import { safeGetItem, safeSetItem } from './safeStorage'

// Prior-consent choice for Google Analytics. Stored per device so the app can
// load GA only after the visitor allows it (GDPR/ePrivacy). A missing value
// means "not asked yet" — analytics stays off until then.
export const ANALYTICS_CONSENT_KEY = 'analytics-consent'

export type AnalyticsConsent = 'granted' | 'denied'

export function getAnalyticsConsent(): AnalyticsConsent | null {
  const value = safeGetItem(ANALYTICS_CONSENT_KEY)
  return value === 'granted' || value === 'denied' ? value : null
}

export function setAnalyticsConsent(value: AnalyticsConsent): void {
  safeSetItem(ANALYTICS_CONSENT_KEY, value)
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === 'granted'
}
