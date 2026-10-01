import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAutomatedBrowser, isPrerender } from './automation'

describe('isAutomatedBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is true when Playwright marks the browser as automated', () => {
    vi.stubGlobal('navigator', { webdriver: true })
    expect(isAutomatedBrowser()).toBe(true)
  })

  it('is false for a normal browser', () => {
    vi.stubGlobal('navigator', { webdriver: false })
    expect(isAutomatedBrowser()).toBe(false)
  })
})

describe('isPrerender', () => {
  afterEach(() => {
    delete (window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__
  })

  it('is true only when the prerender flag is set', () => {
    ;(window as unknown as { __PRERENDER__?: boolean }).__PRERENDER__ = true
    expect(isPrerender()).toBe(true)
  })

  it('is false otherwise', () => {
    expect(isPrerender()).toBe(false)
  })
})
