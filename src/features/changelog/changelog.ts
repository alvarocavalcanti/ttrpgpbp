export interface ChangelogItem {
  version: string
  section: string
  title: string
  body: string
}

const changelogModules = import.meta.glob('/docs/CHANGELOG.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const CHANGELOG_RAW: string = changelogModules['/docs/CHANGELOG.md'] ?? ''

// FNV-1a: tiny, deterministic hash so the "seen" marker in localStorage can be
// the changelog content itself — no manual version bump on release.
// ponytail: hashes the whole file, not just the top section; a typo fix in an
// old entry re-shows the modal, which is harmless and simpler.
export function fnv1a(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export function parseChangelog(raw: string): ChangelogItem[] {
  const items: ChangelogItem[] = []
  let version = ''
  let section = ''
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('### ')) {
      section = line.slice(4).trim()
    } else if (line.startsWith('## ')) {
      version = line.slice(3).trim()
      section = ''
    } else if (line.startsWith('- ')) {
      const text = line.slice(2).trim()
      const match = /^\*\*(.+?)\*\*\s*—\s*(.*)$/.exec(text)
      items.push({
        version,
        section,
        title: match ? match[1] : text,
        body: match ? match[2] : ''
      })
    }
  }
  return items
}

export function getRecentItems(count: number): ChangelogItem[] {
  return parseChangelog(CHANGELOG_RAW).slice(0, count)
}

export function getChangelogHash(): string {
  return fnv1a(CHANGELOG_RAW)
}

export function getChangelogMarkdown(): string {
  return CHANGELOG_RAW
}
