import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Capture the options registerSW is called with so tests can drive the update
// callbacks the service worker fires, plus the fresh registration the CTA reads
// at tap time.
const capture = vi.hoisted(() => ({
  opts: null as {
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  } | null,
  getRegistration: vi.fn(),
  getRegistrations: vi.fn(),
  unregister: vi.fn(),
  addEventListener: vi.fn(),
  hardReload: vi.fn(),
  cachesKeys: vi.fn(),
  cachesDelete: vi.fn(),
}))

vi.mock('virtual:pwa-register', () => ({
  registerSW: (opts: {
    onNeedRefresh?: () => void
    onOfflineReady?: () => void
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void
  }) => {
    capture.opts = opts
    return vi.fn()
  },
}))

vi.mock('./hardReload', () => ({ hardReload: capture.hardReload }))

let pwaUpdate: typeof import('./pwaUpdate')

beforeEach(async () => {
  vi.resetModules()
  capture.opts = null
  capture.getRegistration.mockReset()
  capture.getRegistration.mockResolvedValue(undefined)
  capture.getRegistrations.mockReset()
  capture.getRegistrations.mockResolvedValue([])
  capture.unregister.mockReset()
  capture.unregister.mockResolvedValue(true)
  capture.addEventListener.mockReset()
  capture.hardReload.mockReset()
  capture.cachesKeys.mockReset()
  capture.cachesKeys.mockResolvedValue([])
  capture.cachesDelete.mockReset()
  capture.cachesDelete.mockResolvedValue(true)
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      getRegistration: capture.getRegistration,
      getRegistrations: capture.getRegistrations,
      addEventListener: capture.addEventListener,
    },
    configurable: true,
  })
  Object.defineProperty(globalThis, 'caches', {
    value: { keys: capture.cachesKeys, delete: capture.cachesDelete },
    configurable: true,
  })
  // The boot handshake reads/writes storage on every module import; a stale
  // marker from an earlier test would look like a failed update.
  localStorage.clear()
  sessionStorage.clear()
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
    const waiting = { state: 'installed', postMessage: vi.fn(), addEventListener: vi.fn() }
    capture.getRegistration.mockResolvedValue({ waiting })
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('posts SKIP_WAITING to the installing worker when nothing is waiting', async () => {
    const installing = { state: 'installing', postMessage: vi.fn(), addEventListener: vi.fn() }
    capture.getRegistration.mockResolvedValue({ installing })
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('reloads once the new worker reports activated', async () => {
    vi.useFakeTimers()
    const stateListeners: Array<() => void> = []
    const worker = {
      state: 'installing',
      postMessage: vi.fn(),
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        stateListeners.push(listener)
      }),
    }
    capture.getRegistration.mockResolvedValue({ waiting: worker })
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(capture.hardReload).not.toHaveBeenCalled()
    worker.state = 'activated'
    await act(async () => stateListeners.forEach((listener) => listener()))
    expect(capture.hardReload).toHaveBeenCalledTimes(1)
    // The safety net must not fire a second reload.
    await act(async () => vi.advanceTimersByTime(3000))
    expect(capture.hardReload).toHaveBeenCalledTimes(1)
  })

  it('reloads immediately when the worker already activated', async () => {
    const worker = { state: 'activated', postMessage: vi.fn(), addEventListener: vi.fn() }
    capture.getRegistration.mockResolvedValue({ waiting: worker })
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.hardReload).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).not.toHaveBeenCalled()
  })

  it('ignores a redundant worker and falls back to the self-heal reload', async () => {
    vi.useFakeTimers()
    const stateListeners: Array<() => void> = []
    const worker = {
      state: 'installing',
      postMessage: vi.fn(),
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        stateListeners.push(listener)
      }),
    }
    capture.getRegistration.mockResolvedValue({ installing: worker })
    await act(async () => pwaUpdate.reloadToUpdate())
    worker.state = 'redundant'
    await act(async () => stateListeners.forEach((listener) => listener()))
    expect(capture.hardReload).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(3000))
    expect(capture.hardReload).toHaveBeenCalledWith({ bustCache: true })
  })

  it('still wires the controllerchange listener when no registration exists', async () => {
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
    expect(capture.hardReload).toHaveBeenCalledTimes(1)
  })

  it('self-heals after 3s when the worker never takes control', async () => {
    vi.useFakeTimers()
    capture.getRegistrations.mockResolvedValue([{ unregister: capture.unregister }])
    capture.cachesKeys.mockResolvedValue(['precache'])
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.hardReload).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(3000))
    // A plain reload risks re-serving the stale shell under the old worker;
    // the timeout nukes registrations and caches, then reloads busted.
    expect(capture.unregister).toHaveBeenCalledTimes(1)
    expect(capture.cachesDelete).toHaveBeenCalledWith('precache')
    expect(capture.hardReload).toHaveBeenCalledWith({ bustCache: true })
  })

  it('self-heals when a registration has no waiting or installing worker', async () => {
    // The frozen-page case: the worker already activated while we were away, so
    // there is nothing left to skip and no controllerchange will ever fire.
    vi.useFakeTimers()
    capture.getRegistration.mockResolvedValue({ waiting: null, installing: null })
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.hardReload).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(2999))
    expect(capture.hardReload).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(1))
    expect(capture.hardReload).toHaveBeenCalledWith({ bustCache: true })
  })

  it('cancels the 3s fallback once the new worker takes control', async () => {
    vi.useFakeTimers()
    await act(async () => pwaUpdate.reloadToUpdate())
    const onChange = capture.addEventListener.mock.calls.find(([type]) => type === 'controllerchange')?.[1]
    await act(async () => onChange())
    expect(capture.hardReload).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(3000))
    expect(capture.hardReload).toHaveBeenCalledTimes(1)
  })

  it('ignores a second tap while a reload is already in flight', async () => {
    await act(async () => pwaUpdate.reloadToUpdate())
    await act(async () => pwaUpdate.reloadToUpdate())
    expect(capture.getRegistration).toHaveBeenCalledTimes(1)
  })

  it('stamps the pending-update marker with the build being left', async () => {
    await act(async () => pwaUpdate.reloadToUpdate())
    // DAMP: literal key so a rename breaks this test on purpose.
    expect(localStorage.getItem('pwa-update-pending')).toBe(pwaUpdate.APP_BUILD)
  })
})

