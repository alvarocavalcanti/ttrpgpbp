import { describe, it, expect } from 'vitest'
import { isMarketingPath } from './marketing'

describe('isMarketingPath', () => {
  it('matches the features page with and without trailing slash', () => {
    expect(isMarketingPath('/features')).toBe(true)
    expect(isMarketingPath('/features/')).toBe(true)
  })

  it('rejects app, sibling, and lookalike routes', () => {
    expect(isMarketingPath('/')).toBe(false)
    expect(isMarketingPath('/features-extra')).toBe(false)
    expect(isMarketingPath('/features/x')).toBe(false)
    expect(isMarketingPath('/channel/abc')).toBe(false)
    expect(isMarketingPath('/changelog')).toBe(false)
  })
})
