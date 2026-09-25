import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Regression guard for the semantic-token migration (#444). The old guard
// asserted an explicit MIGRATED_FILES list stayed clean — a blocklist of past
// offenders that new files escaped (ChannelMediaPanel, AdminChannelView,
// LoginPage) and that could not see corrupted-but-unmatched tokens at all
// (TextPromptSheet's U+0008 backspace bytes, issue #561).
//
// This guard is a ratchet instead: it globs every non-test source file and
// asserts the set of files still carrying raw `indigo-*`/`gray-*` tokens is
// exactly RAW_TOKEN_ALLOWLIST — frozen debt, not endorsement. A new offender
// fails the test; migrating a listed file requires deleting its line, and a
// listed-but-now-clean file fails until the line is removed.
const SRC_ROOT = resolve(import.meta.dirname)

function listSourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(full)
      }
    }
  }
  walk(SRC_ROOT)
  return out
}

function readSource(full: string): { rel: string; source: string } {
  return { rel: full.slice(SRC_ROOT.length + 1), source: readFileSync(full, 'utf8') }
}

const RAW_TOKEN_RE = /\b(?:indigo|gray)-\d/
// Non-printable control bytes in source are corruption, never intent
// (TextPromptSheet shipped U+0008 inside class names in PR #452). Tab, LF
// and CR are legitimate whitespace and stay allowed. Written as numeric code
// comparisons — never as regex escapes — so this guard file itself can carry
// no literal control bytes.
function hasControlByte(source: string): boolean {
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i)
    if (code === 0x09 || code === 0x0a || code === 0x0d) continue
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

const RAW_TOKEN_ALLOWLIST = [
  'components/BottomSheet.tsx',
  'components/ConfirmDialog.tsx',
  'components/ErrorBoundary.tsx',
  'components/Markdown.tsx',
  'components/Menu.tsx',
  'components/ModifierInput.tsx',
  'components/ProtectedRoute.tsx',
  'components/PwaInstallBanner.tsx',
  'components/PwaUpdateBanner.tsx',
  'components/ThemeToggle.tsx',
  'contexts/ToastContext.tsx',
  'features/admin-messages/AdminMessagesView.tsx',
  'features/admin-messages/ThreadDetail.tsx',
  'features/admin-messages/ThreadList.tsx',
  'features/auth/AboutPage.tsx',
  'features/auth/PrivacyPage.tsx',
  'features/auth/TermsPage.tsx',
  'features/changelog/ChangelogModal.tsx',
  'features/channels/ActivePlayerModal.tsx',
  'features/channels/ArchivedChannels.tsx',
  'features/channels/CreateChannelModal.tsx',
  'features/channels/EditCharacterModal.tsx',
  'features/channels/JoinChannel.tsx',
  'features/channels/NpcManagementModal.tsx',
  'features/channels/SafetyToolsModal.tsx',
  'features/chat/EmojiPicker.tsx',
  'features/chat/IconPicker.tsx',
  'features/chat/MessageComposer.tsx',
  'features/dice/DiceRoller.tsx',
  'features/dice/RollHistoryModal.tsx',
  'features/help/ChannelHelpModal.tsx',
  'features/help/HelpPage.tsx',
  'features/notifications/ChannelNotificationSettingsModal.tsx',
  'features/notifications/PermissionBanner.tsx',
  'features/search/SearchModal.tsx',
]

describe('token adoption', () => {
  it('no non-test source file carries raw indigo/gray tokens outside the frozen allowlist', () => {
    const dirty = listSourceFiles()
      .map(readSource)
      .filter(({ source }) => RAW_TOKEN_RE.test(source))
      .map(({ rel }) => rel)
      .sort()
    expect(dirty).toEqual([...RAW_TOKEN_ALLOWLIST].sort())
  })

  it('no source file contains non-printable control characters', () => {
    const corrupted = listSourceFiles()
      .map(readSource)
      .filter(({ source }) => hasControlByte(source))
      .map(({ rel }) => rel)
    expect(corrupted).toEqual([])
  })

  // Regression guard for the 2026-09-25 audit (UX P1-2): a `display:none` file
  // input inside a label can never receive focus, so keyboard-only users cannot
  // reach the file picker. Visually-hidden inputs must use `sr-only`, which
  // stays focusable.
  it('no file input is display:none', () => {
    const offenders = listSourceFiles()
      .map((full) => {
        const { rel, source } = readSource(full)
        const inputs = source.match(/<input\b[^>]*type="file"[^>]*>/g) ?? []
        return { rel, hidden: inputs.filter(i => /className="[^"]*\bhidden\b/.test(i)) }
      })
      .filter(({ hidden }) => hidden.length > 0)
      .map(({ rel }) => rel)
    expect(offenders).toEqual([])
  })
})
