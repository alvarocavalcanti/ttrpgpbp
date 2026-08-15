import '@testing-library/jest-dom'
import { beforeAll, afterEach, afterAll, beforeEach } from 'vitest'
import { server } from './mocks/server'

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
