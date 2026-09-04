import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { usePwaInstall } from './usePwaInstall'
import type { BeforeInstallPromptEvent } from './usePwaInstall'

const DISMISS_KEY = 'pwa-install:dismissed-at'

function dispatchBeforeInstall(outcome: 'accepted' | 'dismissed' = 'dismissed'): BeforeInstallPromptEvent {
  const evt = new Event('beforeinstallprompt') as BeforeInstallPromptEvent
  evt.prompt = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(evt, 'userChoice', {
    value: Promise.resolve({ outcome, platform: 'web' }),
  })
  window.dispatchEvent(evt)
  return evt
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('starts hidden with no deferred prompt', () => {
    const { result } = renderHook(() => usePwaInstall())
    expect(result.current.canShow).toBe(false)
  })

  it('becomes showable when beforeinstallprompt fires', () => {
    const { result } = renderHook(() => usePwaInstall())
    act(() => {
      dispatchBeforeInstall()
    })
    expect(result.current.canShow).toBe(true)
  })

  it('install() calls prompt() and hides the banner', async () => {
    const { result } = renderHook(() => usePwaInstall())
    let evt!: BeforeInstallPromptEvent
    act(() => {
      evt = dispatchBeforeInstall()
    })
    await act(async () => {
      await result.current.install()
    })
    expect(evt.prompt).toHaveBeenCalled()
    expect(result.current.canShow).toBe(false)
  })

  it('install() with native-dialog decline records a 30-day cooldown', async () => {
    const { result } = renderHook(() => usePwaInstall())
    act(() => {
      dispatchBeforeInstall('dismissed')
    })
    await act(async () => {
      await result.current.install()
    })
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull()
  })

  it('install() with native-dialog accept records no cooldown', async () => {
    const { result } = renderHook(() => usePwaInstall())
    act(() => {
      dispatchBeforeInstall('accepted')
    })
    await act(async () => {
      await result.current.install()
    })
    expect(window.localStorage.getItem(DISMISS_KEY)).toBeNull()
  })

  it('appinstalled clears the deferred prompt', () => {
    const { result } = renderHook(() => usePwaInstall())
    act(() => {
      dispatchBeforeInstall()
    })
    expect(result.current.canShow).toBe(true)
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })
    expect(result.current.canShow).toBe(false)
  })

  it('dismiss() persists a timestamp and hides the banner', () => {
    const { result } = renderHook(() => usePwaInstall())
    act(() => {
      dispatchBeforeInstall()
    })
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.canShow).toBe(false)
    expect(window.localStorage.getItem(DISMISS_KEY)).not.toBeNull()
  })
})