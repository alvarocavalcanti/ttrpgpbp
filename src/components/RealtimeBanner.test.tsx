import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { RealtimeBanner } from './RealtimeBanner'
import { clearRealtimeStatus, reportRealtimeStatus } from '../lib/realtime'

describe('RealtimeBanner', () => {
  afterEach(() => {
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

  it('shows reconnecting state while a channel retries', () => {
    render(<RealtimeBanner />)

    act(() => reportRealtimeStatus('banner-test', 'CHANNEL_ERROR'))

    expect(screen.getByTestId('realtime-banner')).toHaveTextContent('Reconnecting')
  })
})
