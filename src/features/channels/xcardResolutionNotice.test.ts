import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The resolution copy is fixed server-side inside the migration (client
// INSERTs of 'system' messages are RLS-blocked, so the RPC owns the copy).
// These assertions pin the exact player-friendly wording and the
// anonymity guarantees against accidental edits.
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../../supabase/migrations')
const migrationSql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('_xcard_resolution_system_message.sql'))
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n')

describe('xcard resolution system message migration', () => {
  it('posts the exact player-friendly copy', () => {
    expect(migrationSql).toContain(
      'A flagged scene has been resolved. Carry on — the X-Card is always there if you need it again.'
    )
  })

  it('inserts an anonymous system message (no sender identity, no whisper)', () => {
    // sender_id NULL + type 'system': neither the presser nor the resolving
    // GM may be identifiable from the rendered message.
    expect(migrationSql).toMatch(/NULL,\s*\n\s*'system',\s*\n\s*'A flagged scene/)
    expect(migrationSql).not.toMatch(/whisper_to/)
  })

  it('gates the RPC on the channel GM', () => {
    expect(migrationSql).toContain('is_channel_gm(p_channel_id)')
  })
})
