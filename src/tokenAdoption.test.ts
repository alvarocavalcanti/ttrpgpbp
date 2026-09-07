import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Audit #432 item 18 (P2.5): these files are migrated to semantic tokens
// (primary = indigo, surface = gray — tailwind.config.js:28-29). The regex
// guard keeps raw indigo-*/gray-* classes from creeping back in; a future
// contrast sweep like P2.2 then touches the config once, not five files.
const migratedFiles = [
  'components/TextPromptSheet.tsx',
  'features/admin/AdminView.tsx',
  'features/auth/ProfileSettings.tsx',
  'features/channels/ChannelSettings.tsx',
  'features/channels/Lobby.tsx',
  'features/channels/MemberList.tsx',
]

describe('semantic token adoption (#432 item 18)', () => {
  it.each(migratedFiles)('has no raw indigo-/gray- tokens in %s', (rel) => {
    const src = readFileSync(resolve(import.meta.dirname, rel), 'utf8')
    expect(src).not.toMatch(/\b(?:indigo|gray)-\d+/)
  })
})
