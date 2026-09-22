import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve(process.cwd(), 'scripts/git/check-migration-order.sh')
const dirs: string[] = []

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function commit(cwd: string, message: string): string {
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '-q', '-m', message)
  return git(cwd, 'rev-parse', 'HEAD')
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'migration-order-'))
  dirs.push(dir)
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(dir, 'supabase/migrations'), { recursive: true })
  return dir
}

function writeMigration(dir: string, name: string, content = '-- migration\n'): void {
  writeFileSync(join(dir, 'supabase/migrations', name), content)
}

function run(dir: string, baseRef: string) {
  return spawnSync('sh', [script, baseRef], { cwd: dir, encoding: 'utf8' })
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('check-migration-order.sh', () => {
  it('accepts a new migration that sorts after the base', () => {
    const dir = makeRepo()
    writeMigration(dir, '20260921190433_base.sql')
    const base = commit(dir, 'base')
    writeMigration(dir, '20260922190814_new.sql')
    commit(dir, 'new migration')

    const result = run(dir, base)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('sorts after')
  })

  it('rejects a new migration that sorts before the base latest', () => {
    const dir = makeRepo()
    writeMigration(dir, '20260921190433_base.sql')
    const base = commit(dir, 'base')
    writeMigration(dir, '20260921172949_stale.sql')
    commit(dir, 'stale migration')

    const result = run(dir, base)
    expect(result.status).toBe(1)
    expect(result.stdout).toContain('20260921172949')
    expect(result.stderr).toContain('out-of-order')
  })

  it('accepts renaming an unapplied migration to a newer timestamp', () => {
    const dir = makeRepo()
    writeMigration(dir, '20260921171131_old.sql')
    writeMigration(dir, '20260921190433_base.sql')
    const base = commit(dir, 'base')
    git(
      dir,
      'mv',
      'supabase/migrations/20260921171131_old.sql',
      'supabase/migrations/20260922190814_old.sql',
    )
    commit(dir, 'rename to newest')

    const result = run(dir, base)
    expect(result.status).toBe(0)
  })

  it('passes when the branch adds no migration', () => {
    const dir = makeRepo()
    writeMigration(dir, '20260921190433_base.sql')
    const base = commit(dir, 'base')
    writeFileSync(join(dir, 'README.md'), 'docs only\n')
    commit(dir, 'docs')

    const result = run(dir, base)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('no new migrations')
  })

  it('skips when the base ref cannot be resolved', () => {
    const dir = makeRepo()
    writeMigration(dir, '20260921190433_base.sql')
    commit(dir, 'base')

    const result = run(dir, 'origin/does-not-exist')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('not found')
  })
})
