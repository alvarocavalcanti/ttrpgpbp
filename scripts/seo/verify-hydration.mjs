// Post-build hydration guard (issue #643).
//
// A browser-prerendered page only hydrates cleanly when the React tree on the
// client matches the parsed DOM. React 19 throws #418 when it does not — most
// often because two adjacent text nodes in JSX (e.g. `text{' '}<b>`) merge when
// the serialized HTML is re-parsed. That is invisible to an HTML diff, so this
// loads the built pages in Chromium and fails on any hydration error.
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
try {
  await waitForServer()
  const browser = await chromium.launch()
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'light' })
    const page = await context.newPage()
    page.on('console', (message) => {
      const text = message.text()
      if (message.type() === 'error' && /hydrat|did not match|Minified React error #418/i.test(text)) {
        problems.push(text)
      }
    })
    page.on('pageerror', (error) => {
      if (/#418|hydrat/i.test(error.message)) problems.push(error.message)
    })
    for (const route of PUBLIC_ROUTES) {
      await page.goto(`${base}${route.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector(route.waitSelector, { timeout: 20_000 })
      // Give hydration time to run and report.
      await sleep(1000)
    }
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
console.log(`Hydration verified for ${PUBLIC_ROUTES.length} routes`)
