import { describe, it, expect } from 'vitest'
import { getGeneralHelp, getChannelHelp, parseFrontmatter } from './helpContent'

describe('getGeneralHelp', () => {
  it('returns general help entries with slug, title and content', () => {
    const entries = getGeneralHelp()
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      expect(entry.slug).toBeTruthy()
      expect(entry.title).toBeTruthy()
      expect(entry.content.length).toBeGreaterThan(0)
    }
  })

  it('sorts entries alphabetically by title', () => {
    const entries = getGeneralHelp()
    const titles = entries.map((e) => e.title)
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)))
  })

  it('includes a screenshot field only for entries that declare one', () => {
    const entries = getGeneralHelp()
    const screenshotSlugs = entries.filter((e) => e.screenshot).map((e) => e.slug)
    expect(screenshotSlugs).toEqual(expect.arrayContaining(['dice-rolling', 'npcs', 'safety-tools']))
  })
})

describe('getChannelHelp', () => {
  it('returns channel help entries', () => {
    const entries = getChannelHelp()
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.slug && e.title && e.content)).toBe(true)
  })
})

describe('parseFrontmatter', () => {
  it('parses title and screenshot from frontmatter', () => {
    const raw = '---\ntitle: Dice Rolling\nscreenshot: /help/dice.png\n---\n\n## Body\n\ncontent here'
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter.title).toBe('Dice Rolling')
    expect(frontmatter.screenshot).toBe('/help/dice.png')
    expect(body).toContain('## Body')
    expect(body).toContain('content here')
  })

  it('returns raw body when no frontmatter present', () => {
    const raw = '## Plain\n\nno frontmatter'
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter).toEqual({})
    expect(body).toBe(raw)
  })

  it('handles missing screenshot field', () => {
    const raw = '---\ntitle: Search\n---\n\nbody'
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter.title).toBe('Search')
    expect(frontmatter.screenshot).toBeUndefined()
    expect(body).toBe('body')
  })

  it('returns raw body for unclosed frontmatter', () => {
    const raw = '---\ntitle: Unclosed\n\nbody never separated'
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter).toEqual({})
    expect(body).toBe(raw)
  })
})
