import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RealtimeBanner } from './RealtimeBanner'
import { clearRealtimeStatus, reportRealtimeStatus } from '../lib/realtime'

describe('RealtimeBanner', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    act(() => window.dispatchEvent(new Event('online')))
    clearRealtimeStatus('banner-test')
  })

  it('shows the offline state with a connection icon without blocking content', () => {
    render(<RealtimeBanner />)
    act(() => window.dispatchEvent(new Event('offline')))

    const banner = screen.getByTestId('realtime-banner')
    expect(banner).toHaveTextContent("You're offline — showing saved content. New messages arrive when you reconnect.")
    // Lucide renders an <svg>; nothing else in the card is an svg.
    expect(banner.querySelector('svg')).toBeInTheDocument()
  })

  it('hides when realtime is connected', () => {
    render(<RealtimeBanner />)

    expect(screen.queryByTestId('realtime-banner')).not.toBeInTheDocument()
  })

  it('floats as a card in the shared banner host instead of pushing the page (issue #620)', () => {
    render(<RealtimeBanner />)

    act(() => reportRealtimeStatus('banner-test', 'CHANNEL_ERROR'))

    const banner = screen.getByTestId('realtime-banner')
    expect(banner).toHaveTextContent("Reconnecting — new messages arrive when you're back.")
    // Same card treatment as PwaUpdateBanner; asserted literally so a return
    // to the in-flow strip fails. The host is pointer-transparent, the card
    // intercepts its own taps.
    expect(banner.className).toContain('pointer-events-auto')
    expect(banner.className).toContain('rounded-lg')
    expect(banner.className).toContain('shadow-lg')
  })

  it('explains saved content and sending in a Details expander', () => {
    render(<RealtimeBanner />)
    act(() => window.dispatchEvent(new Event('offline')))

    const details = screen.getByRole('button', { name: 'Details' })
    expect(details).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText(/Your channel list, rooms, and recent messages are saved/)).not.toBeInTheDocument()

    fireEvent.click(details)

    expect(details).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Your channel list, rooms, and recent messages are saved/)).toBeInTheDocument()
    expect(screen.getByText(/Sending needs a connection/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide details' })).toBeInTheDocument()
  })

  it('collapses the expander after the connection returns', () => {
    render(<RealtimeBanner />)
    act(() => window.dispatchEvent(new Event('offline')))
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))

    act(() => window.dispatchEvent(new Event('online')))
    expect(screen.queryByTestId('realtime-banner')).not.toBeInTheDocument()

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('button', { name: 'Details' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('stays hidden in the automated prerender browser (issue #643)', () => {
    ;(window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__ = true
    render(<RealtimeBanner />)
    act(() => window.dispatchEvent(new Event('offline')))

    expect(screen.queryByTestId('realtime-banner')).not.toBeInTheDocument()
    delete (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__
  })
})
