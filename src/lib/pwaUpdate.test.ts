import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the options registerSW is called with so tests can drive the update
// callbacks the service worker fires, and the reload fn the banner's CTA calls.
const capture = vi.hoisted(() => ({
  opts: null as { onNeedRefresh?: () => void; onOfflineReady?: () => void } | null,
  reload: vi.fn(),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onNeedRefresh?: () => void; onOfflineReady?: () => void }) => {
    capture.opts = opts
    return capture.reload
  },
}))

let pwaUpdate: typeof import('./pwaUpdate')

beforeEach(async () => {
  vi.resetModules()
  Object.defineProperty(navigator, 'serviceWorker', { value: {}, configurable: true })
  capture.opts = null
  capture.reload.mockReset()
  capture.reload.mockResolvedValue(undefined)
  pwaUpdate = await import('./pwaUpdate')
})

describe('pwaUpdate store', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => pwaUpdate.usePwaUpdate())
    expect(result.current).toBe('idle')
  })

  it('flips to update-available when a new worker is waiting', async () => {
    const { result } = renderHook(() => pwaUpdate.usePwaUpdate())
    await act(async () => capture.opts?.onNeedRefresh?.())
    expect(result.current).toBe('update-available')
  })

  it('flips to offline-ready on first install', async () => {
    const { result } = renderHook(() => pwaUpdate.usePwaUpdate())
    await act(async () => capture.opts?.onOfflineReady?.())
    expect(result.current).toBe('offline-ready')
  })

  it('reloadToUpdate invokes the registered reload function', async () => {
    renderHook(() => pwaUpdate.usePwaUpdate())
    await act(async () => capture.opts?.onNeedRefresh?.())
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.reload).toHaveBeenCalledTimes(1)
  })
})