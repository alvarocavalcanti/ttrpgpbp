import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const runScript = resolve(process.cwd(), 'scripts/usage-report/run.sh')

function writeFile(path: string, body: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, body, 'utf8')
}

describe('scripts/usage-report/run.sh', () => {
  let dir: string
  let worktree: string
  let primary: string
  let bin: string
  let home: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'usage-report-'))
    worktree = join(dir, 'worktree')
    primary = join(dir, 'primary')
    bin = join(dir, 'bin')
    home = join(dir, 'home')
    for (const d of [worktree, primary, bin, home]) mkdirSync(d, { recursive: true })

    // Stub `git` so the script sees a controlled worktree layout without a
    // real repository: rev-parse reports the current worktree, worktree list
    // reports the primary checkout.
    const git = join(bin, 'git')
    writeFileSync(
      git,
      [
        '#!/bin/sh',
        'case "$*" in',
        '  "rev-parse --show-toplevel") printf \'%s\\n\' "${STUB_ROOT}"; exit 0 ;;',
        '  "worktree list --porcelain") printf \'worktree %s\\n\' "${STUB_MAIN}"; exit 0 ;;',
        'esac',
        'exit 0',
      ].join('\n'),
      'utf8',
    )
    chmodSync(git, 0o755)
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function run(args: string[] = [], env: Record<string, string> = {}) {
    return spawnSync('sh', [runScript, ...args], {
      cwd: worktree,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        HOME: home,
        STUB_ROOT: worktree,
        STUB_MAIN: primary,
        ...env,
      },
    })
  }

  it('resolves the ref and token from the local files, never printing the token', () => {
    writeFile(join(worktree, '.env'), 'SUPABASE_ACCESS_TOKEN=sbp_local_token\n')
    writeFile(join(worktree, 'supabase/.temp/linked-project.json'), '{"ref":"ref-local"}')
    // The primary checkout disagrees — local files must win.
    writeFile(join(primary, '.env'), 'SUPABASE_ACCESS_TOKEN=sbp_primary_token\n')
    writeFile(join(primary, 'supabase/.temp/linked-project.json'), '{"ref":"ref-primary"}')

    const r = run(['--resolve-only'])

    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ref=ref-local')
    expect(r.stdout).toContain('token=present (15 chars)')
    expect(r.stdout).not.toContain('sbp_local_token')
  })

  it('lets env vars override the files', () => {
    writeFile(join(worktree, '.env'), 'SUPABASE_ACCESS_TOKEN=sbp_file_token\n')
    writeFile(join(worktree, 'supabase/.temp/linked-project.json'), '{"ref":"ref-file"}')

    const r = run(['--resolve-only'], {
      SUPABASE_ACCESS_TOKEN: 'sbp_env',
      SUPABASE_PROJECT_REF: 'ref-env',
    })

    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ref=ref-env')
    expect(r.stdout).toContain('token=present (7 chars)')
    expect(r.stdout).not.toContain('sbp_env')
  })

  it('self-heals from the primary worktree when the checkout has no files', () => {
    // worktree is empty; primary holds both sources.
    writeFile(join(primary, '.env'), 'SUPABASE_ACCESS_TOKEN=sbp_primary_token\n')
    writeFile(join(primary, 'supabase/.temp/linked-project.json'), '{"ref":"ref-primary"}')

    const r = run(['--resolve-only'])

    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ref=ref-primary')
    expect(r.stdout).toContain('token=present (17 chars)')
  })

  it('strips surrounding quotes from .env values', () => {
    writeFile(join(worktree, '.env'), 'SUPABASE_ACCESS_TOKEN="sbp_quoted"\n')
    writeFile(join(worktree, 'supabase/.temp/linked-project.json'), '{"ref":"ref-q"}')

    const r = run(['--resolve-only'])

    expect(r.status).toBe(0)
    expect(r.stdout).toContain('token=present (10 chars)')
  })

  it('falls back to the Supabase CLI access-token file', () => {
    writeFile(join(home, '.supabase/access-token'), 'sbp_cli_token\n')
    writeFile(join(primary, 'supabase/.temp/linked-project.json'), '{"ref":"ref-cli"}')

    const r = run(['--resolve-only'])

    expect(r.status).toBe(0)
    expect(r.stdout).toContain('ref=ref-cli')
    expect(r.stdout).toContain('token=present (13 chars)')
  })

  it('fails loudly when no token is available', () => {
    writeFile(join(worktree, 'supabase/.temp/linked-project.json'), '{"ref":"ref-only"}')

    const r = run(['--resolve-only'])

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no Supabase access token found')
  })

  it('fails loudly when no linked project is available', () => {
    writeFile(join(worktree, '.env'), 'SUPABASE_ACCESS_TOKEN=sbp_token\n')

    const r = run(['--resolve-only'])

    expect(r.status).toBe(1)
    expect(r.stderr).toContain('no linked Supabase project found')
  })
})
