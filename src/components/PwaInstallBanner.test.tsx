import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PwaInstallBanner } from './PwaInstallBanner'
import type { BeforeInstallPromptEvent } from '../hooks/usePwaInstall'

const DISMISS_KEY = 'pwa-install:dismissed-at'

function dispatchBeforeInstall(): BeforeInstallPromptEvent {
  const evt = new Event('beforeinstallprompt') as BeforeInstallPromptEvent
  evt.prompt = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(evt, 'userChoice', {
    value: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
  })
  window.dispatchEvent(evt)
  return evt
}

describe('PwaInstallBanner', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders nothing when beforeinstallprompt never fires', () => {
    render(<PwaInstallBanner />)
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
  })

  it('Escape with banner hidden does not record a dismissal', () => {
    render(<PwaInstallBanner />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(window.localStorage.getItem(DISMISS_KEY)).toBeNull()
  })

  it('Escape with banner visible dismisses it', () => {
    render(<PwaInstallBanner />)
    act(() => {
      dispatchBeforeInstall()
    })
    expect(screen.getByTestId('pwa-install-banner')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull()
  })

  it('shows banner when the browser reports installability', () => {
    render(<PwaInstallBanner />)
    act(() => {
      dispatchBeforeInstall()
    })
    expect(screen.getByTestId('pwa-install-banner')).toBeInTheDocument()
    expect(screen.getByText('Install Role by Post')).toBeInTheDocument()
    expect(screen.getByText('Install')).toBeInTheDocument()
    expect(screen.getByText('No thanks')).toBeInTheDocument()
  })

  it('calls prompt() and hides banner on Install', async () => {
    render(<PwaInstallBanner />)
    let evt!: BeforeInstallPromptEvent
    act(() => {
      evt = dispatchBeforeInstall()
    })
    fireEvent.click(screen.getByText('Install'))
    expect(evt.prompt).toHaveBeenCalled()
    await act(async () => {}) // flush the deferred install() promise
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
  })

  it('hides banner and records dismissal on No thanks', () => {
    render(<PwaInstallBanner />)
    act(() => {
      dispatchBeforeInstall()
    })
    fireEvent.click(screen.getByText('No thanks'))
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull()
  })

  it('stays hidden after a fresh dismissal (30-day cooldown)', () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
    render(<PwaInstallBanner />)
    act(() => {
      dispatchBeforeInstall()
    })
    expect(screen.queryByTestId('pwa-install-banner')).not.toBeInTheDocument()
  })

  it('shows again after the cooldown window passes', () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now() - 31 * 24 * 60 * 60 * 1000))
    render(<PwaInstallBanner />)
    act(() => {
      dispatchBeforeInstall()
    })
    expect(screen.getByTestId('pwa-install-banner')).toBeInTheDocument()
  })
})