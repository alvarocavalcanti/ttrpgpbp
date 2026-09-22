import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve(process.cwd(), 'scripts/git/check-types-staged.sh')

// Spawned git must never inherit a redirected repository environment
// (GIT_DIR and friends leak in from IDEs, wrappers, and hooks): without
// this, temp-repo commands can commit into — or read — the wrong repo.
// NOTE: GIT_INDEX_FILE is scrubbed here (test isolation) but deliberately
// NOT in the guard script — git points the pre-commit hook at the index
// being committed, and the guard must inspect that same index.
function cleanEnv(): NodeJS.ProcessEnv {
  const {
    GIT_DIR: _dir,
    GIT_WORK_TREE: _tree,
    GIT_CEILING_DIRECTORIES: _ceil,
    GIT_COMMON_DIR: _common,
    GIT_INDEX_FILE: _index,
    GIT_OBJECT_DIRECTORY: _objects,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: _alternates,
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

  function run(overrides: NodeJS.ProcessEnv = {}) {
    // Poison (if any) is layered over the scrubbed base and reaches ONLY
    // the guard script: git() and stagedNow() always run clean, so the
    // tests prove the guard tolerates redirection rather than proving the
    // helper scrubs. GIT_INDEX_FILE is never passed: the guard must
    // preserve the commit index.
    return spawnSync('sh', [script], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...cleanEnv(), ...overrides },
    })
  }

  // Diagnostics ride along on failure: a guard that exits 0 spuriously
  // would silently bless a bad commit, so any mismatch must show exactly
  // what the script saw.
  function stagedNow(): string {
    return spawnSync('git', ['diff', '--cached', '--name-only'], { cwd: dir, encoding: 'utf8', env: cleanEnv() }).stdout as string
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

  it('ignores a redirected git directory', () => {
    // The poison reaches the guard script itself (not a scrubbed helper),
    // proving the guard's own unset list neutralizes it.
    write(dir, 'supabase/migrations/20260000000000_x.sql')
    git(dir, 'add', 'supabase/migrations/20260000000000_x.sql')
    const r = run({ GIT_DIR: join(dir, 'bogus.git') })
    const diag = `status=${r.status} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)} staged=${JSON.stringify(stagedNow())}`
    expect(r.status, diag).toBe(1)
  })

  it('ignores redirected object directories', () => {
    // Same proof for object lookup: with the guard fix, an empty object
    // dir cannot blind the diff; without it, git fails and the guard
    // exits 2 instead of blocking with 1.
    const emptyDir = mkdtempSync(join(tmpdir(), 'types-staged-empty-'))
    try {
      write(dir, 'supabase/migrations/20260000000000_x.sql')
      git(dir, 'add', 'supabase/migrations/20260000000000_x.sql')
      const r = run({
        GIT_OBJECT_DIRECTORY: join(emptyDir, 'objects'),
        GIT_ALTERNATE_OBJECT_DIRECTORIES: join(emptyDir, 'alternates'),
      })
      const diag = `status=${r.status} stdout=${JSON.stringify(r.stdout)} stderr=${JSON.stringify(r.stderr)} staged=${JSON.stringify(stagedNow())}`
      expect(r.status, diag).toBe(1)
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})
