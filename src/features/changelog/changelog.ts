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

// Entries about the Server Admin console end with this marker and are
// stripped from everything players see (What's New modal and /changelog
// page). HTML comments never render (no rehype-raw), so the tag is invisible
// in every other view of the file, and the history stays intact.
export const ADMIN_ONLY_MARKER = '<!-- admin-only -->'

export function stripAdminEntries(raw: string): string {
  // Pass 1: drop tagged entry lines (entries are one `- ` line each; the
  // marker must close the line so an entry merely describing the tag stays).
  const kept = raw
    .split(/\r?\n/)
    .filter((line) => !(line.startsWith('- ') && line.trimEnd().endsWith(ADMIN_ONLY_MARKER)))
  // Pass 2: drop date/section headers left with nothing under them. A `###`
  // header survives only with an entry before the next header; a `##`
  // header survives only with an entry before the next `##` (skipping over
  // its own `###` sub-headers).
  const hasItemBefore = (from: number, stop: RegExp) => {
    for (let j = from; j < kept.length; j++) {
      if (stop.test(kept[j])) return false
      if (kept[j].startsWith('- ')) return true
    }
    return false
  }
  const out: string[] = []
  for (let i = 0; i < kept.length; i++) {
    const line = kept[i]
    if (line.startsWith('### ')) {
      if (!hasItemBefore(i + 1, /^#{1,3} /)) continue
    } else if (line.startsWith('## ')) {
      if (!hasItemBefore(i + 1, /^#{1,2} /)) continue
    }
    out.push(line)
  }
  return out.join('\n')
}

// The player-facing markdown: modal, /changelog page, and the seen-hash all
// read this, so an admin-only edit never re-shows the What's New modal.
export function getPlayerChangelogMarkdown(): string {
  return stripAdminEntries(CHANGELOG_RAW)
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
  return parseChangelog(getPlayerChangelogMarkdown()).slice(0, count)
}

export function getChangelogHash(): string {
  return fnv1a(getPlayerChangelogMarkdown())
}

export function getChangelogMarkdown(): string {
  return getPlayerChangelogMarkdown()
}
