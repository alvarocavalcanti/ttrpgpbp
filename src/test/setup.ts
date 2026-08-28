import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, beforeEach, vi } from 'vitest'
import { server } from './mocks/server'

// jsdom cannot navigate (or download); blob-download helpers call
// anchor.click(), which jsdom turns into an unhandled
// "Not implemented: navigation" error at teardown. Suppress the default
// (navigation) while still notifying listeners: dispatch a click whose
// canceled flag is already set, mirroring what clicking a download anchor does
// in a real browser. Event-path clicks (react-router <Link> etc.) dispatch
// through fireEvent/click() and are unaffected.
HTMLAnchorElement.prototype.click = function click() {
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
    observe() {}
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
