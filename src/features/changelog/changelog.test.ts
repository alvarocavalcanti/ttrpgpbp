import { describe, it, expect } from 'vitest'
import { parseChangelog, fnv1a, getRecentItems, getChangelogHash, getChangelogMarkdown, getPlayerChangelogMarkdown, stripAdminEntries, CHANGELOG_RAW } from './changelog'

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

  it('splits an entry that carries an italic marker between the title and the dash', () => {
    // The marker belongs to the entry, not the title: the whole line used to
    // land in the title, and the What's New modal printed the asterisks.
    const items = parseChangelog('- **Remove a player\'s portrait** *(for GMs)* — the **⋯** menu has **Remove Portrait**.')
    expect(items[0].title).toBe("Remove a player's portrait")
    expect(items[0].body).toBe('*(for GMs)* the **⋯** menu has **Remove Portrait**.')
  })

  it('ignores non-bullet lines', () => {
    const items = parseChangelog('## [Unreleased]\n\nintro text\n\n- **X** — y\n')
    expect(items).toHaveLength(1)
  })
})

describe('stripAdminEntries', () => {
  const tagged = `# Changelog

## 2026-10-13

### Added

- **Player feature** — everyone sees this.
- **Admin card** — only admins see this. <!-- admin-only -->

## 2026-09-19

### Added

- **Admin-only section** — the whole section is admin-only. <!-- admin-only -->
`

  it('drops tagged entries and keeps the rest', () => {
    const stripped = stripAdminEntries(tagged)
    expect(stripped).toContain('Player feature')
    expect(stripped).not.toContain('Admin card')
    expect(stripped).not.toContain('admin-only')
  })

  it('drops date and section headers left with nothing under them', () => {
    const stripped = stripAdminEntries(tagged)
    expect(stripped).not.toContain('2026-09-19')
    expect(stripped).toContain('2026-10-13')
    expect(stripped).toContain('### Added')
  })

  it('an admin-only addition leaves the stripped output unchanged', () => {
    const withExtra = `${tagged}- **Another admin thing** — hidden too. <!-- admin-only -->\n`
    expect(stripAdminEntries(withExtra)).toBe(stripAdminEntries(tagged))
  })

  it('keeps an entry that merely mentions the marker mid-line', () => {
    const raw = '- **Tag docs** — end lines with <!-- admin-only --> to hide them.\n'
    expect(stripAdminEntries(raw)).toContain('Tag docs')
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
  it('splits every entry in the real changelog into a title and a body', () => {
    // The What's New modal renders the title as a heading and the body as
    // markdown. An entry the parser cannot split ends up as one raw line with
    // its asterisks visible, so every entry has to carry both parts.
    const items = parseChangelog(CHANGELOG_RAW)
    const broken = items.filter(item => !item.body || item.title.includes('*'))
    expect(broken.map(item => item.title.slice(0, 60))).toEqual([])
  })

  it('getRecentItems returns the 5 most recent items from the real changelog', () => {
    const items = getRecentItems(5)
    expect(items).toHaveLength(5)
    // Newest entry at the top of the file leads the list: the first item
    // belongs to the player-facing markdown's first dated section, whatever
    // that date is.
    const firstHeading = getPlayerChangelogMarkdown().split('\n').find((line) => line.startsWith('## '))
    expect(items[0].version).toBe(firstHeading?.slice(3).trim())
  })

  it('hides admin-only entries from the player-facing markdown and items', () => {
    // DAMP literals: tagged in docs/CHANGELOG.md, so players never see them.
    expect(getPlayerChangelogMarkdown()).not.toContain('See which tables are alive')
    expect(getPlayerChangelogMarkdown()).not.toContain('admin-only')
    expect(getPlayerChangelogMarkdown()).toContain('Format while you type')
    // 2026-09-19 held only an admin entry, so the whole date is gone.
    expect(getPlayerChangelogMarkdown()).not.toContain('## 2026-09-19')
    const titles = getRecentItems(50).map((i) => `${i.title} ${i.body}`)
    expect(titles.some((t) => t.includes('Server Admin console has a new **Reports** tab'))).toBe(false)
  })

  it('getChangelogHash is a non-empty string', () => {
    expect(getChangelogHash()).toBeTruthy()
  })

  it('getChangelogMarkdown returns the player-facing markdown', () => {
    expect(getChangelogMarkdown()).toContain('# Changelog')
    expect(getChangelogMarkdown()).not.toContain('admin-only')
  })

  it('keeps the changelog free of developer jargon (the What\'s New modal is player-facing)', () => {
    const items = parseChangelog(getPlayerChangelogMarkdown())
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
