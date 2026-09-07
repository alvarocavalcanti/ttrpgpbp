import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Regression guard for the semantic-token migration (#444). These files were
// migrated to the `primary`/`surface` palette (tailwind.config.js maps them to
// indigo/gray); raw color tokens here would reintroduce the drift the audit
// called out. Same readFileSync shape as index.css.test.ts.
const MIGRATED_FILES = [
  'components/TextPromptSheet.tsx',
  'features/admin/AdminView.tsx',
  'features/auth/ProfileSettings.tsx',
  'features/channels/ChannelSettings.tsx',
  'features/channels/ChannelStatusBar.tsx',
  'features/channels/Lobby.tsx',
  'features/channels/MemberList.tsx',
  'features/chat/composerChip.ts',
]

describe('token adoption', () => {
  it.each(MIGRATED_FILES)('%s has no raw indigo/gray color tokens', (file) => {
    const source = readFileSync(resolve(import.meta.dirname, file), 'utf8')
    expect(source).not.toMatch(/\b(?:indigo|gray)-\d/)
  })
})