describe('runBuildHandshake', () => {
  const deps = () => ({
    writeBuild: vi.fn(),
    clearPending: vi.fn(),
    heal: vi.fn(),
  })

  it('records the build on first load and heals nothing', () => {
    const d = deps()
    pwaUpdate.runBuildHandshake(null, null, 'build-a', false, d)
    expect(d.writeBuild).toHaveBeenCalledTimes(1)
    expect(d.clearPending).not.toHaveBeenCalled()
    expect(d.heal).not.toHaveBeenCalled()
  })

  it('accepts a new build and clears the pending marker', () => {
    const d = deps()
    pwaUpdate.runBuildHandshake('build-a', 'build-a', 'build-b', false, d)
    expect(d.writeBuild).toHaveBeenCalledTimes(1)
    expect(d.clearPending).toHaveBeenCalledTimes(1)
    expect(d.heal).not.toHaveBeenCalled()
  })

  it('heals when the update reload re-served the same build', () => {
    const d = deps()
    pwaUpdate.runBuildHandshake('build-a', 'build-a', 'build-a', false, d)
    expect(d.heal).toHaveBeenCalledTimes(1)
    expect(d.writeBuild).not.toHaveBeenCalled()
  })

  it('does nothing on a normal reload with no pending update', () => {
    const d = deps()
    pwaUpdate.runBuildHandshake('build-a', null, 'build-a', false, d)
    expect(d.heal).not.toHaveBeenCalled()
    expect(d.writeBuild).not.toHaveBeenCalled()
    expect(d.clearPending).not.toHaveBeenCalled()
  })

  it('heals at most once per session', () => {
    const d = deps()
    pwaUpdate.runBuildHandshake('build-a', 'build-a', 'build-a', true, d)
    expect(d.heal).not.toHaveBeenCalled()
  })
})

