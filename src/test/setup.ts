import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { server } from './mocks/server'

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

// jsdom has no matchMedia; the theme toggle reads it on mount. Default stub
// (light) so every test that renders the app header or login page is stable.
beforeEach(() => {
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
