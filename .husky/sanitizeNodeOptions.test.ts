import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const script = resolve(process.cwd(), '.husky/_sanitize-node-options.sh')

function sanitize(nodeOptions: string | undefined): string {
  const env = { ...process.env }
  if (nodeOptions === undefined) {
    delete env.NODE_OPTIONS
  } else {
    env.NODE_OPTIONS = nodeOptions
  }
  const result = spawnSync('sh', [script], { env, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout.trim()
}

describe('.husky/_sanitize-node-options.sh', () => {
  it('drops an --import flag pointing at a missing file', () => {
    expect(sanitize('--import=file:///nope/missing-handler.js')).toBe('')
  })

  it('keeps an --import flag pointing at an existing file', () => {
    const kept = sanitize('--import=file:///bin/sh')
    expect(kept).toBe('--import=file:///bin/sh')
  })

  it('keeps unrelated NODE_OPTIONS flags', () => {
    const kept = sanitize('--max-old-space-size=512 --import=file:///bin/sh')
    expect(kept).toBe('--max-old-space-size=512 --import=file:///bin/sh')
  })

  it('keeps a plain (non file://) import path that exists', () => {
    const kept = sanitize('--import=/bin/sh')
    expect(kept).toBe('--import=/bin/sh')
  })

  it('handles an unset NODE_OPTIONS', () => {
    expect(sanitize(undefined)).toBe('')
  })
})
