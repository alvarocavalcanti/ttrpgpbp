import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const scriptsDir = resolve(process.cwd(), 'scripts/supabase')

function writeStub(dir: string, name: string, body: string): string {
  const path = join(dir, name)
  writeFileSync(path, `#!/bin/sh\n${body}\n`, 'utf8')
  chmodSync(path, 0o755)
  return path
}

describe('scripts/supabase', () => {
  let dir: string
  let envFile: string
  let logFile: string
  let supabaseBin: string
  let dockerBin: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'supabase-scripts-'))
    envFile = join(dir, '.env.local')
    logFile = join(dir, 'calls.log')
    writeFileSync(logFile, '', 'utf8')

    supabaseBin = writeStub(
      dir,
      'stub-supabase',
      [
        'log="${STUB_LOG:-/dev/null}"',
        'printf \'supabase %s\\n\' "$*" >> "$log"',
        'case "$*" in',
        '  "status -o env") printf \'%s\\n\' "${STUB_STATUS_ENV:-}"; exit 0 ;;',
        '  status) exit "${STUB_STATUS_EXIT:-0}" ;;',
        'esac',
        'exit 0',
      ].join('\n'),
    )

    dockerBin = writeStub(
      dir,
      'stub-docker',
      [
        'log="${STUB_LOG:-/dev/null}"',
        'printf \'docker %s\\n\' "$*" >> "$log"',
        'case "$*" in',
        '  ps\\ -aq*) printf \'%s\\n\' "${STUB_CONTAINER_IDS:-}"; exit 0 ;;',
        '  ps\\ -q*) [ -n "${STUB_CONTAINER:-}" ] && printf \'%s\\n\' "$STUB_CONTAINER"; exit 0 ;;',
        '  inspect\\ *) printf \'sha256:%s\\n\' "${STUB_INSPECT_IMAGE:-}"; exit 0 ;;',
        '  image\\ ls*) printf \'%s\\n\' "${STUB_IMAGES:-}"; exit 0 ;;',
        'esac',
        'exit 0',
      ].join('\n'),
    )
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function run(script: string, args: string[] = [], env: Record<string, string> = {}) {
    return spawnSync('sh', [join(scriptsDir, script), ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        SUPABASE_BIN: supabaseBin,
        DOCKER_BIN: dockerBin,
        ENV_FILE: envFile,
        STUB_LOG: logFile,
        ...env,
      },
    })
  }

  function calls(): string {
    return readFileSync(logFile, 'utf8')
  }

  describe('up.sh', () => {
    const statusEnv = [
      'ANON_KEY="header.payload.signature=="',
      'API_URL="http://127.0.0.1:54321"',
      'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
    ].join('\n')

    it('writes .env.local with quotes stripped and "=" inside the key preserved', () => {
      const result = run('up.sh', [], { STUB_STATUS_ENV: statusEnv })

      expect(result.status).toBe(0)
      expect(readFileSync(envFile, 'utf8')).toBe(
        'VITE_SUPABASE_URL=http://127.0.0.1:54321\n' +
          'VITE_SUPABASE_ANON_KEY=header.payload.signature==\n',
      )
    })

    it('emits the URL line before the key line regardless of status output order', () => {
      run('up.sh', [], { STUB_STATUS_ENV: statusEnv })

      const lines = readFileSync(envFile, 'utf8').trim().split('\n')
      expect(lines[0].startsWith('VITE_SUPABASE_URL=')).toBe(true)
      expect(lines[1].startsWith('VITE_SUPABASE_ANON_KEY=')).toBe(true)
    })

    it('starts the stack when status reports it is not running', () => {
      run('up.sh', [], { STUB_STATUS_ENV: statusEnv, STUB_STATUS_EXIT: '1' })

      expect(calls()).toContain('supabase start')
      expect(calls()).toContain('supabase status -o env')
    })

    it('applies pending migrations so an already-running stack stays current', () => {
      run('up.sh', [], { STUB_STATUS_ENV: statusEnv })

      expect(calls()).toContain('supabase migration up --local')
    })

    it('leaves an existing .env.local untouched when a key is missing', () => {
      writeFileSync(envFile, 'sentinel\n', 'utf8')

      const result = run('up.sh', [], { STUB_STATUS_ENV: 'API_URL="http://127.0.0.1:54321"' })

      expect(result.status).not.toBe(0)
      expect(readFileSync(envFile, 'utf8')).toBe('sentinel\n')
    })
  })

  describe('down.sh', () => {
    it('is a no-op when no container is running', () => {
      const result = run('down.sh')

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('already stopped')
      expect(calls()).not.toContain('supabase stop')
    })

    it('forwards --no-backup when the stack is running', () => {
      run('down.sh', ['--no-backup'], { STUB_CONTAINER: 'abc123' })

      expect(calls()).toContain('supabase stop --no-backup')
    })

    it('deletes volumes with --no-backup even when the stack is already stopped', () => {
      const result = run('down.sh', ['--no-backup'])

      expect(result.status).toBe(0)
      expect(calls()).toContain('supabase stop --no-backup')
    })

    it('rejects an unknown flag', () => {
      const result = run('down.sh', ['--nope'])

      expect(result.status).toBe(2)
      expect(result.stderr).toContain('usage:')
    })
  })

  describe('prune.sh', () => {
    const keepId = 'a1a1a1a1a1a1'
    const unusedId = 'b2b2b2b2b2b2'
    const foreignId = 'c3c3c3c3c3c3'
    const images = [
      `${keepId}|public.ecr.aws/supabase/postgres`,
      `${keepId}|ghcr.io/supabase/postgres`,
      `${unusedId}|public.ecr.aws/supabase/studio`,
      `${foreignId}|<none>`,
      `${foreignId}|us-docker.pkg.dev/wpe-art/ai-local-mcp/backstage-mcp-vertex-ai-search`,
    ].join('\n')

    it('prunes dangling layers but skips image removal when the stack is down', () => {
      const result = run('prune.sh')

      expect(result.status).toBe(0)
      expect(calls()).toContain('docker image prune -f')
      expect(calls()).not.toContain('rmi')
      expect(result.stderr).toContain('skipping Supabase image cleanup')
    })

    it('removes only Supabase images no container references when the stack is up', () => {
      run('prune.sh', [], {
        STUB_CONTAINER: 'abc123',
        STUB_CONTAINER_IDS: 'abc123',
        STUB_INSPECT_IMAGE: `${keepId}deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef`,
        STUB_IMAGES: images,
      })

      expect(calls()).toContain(`docker rmi -f ${unusedId}`)
      expect(calls()).not.toContain(`docker rmi -f ${keepId}`)
      expect(calls()).not.toContain(`docker rmi -f ${foreignId}`)
    })
  })

  describe('reset.sh', () => {
    it('stops without backup, brings the stack up and resets the database', () => {
      const result = run('reset.sh', [], {
        STUB_CONTAINER: 'abc123',
        STUB_STATUS_ENV: 'API_URL="http://127.0.0.1:54321"\nANON_KEY="test-anon-key"',
      })

      expect(result.status).toBe(0)
      expect(calls()).toContain('supabase stop --no-backup')
      expect(calls()).toContain('supabase db reset')
    })
  })
})
