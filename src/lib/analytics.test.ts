import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnv = vi.hoisted(() => ({ VITE_GA_MEASUREMENT_ID: '' }))

vi.mock('../env', () => ({ env: mockEnv }))

import { initAnalytics, trackPageView } from './analytics'

describe('analytics', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    document.head.innerHTML = ''
    delete (window as unknown as Record<string, unknown>).dataLayer
    delete (window as unknown as Record<string, unknown>).gtag
  })

  describe('initAnalytics', () => {
    it('no-ops when no measurement id is configured', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = ''
      initAnalytics()
      expect(document.getElementById('gtag-script')).toBeNull()
      expect(window.gtag).toBeUndefined()
    })

    it('injects the gtag script and registers the property when configured', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
      initAnalytics()

      const script = document.getElementById('gtag-script') as HTMLScriptElement | null
      expect(script).not.toBeNull()
      expect(script!.async).toBe(true)
      expect(script!.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST123')

      expect(window.dataLayer).toBeDefined()
      expect(window.gtag).toBeTypeOf('function')
      expect(window.dataLayer![0]).toEqual(['js', expect.any(Date)])
      expect(window.dataLayer![1]).toEqual(['config', 'G-TEST123', { send_page_view: false }])
    })

    it('does not duplicate the script on repeated calls', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
      initAnalytics()
      initAnalytics()
      expect(document.querySelectorAll('#gtag-script')).toHaveLength(1)
    })
  })

  describe('trackPageView', () => {
    it('no-ops when gtag is not loaded', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = ''
      expect(() => trackPageView('/lobby')).not.toThrow()
    })

    it('fires a page_view event with a clean absolute location', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
      initAnalytics()
      const gtag = vi.fn()
      window.gtag = gtag

      trackPageView('/channel/abc?q=1')

      expect(gtag).toHaveBeenCalledWith('event', 'page_view', {
        page_path: '/channel/abc',
        page_location: `${window.location.origin}/channel/abc`,
      })
    })

    it('strips the query string so search terms never leave the device', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
      initAnalytics()
      const gtag = vi.fn()
      window.gtag = gtag

      trackPageView('/lobby?search=secret%20dragon')
      trackPageView('/channel/abc?x=1&y=2')

      expect(gtag).toHaveBeenNthCalledWith(1, 'event', 'page_view', {
        page_path: '/lobby',
        page_location: `${window.location.origin}/lobby`,
      })
      expect(gtag).toHaveBeenNthCalledWith(2, 'event', 'page_view', {
        page_path: '/channel/abc',
        page_location: `${window.location.origin}/channel/abc`,
      })
    })
  })
})