describe('boot handshake', () => {
  it('self-heals on boot when the last update reload did not take', async () => {
    const build = pwaUpdate.APP_BUILD
    capture.getRegistrations.mockResolvedValue([{ unregister: capture.unregister }])
    capture.cachesKeys.mockResolvedValue(['precache'])
    // DAMP: literal keys so a rename breaks this test on purpose.
    localStorage.setItem('pwa-build', build)
    localStorage.setItem('pwa-update-pending', build)
    vi.resetModules()
    pwaUpdate = await import('./pwaUpdate')
    await vi.waitFor(() => expect(capture.hardReload).toHaveBeenCalledWith({ bustCache: true }))
    expect(capture.unregister).toHaveBeenCalledTimes(1)
    expect(capture.cachesDelete).toHaveBeenCalledWith('precache')
  })

  it('does not heal on a normal cold start', async () => {
    localStorage.setItem('pwa-build', pwaUpdate.APP_BUILD)
    vi.resetModules()
    pwaUpdate = await import('./pwaUpdate')
    // Deterministic: the boot heal path is microtask-driven (no timers), so
    // draining the queue proves no heal was scheduled — no real-time sleep.
    await act(async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    })
    expect(capture.getRegistrations).not.toHaveBeenCalled()
    expect(capture.hardReload).not.toHaveBeenCalled()
    expect(capture.unregister).not.toHaveBeenCalled()
  })

  it('survives disabled storage without breaking registration', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    try {
      vi.resetModules()
      pwaUpdate = await import('./pwaUpdate')
      expect(capture.opts).not.toBeNull()
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('selfHeal', () => {
  it('cleans up once per session but always reloads', async () => {
    // A later update attempt in the same tab must still reload after the
    // timeout — only the destructive cleanup is once-per-session.
    await act(async () => pwaUpdate.selfHeal())
    await act(async () => pwaUpdate.selfHeal())
    expect(capture.getRegistrations).toHaveBeenCalledTimes(1)
    expect(capture.hardReload).toHaveBeenCalledTimes(2)
    expect(capture.hardReload).toHaveBeenNthCalledWith(2, { bustCache: true })
  })

  it('still reloads busted when the nuke itself throws', async () => {
    capture.getRegistrations.mockRejectedValue(new Error('gone'))
    await act(async () => pwaUpdate.selfHeal())
    expect(capture.hardReload).toHaveBeenCalledWith({ bustCache: true })
  })

  it('cleans the caches even when an unregister rejects', async () => {
    capture.getRegistrations.mockResolvedValue([
      { unregister: vi.fn().mockRejectedValue(new Error('gone')) },
    ])
    capture.cachesKeys.mockResolvedValue(['precache'])
    await act(async () => pwaUpdate.selfHeal())
    expect(capture.cachesDelete).toHaveBeenCalledWith('precache')
    expect(capture.hardReload).toHaveBeenCalledWith({ bustCache: true })
  })

  it('keeps the cached shell and reloads plainly when offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
    try {
      await act(async () => pwaUpdate.selfHeal())
    } finally {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
    }
    // Deleting the precache offline would brick the installed app until the
    // network returns; the plain reload keeps the old shell usable.
    expect(capture.getRegistrations).not.toHaveBeenCalled()
    expect(capture.cachesKeys).not.toHaveBeenCalled()
    expect(capture.hardReload).toHaveBeenCalledWith()
  })
})

describe('update re-checks', () => {
  function setVisible(visible: boolean) {
    Object.defineProperty(document, 'visibilityState', {
      value: visible ? 'visible' : 'hidden',
      configurable: true,
    })
  }

  it('re-checks for updates when the page becomes visible', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    capture.opts?.onRegisteredSW?.('sw.js', { update } as unknown as ServiceWorkerRegistration)
    setVisible(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('debounces rapid re-checks', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    capture.opts?.onRegisteredSW?.('sw.js', { update } as unknown as ServiceWorkerRegistration)
    setVisible(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('re-checks when the browser comes back online', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    capture.opts?.onRegisteredSW?.('sw.js', { update } as unknown as ServiceWorkerRegistration)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('swallows update-check failures', async () => {
    const update = vi.fn().mockRejectedValue(new Error('offline'))
    capture.opts?.onRegisteredSW?.('sw.js', { update } as unknown as ServiceWorkerRegistration)
    setVisible(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(update).toHaveBeenCalledTimes(1)
    // No unhandled rejection: the test process reaching the end proves it.
  })

  it('does not let a failed check throttle the online retry', async () => {
    const update = vi.fn().mockRejectedValue(new Error('offline'))
    capture.opts?.onRegisteredSW?.('sw.js', { update } as unknown as ServiceWorkerRegistration)
    setVisible(true)
    // Separate flushes: the throttle reset runs in the rejection microtask,
    // so the online retry must dispatch after it has settled.
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('does nothing before the registration arrives', async () => {
    setVisible(true)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
    })
    expect(capture.hardReload).not.toHaveBeenCalled()
  })
})
