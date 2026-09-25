import { describe, it, expect, beforeEach } from 'vitest'
import { ANALYTICS_CONSENT_KEY, getAnalyticsConsent, hasAnalyticsConsent, setAnalyticsConsent } from './analyticsConsent'

describe('analytics consent', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is unset until a choice is made', () => {
    expect(getAnalyticsConsent()).toBeNull()
    expect(hasAnalyticsConsent()).toBe(false)
  })

  it('records and reads the granted choice', () => {
    setAnalyticsConsent('granted')
    expect(getAnalyticsConsent()).toBe('granted')
    expect(hasAnalyticsConsent()).toBe(true)
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('granted')
  })

  it('records a denied choice without granting consent', () => {
    setAnalyticsConsent('denied')
    expect(getAnalyticsConsent()).toBe('denied')
    expect(hasAnalyticsConsent()).toBe(false)
  })

  it('treats an unrecognized stored value as unset', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'maybe')
    expect(getAnalyticsConsent()).toBeNull()
  })
})
