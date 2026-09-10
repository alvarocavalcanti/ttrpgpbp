import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture the options registerSW is called with so tests can drive the update
// callbacks the service worker fires, plus the fresh registration the CTA reads
// at tap time.
const capture = vi.hoisted(() => ({
  opts: null as { onNeedRefresh?: () => void; onOfflineReady?: () => void } | null,
  getRegistration: vi.fn(),
  addEventListener: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: { onNeedRefresh?: () => void; onOfflineReady?: () => void }) => {
    capture.opts = opts
    return vi.fn()
  },
}))

let pwaUpdate: typeof import('./pwaUpdate')

beforeEach(async () => {
  vi.resetModules()
  capture.opts = null
  capture.getRegistration.mockReset()
  capture.getRegistration.mockResolvedValue(undefined)
  capture.addEventListener.mockReset()
  capture.reload.mockReset()
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: capture.getRegistration, addEventListener: capture.addEventListener },
    configurable: true,
  })
  // Avoid reloading the page during tests.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: capture.reload },
  })
  pwaUpdate = await import('./pwaUpdate')
})

afterEach(() => {
  vi.useRealTimers()
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
})

describe('reloadToUpdate', () => {
  it('shows the updating state while the reload is in flight', async () => {
    const { result } = renderHook(() => pwaUpdate.usePwaUpdate())
    await act(async () => capture.opts?.onNeedRefresh?.())
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(result.current).toBe('updating')
  })

  it('posts SKIP_WAITING to the waiting worker', async () => {
    const waiting = { postMessage: vi.fn() }
    capture.getRegistration.mockResolvedValue({ waiting })
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('posts SKIP_WAITING to the installing worker when nothing is waiting', async () => {
    const installing = { postMessage: vi.fn() }
    capture.getRegistration.mockResolvedValue({ installing })
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('does not throw when no registration exists', async () => {
    capture.getRegistration.mockResolvedValue(undefined)
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.addEventListener).toHaveBeenCalledWith(
      'controllerchange',
      expect.any(Function),
      { once: true },
    )
  })

  it('reloads the page when the new worker takes control', async () => {
    await act(async () => pwaUpdate.reloadToUpdate())
    const onChange = capture.addEventListener.mock.calls.find(([type]) => type === 'controllerchange')?.[1]
    expect(onChange).toBeTypeOf('function')
    await act(async () => onChange())
    expect(capture.reload).toHaveBeenCalledTimes(1)
  })

  it('force-reloads after 3s when the worker never takes control', async () => {
    vi.useFakeTimers()
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.reload).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(3000))
    expect(capture.reload).toHaveBeenCalledTimes(1)
  })

  it('ignores a second tap while a reload is already in flight', async () => {
    await act(async () => pwaUpdate.reloadToUpdate())
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.getRegistration).toHaveBeenCalledTimes(1)
  })
})
