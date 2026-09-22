import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, beforeEach, vi } from 'vitest'
import { server } from './mocks/server'

// Git exports GIT_DIR (and friends) to hooks. Without this, a test that
// spawns git in a temp repo operates on the REAL repository whenever the
// suite runs from a hook (it clobbered refs and .git/config once). Drop these
// variables for the whole test process so every spawned git discovers its
// repo from the working directory. Test suites that spawn git still scrub
// defensively on their own.
for (const key of Object.keys(process.env)) {
  if (key.startsWith('GIT_')) delete process.env[key]
}

// jsdom cannot navigate (or download); blob-download helpers call
// anchor.click() on anchors with a download attribute, which jsdom turns into
// an unhandled "Not implemented: navigation" error at teardown. Suppress the
// default only for download anchors (match a real browser, where clicking a
// download link does not navigate) by dispatching a pre-cancelled click so
// listeners still fire. Non-download anchors keep their native click — a
// stray `element.click()` that would navigate is surfaced instead of masked.
const nativeAnchorClick = HTMLAnchorElement.prototype.click
HTMLAnchorElement.prototype.click = function click() {
  const isDownload = this.hasAttribute('download')
  if (!isDownload) {
    nativeAnchorClick.call(this)
    return
  }
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true })
  event.preventDefault()
  this.dispatchEvent(event)
}

// Node >= 25 defines a `localStorage` getter on the global that returns
// undefined unless `--localstorage-file` is set, shadowing jsdom's working
// one (vitest sets window === globalThis). Rebinding both storage types to
// jsdom's own instances keeps web storage usable in tests.
const jsdomWindow = window as Window & { _localStorage?: Storage; _sessionStorage?: Storage }
const localStorage = jsdomWindow._localStorage ?? jsdomWindow.localStorage
const sessionStorage = jsdomWindow._sessionStorage ?? jsdomWindow.sessionStorage
if (localStorage) {
  Object.defineProperty(globalThis, 'localStorage', { value: localStorage, configurable: true })
}
if (sessionStorage) {
  Object.defineProperty(globalThis, 'sessionStorage', { value: sessionStorage, configurable: true })
}

// jsdom has no ResizeObserver; components that re-anchor scroll on content
// growth (lazy images) construct one. Stub it out and keep instances reachable
// so tests can trigger the callback deterministically.
if (!(globalThis as any).ResizeObserver) {
  ;(globalThis as any).__resizeObservers = []
  class ResizeObserverMock {
    private cb: (entries: any[], observer: unknown) => void
    constructor(cb: (entries: any[], observer: unknown) => void) {
      this.cb = cb
      ;(globalThis as any).__resizeObservers.push(this)
    }
    observe() {
      // A real ResizeObserver delivers an initial observation as soon as it
      // starts observing; mirror that so tests exercise the "ignore the first
      // notification" path and later trigger() calls map to real changes.
      this.cb([], this)
    }
    unobserve() {}
    disconnect() {}
    trigger() {
      this.cb([], this)
    }
  }
  ;(globalThis as any).ResizeObserver = ResizeObserverMock
}

// jsdom has no matchMedia; the theme toggle reads it on mount. Default stub
// (light) so every test that renders the app header or login page is stable.
beforeEach(() => {
  window.scrollTo = () => {}
  if (!window.matchMedia) {
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
  }
})

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
import MarkdownImpl from '../components/MarkdownImpl'
vi.mock('../components/Markdown', () => ({ Markdown: MarkdownImpl }))
