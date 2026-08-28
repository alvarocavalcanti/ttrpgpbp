import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnv = vi.hoisted(() => ({ VITE_SENTRY_DSN: '' }))

vi.mock('../env', () => ({ env: mockEnv }))
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  browserTracingIntegration: vi.fn(),
  replayIntegration: vi.fn(),
}))

import * as Sentry from '@sentry/react'
import { initSentry, scrubSentryEvent, scrubUrl } from './sentry'

type FakeEvent = Parameters<typeof scrubSentryEvent>[0]

describe('sentry', () => {
  beforeEach(() => {
    mockEnv.VITE_SENTRY_DSN = ''
    vi.mocked(Sentry.init).mockClear()
  })

  describe('scrubUrl', () => {
    it('strips query string and fragment', () => {
      expect(scrubUrl('/lobby?search=secret%20dragon#top')).toBe('/lobby')
      expect(scrubUrl('https://example.com/channel/abc?x=1#frag')).toBe('/channel/abc')
    })
  })

  describe('scrubSentryEvent', () => {
    it('strips query from the request url', () => {
      const event = { request: { url: 'https://app.example/lobby?search=dragon' } } as unknown as FakeEvent
      expect(scrubSentryEvent(event).request?.url).toBe('/lobby')
    })

    it('strips query from navigation breadcrumb from/to urls', () => {
      const event = {
        breadcrumbs: [
          { category: 'navigation', data: { from: 'https://app.example/lobby?search=dragon', to: '/channel/abc?x=1&y=2#frag' } },
          { data: { url: 'https://app.example/lobby?search=dragon' } },
          { data: { unrelated: 42 } },
        ],
      } as unknown as FakeEvent
      const result = scrubSentryEvent(event)
      expect(result.breadcrumbs?.[0]?.data?.from).toBe('/lobby')
      expect(result.breadcrumbs?.[0]?.data?.to).toBe('/channel/abc')
      expect(result.breadcrumbs?.[1]?.data?.url).toBe('/lobby')
      expect(result.breadcrumbs?.[2]?.data?.unrelated).toBe(42)
    })

    it('leaves events without urls untouched', () => {
      const event = { message: 'boom' } as unknown as FakeEvent
      expect(scrubSentryEvent(event)).toBe(event)
    })
  })

  describe('initSentry', () => {
    it('no-ops when no DSN is configured', () => {
      initSentry()
      expect(Sentry.init).not.toHaveBeenCalled()
    })

    it('initializes with DSN and the URL-scrubbing beforeSend', () => {
      mockEnv.VITE_SENTRY_DSN = 'https://test@ingest.sentry.io/1'
      initSentry()
      expect(Sentry.init).toHaveBeenCalledOnce()
      const config = vi.mocked(Sentry.init).mock.calls[0][0]
      expect(config.dsn).toBe('https://test@ingest.sentry.io/1')
      expect(config.tracesSampleRate).toBe(1.0)
      expect(config.replaysSessionSampleRate).toBe(0.1)
      expect(config.replaysOnErrorSampleRate).toBe(1.0)
      expect(config.beforeSend).toBe(scrubSentryEvent)
    })
  })
})