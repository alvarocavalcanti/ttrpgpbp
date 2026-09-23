import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnv = vi.hoisted(() => ({ VITE_GA_MEASUREMENT_ID: '' }))

vi.mock('../env', () => ({ env: mockEnv }))

import { initAnalytics, trackEvent, trackPageView } from './analytics'

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
      expect(Array.from(window.dataLayer![0] as ArrayLike<unknown>)).toEqual(['js', expect.any(Date)])
      expect(Array.from(window.dataLayer![1] as ArrayLike<unknown>)).toEqual(['config', 'G-TEST123', { send_page_view: false }])
    })

    it('queues commands as array-like arguments objects, never as arrays', () => {
      // gtag.js ignores real Arrays when it drains the pre-load dataLayer, so
      // the commands must be pushed as the array-like `arguments` object the
      // official snippet uses. An Array here means the destination is never
      // registered and no hit is ever sent (#582 follow-up).
      mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
      initAnalytics()

      expect(Array.isArray(window.dataLayer![0])).toBe(false)
      expect(Array.from(window.dataLayer![0] as ArrayLike<unknown>)[0]).toBe('js')
      expect(Array.isArray(window.dataLayer![1])).toBe(false)
      expect(Array.from(window.dataLayer![1] as ArrayLike<unknown>)[0]).toBe('config')
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

    it('strips query string and fragment so search terms never leave the device', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
      initAnalytics()
      const gtag = vi.fn()
      window.gtag = gtag

      trackPageView('/lobby?search=secret%20dragon')
      trackPageView('/channel/abc?x=1&y=2#frag')

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

  describe('trackEvent', () => {
    it('no-ops when gtag is not loaded', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = ''
      expect(() => trackEvent('menu_close', { method: 'button' })).not.toThrow()
    })

    it('fires the event with its parameters', () => {
      mockEnv.VITE_GA_MEASUREMENT_ID = 'G-TEST123'
      initAnalytics()
      const gtag = vi.fn()
      window.gtag = gtag

      trackEvent('menu_close', { method: 'button', menu: 'main' })

      expect(gtag).toHaveBeenCalledWith('event', 'menu_close', {
        method: 'button',
        menu: 'main',
      })
    })
  })
})
