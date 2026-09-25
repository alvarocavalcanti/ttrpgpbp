import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AnalyticsConsentBanner } from './AnalyticsConsentBanner'
import { getAnalyticsConsent } from '../lib/analyticsConsent'

const mockEnv = vi.hoisted(() => ({ VITE_GA_MEASUREMENT_ID: 'G-TEST' }))
vi.mock('../env', () => ({ env: mockEnv }))

const initAnalytics = vi.hoisted(() => vi.fn())
const trackPageView = vi.hoisted(() => vi.fn())
vi.mock('../lib/analytics', () => ({ initAnalytics, trackPageView }))

function renderBanner() {
  return render(
    <MemoryRouter>
      <AnalyticsConsentBanner />
    </MemoryRouter>,
  )
}

describe('AnalyticsConsentBanner', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    initAnalytics.mockReset()
    trackPageView.mockReset()
    mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST'
  })

  it('asks for permission and loads analytics only after Allow', () => {
    renderBanner()
    expect(screen.getByRole('region', { name: 'Usage analytics choice' })).toBeInTheDocument()
    expect(initAnalytics).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))

    expect(initAnalytics).toHaveBeenCalledTimes(1)
    // The current route is reported now: initAnalytics disables automatic page
    // views and RouteTracker only fires on navigation.
    expect(trackPageView).toHaveBeenCalledWith(window.location.pathname)
    expect(getAnalyticsConsent()).toBe('granted')
    expect(screen.queryByRole('region', { name: 'Usage analytics choice' })).not.toBeInTheDocument()
  })

  it('never loads analytics when declined', () => {
    renderBanner()
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }))

    expect(initAnalytics).not.toHaveBeenCalled()
    expect(getAnalyticsConsent()).toBe('denied')
    expect(screen.queryByRole('region', { name: 'Usage analytics choice' })).not.toBeInTheDocument()
  })

  it('stays hidden once a choice was recorded', () => {
    localStorage.setItem('analytics-consent', 'denied')
    renderBanner()
    expect(screen.queryByRole('region', { name: 'Usage analytics choice' })).not.toBeInTheDocument()
  })

  it('stays hidden when no measurement ID is configured', () => {
    mockEnv.VITE_GA_MEASUREMENT_ID = ''
    renderBanner()
    expect(screen.queryByRole('region', { name: 'Usage analytics choice' })).not.toBeInTheDocument()
  })
})
