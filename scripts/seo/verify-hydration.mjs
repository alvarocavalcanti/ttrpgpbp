// Post-build hydration guard (issue #643).
//
// A browser-prerendered page only hydrates cleanly when the client's first
// render matches the parsed DOM. React 19 throws #418 otherwise — from adjacent
// text nodes merging, Suspense boundaries, or first render reading persisted
// state (theme, analytics consent) that differs from the prerender snapshot.
// This loads the built pages in Chromium and fails on any hydration error.
//
// Run: node scripts/seo/verify-hydration.mjs   (after `npm run build:seo`)
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { PUBLIC_ROUTES } from '../../src/lib/publicRoutes.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const port = 4300 + Math.floor(Math.random() * 400)
const base = `http://localhost:${port}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
  detached: true,
})

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${base}/`)).ok) return
    } catch {
      // not up yet
    }
    await sleep(250)
  }
  throw new Error(`vite preview did not start on ${base}`)
}

const problems = []

function watch(page) {
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error' && /hydrat|did not match|Minified React error #418/i.test(text)) {
      problems.push(text)
    }
  })
  page.on('pageerror', (error) => {
    if (/#418|hydrat/i.test(error.message)) problems.push(error.message)
  })
}

async function visit(page, route) {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1', { timeout: 20_000 })
  await sleep(1000)
}

try {
  await waitForServer()
  const browser = await chromium.launch()
  try {
    // 1. Fresh visitor (the state the prerender captured). The prerender flag
    //    keeps transient client-only UI out of both sides.
    const fresh = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'light' })
    await fresh.addInitScript(() => {
      window.__PRERENDER__ = true
    })
    const freshPage = await fresh.newPage()
    watch(freshPage)
    for (const route of PUBLIC_ROUTES) await visit(freshPage, route.path)
    await fresh.close()

    // 2. Returning visitor: persisted dark theme + an answered consent banner.
    //    The snapshot was light/undecided, so a first render that reads storage
    //    would mismatch. No prerender flag here — this is the real client path.
    const returning = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'dark' })
    await returning.addInitScript(() => {
      window.localStorage.setItem('rolebypost-theme', 'dark')
      window.localStorage.setItem('analytics-consent', 'granted')
    })
    const returningPage = await returning.newPage()
    watch(returningPage)
    for (const route of ['/', '/features']) await visit(returningPage, route)
    await returning.close()
  } finally {
    await browser.close()
  }
} finally {
  if (preview.pid) {
    try {
      process.kill(-preview.pid, 'SIGTERM')
    } catch {
      preview.kill('SIGTERM')
    }
  }
}

if (problems.length > 0) {
  console.error('Hydration verification failed:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}
console.log('Hydration verified for fresh and returning visitors')
