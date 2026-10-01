import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RealtimeBanner } from './RealtimeBanner'
import { clearRealtimeStatus, reportRealtimeStatus } from '../lib/realtime'

describe('RealtimeBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    act(() => window.dispatchEvent(new Event('online')))
    clearRealtimeStatus('banner-test')
  })

  it('shows offline state without blocking content', () => {
    render(<RealtimeBanner />)
    act(() => window.dispatchEvent(new Event('offline')))

    expect(screen.getByTestId('realtime-banner')).toHaveTextContent('You are offline')
  })

  it('hides when realtime is connected', () => {
    render(<RealtimeBanner />)

    expect(screen.queryByTestId('realtime-banner')).not.toBeInTheDocument()
  })

  it('floats as a card in the shared banner host instead of pushing the page (issue #620)', () => {
    render(<RealtimeBanner />)

    act(() => reportRealtimeStatus('banner-test', 'CHANNEL_ERROR'))

    const banner = screen.getByTestId('realtime-banner')
    expect(banner).toHaveTextContent('Reconnecting')
    // Same card treatment as PwaUpdateBanner; asserted literally so a return
    // to the in-flow strip fails. The host is pointer-transparent, the card
    // intercepts its own taps.
    expect(banner.className).toContain('pointer-events-auto')
    expect(banner.className).toContain('rounded-lg')
    expect(banner.className).toContain('shadow-lg')
  })

  it('stays hidden in the automated prerender browser (issue #643)', () => {
    ;(window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__ = true
    render(<RealtimeBanner />)
    act(() => window.dispatchEvent(new Event('offline')))

    expect(screen.queryByTestId('realtime-banner')).not.toBeInTheDocument()
    delete (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__
  })
})
