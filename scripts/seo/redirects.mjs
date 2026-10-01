// Generates public/_redirects from the app route registry (issue #643).
//
// Cloudflare Pages turns off its automatic SPA fallback as soon as a top-level
// 404.html exists, so every app/auth route is explicitly rewritten to the
// prerendered empty shell. The file is committed; CI regenerates it and fails
// on drift (see .github/workflows/ci.yml).
//
// Run: node scripts/seo/redirects.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRedirectsFile } from '../../src/lib/publicRoutes.ts'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, '..', '..', 'public', '_redirects')
writeFileSync(out, buildRedirectsFile())
console.log(`Wrote ${out}`)
