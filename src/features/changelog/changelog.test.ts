import { describe, it, expect } from 'vitest'
import { parseChangelog, fnv1a, getRecentItems, getChangelogHash, getChangelogMarkdown, CHANGELOG_RAW } from './changelog'

const sample = `# Changelog

## [Unreleased]

### Added

- **Feature A** — the first feature.
- **Feature B** — the second feature.

### Fixed

- **Bug fix** — a fixed bug.
`

describe('parseChangelog', () => {
  it('parses bullets with title and body', () => {
    const items = parseChangelog(sample)
    expect(items[0]).toEqual({
      version: '[Unreleased]',
      section: 'Added',
      title: 'Feature A',
      body: 'the first feature.',
    })
    expect(items[1].title).toBe('Feature B')
    expect(items[2]).toEqual({
      version: '[Unreleased]',
      section: 'Fixed',
      title: 'Bug fix',
      body: 'a fixed bug.',
    })
  })

  it('tracks version and section for each item', () => {
    const items = parseChangelog(sample)
    expect(items.every((i) => i.version === '[Unreleased]')).toBe(true)
    expect(items.map((i) => i.section)).toEqual(['Added', 'Added', 'Fixed'])
  })

  it('handles bullets without a bold title', () => {
    const items = parseChangelog('- plain bullet without title')
    expect(items[0].title).toBe('plain bullet without title')
    expect(items[0].body).toBe('')
  })

  it('ignores non-bullet lines', () => {
    const items = parseChangelog('## [Unreleased]\n\nintro text\n\n- **X** — y\n')
    expect(items).toHaveLength(1)
  })
})

describe('fnv1a', () => {
  it('is deterministic for identical input', () => {
    expect(fnv1a('hello')).toBe(fnv1a('hello'))
  })

  it('differs for different input', () => {
    expect(fnv1a('hello')).not.toBe(fnv1a('hello!'))
  })
})

describe('changelog module', () => {
  it('getRecentItems returns the 5 most recent items from the real changelog', () => {
    const items = getRecentItems(5)
    expect(items).toHaveLength(5)
    expect(items[0].title).toBe('Standalone active-player control (GM-only)')
  })

  it('getChangelogHash is a non-empty string', () => {
    expect(getChangelogHash()).toBeTruthy()
  })

  it('getChangelogMarkdown returns the raw markdown', () => {
    expect(getChangelogMarkdown()).toContain('# Changelog')
  })

  it('keeps the changelog free of developer jargon (the What\'s New modal is player-facing)', () => {
    const items = parseChangelog(CHANGELOG_RAW)
    const jargon = [
      /\bRLS\b/i, /PostgREST/i, /PGRST/, /SECURITY DEFINER/i, /app_settings/,
      /edge function/i, /\bRPC\b/i, /is_public/, /safety_card_events/i,
      /push_delivery_log/i, /push_invocation_log/i, /retry_failed_push_invocations/,
      /supabase storage/i, /CHECK constraint/i, /manifest\.json/i, /VAPID/i,
    ]
    for (const item of items) {
      for (const term of jargon) {
        expect(`${item.title} ${item.body}`).not.toMatch(term)
      }
    }
  })
})
