import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { HELP_TOPICS } from './publicRoutes'

// Drift guard (issue #644): HELP_TOPICS is the SEO registry for /help/<slug>.
// If a guide is added or removed without updating it, that help page either
// 404s in production or is never prerendered/indexed. This test fails CI.
function docSlugs(dir: string): string[] {
  return readdirSync(join(process.cwd(), 'docs', 'help', dir))
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replace(/\.md$/, ''))
}

describe('HELP_TOPICS', () => {
  it('covers every markdown guide exactly once', () => {
    const docs = [...docSlugs('general'), ...docSlugs('channel')].sort()
    const registered = HELP_TOPICS.map((topic) => topic.slug).sort()
    expect(registered).toEqual(docs)
  })

  it('gives every topic a unique slug, title, and description', () => {
    expect(new Set(HELP_TOPICS.map((topic) => topic.slug)).size).toBe(HELP_TOPICS.length)
    expect(new Set(HELP_TOPICS.map((topic) => topic.title)).size).toBe(HELP_TOPICS.length)
    for (const topic of HELP_TOPICS) {
      expect(topic.title.length).toBeGreaterThan(0)
      expect(topic.description.length).toBeGreaterThan(0)
    }
  })
})
