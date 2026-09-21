import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve(process.cwd(), 'scripts/git/check-types-staged.sh')

// Spawned git must never inherit a redirected repository environment
// (GIT_DIR and friends leak in from IDEs, wrappers, and hooks): without
// this, temp-repo commands can commit into — or read — the wrong repo.
function cleanEnv(): NodeJS.ProcessEnv {
  const {
    GIT_DIR: _dir,
    GIT_WORK_TREE: _tree,
    GIT_CEILING_DIRECTORIES: _ceil,
    GIT_COMMON_DIR: _common,
    ...rest
  } = process.env
  return rest
}

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r
}

function write(cwd: string, rel: string, body = '-- x\n') {
  const path = join(cwd, rel)
  mkdirSync(join(cwd, rel.split('/').slice(0, -1).join('/')), { recursive: true })
  writeFileSync(path, body, 'utf8')
}

describe('scripts/git/check-types-staged', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'types-staged-'))
    git(dir, 'init', '-q')
    git(dir, 'config', 'user.email', 't@t')
    git(dir, 'config', 'user.name', 't')
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'init')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function run() {
    return spawnSync('sh', [script], { cwd: dir, encoding: 'utf8', env: cleanEnv() })
  }

  // Diagnostics ride along on failure: a guard that exits 0 spuriously
  // would silently bless a bad commit, so any mismatch must show exactly
  // what the script saw.
  function stagedNow(): string {
    return spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: dir, encoding: 'utf8' }).stdout as string
  }

  it('passes when nothing migration-related is staged', () => {
    write(dir, 'src/app.ts')
    git(dir, 'add', 'src/app.ts')
    expect(run().status).toBe(0)
  })

  it('blocks a staged migration without staged types', () => {
    write(dir, 'supabase/migrations/20260000000000_x.sql')
    git(dir, 'add', 'supabase/migrations/20260000000000_x.sql')
    const r = run()
    const diag = `status=${r.status} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)} staged=${JSON.stringify(stagedNow())}`
    expect(r.status, diag).toBe(1)
    expect(r.stderr).toContain('src/types/database.ts')
  })

  it('passes when the regenerated types ride along', () => {
    write(dir, 'supabase/migrations/20260000000000_x.sql')
    write(dir, 'src/types/database.ts')
    git(dir, 'add', 'supabase/migrations/20260000000000_x.sql', 'src/types/database.ts')
    expect(run().status).toBe(0)
  })

  it('passes for a types-only commit', () => {
    write(dir, 'src/types/database.ts')
    git(dir, 'add', 'src/types/database.ts')
    expect(run().status).toBe(0)
  })

  it('ignores a redirected git environment', () => {
    // Regression test: GIT_DIR (leaked by IDEs/wrappers/hooks) once made
    // these temp-repo commands commit into the real repo. The helper must
    // scrub it so the guard can neither pollute nor read the wrong repo.
    process.env.GIT_DIR = join(dir, 'bogus.git')
    try {
      write(dir, 'supabase/migrations/20260000000000_x.sql')
      git(dir, 'add', 'supabase/migrations/20260000000000_x.sql')
      const r = run()
      const diag = `status=${r.status} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)} staged=${JSON.stringify(stagedNow())}`
      expect(r.status, diag).toBe(1)
    } finally {
      delete process.env.GIT_DIR
    }
  })
})
