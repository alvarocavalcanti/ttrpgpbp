// Post-build prerender for the public marketing routes (issue #643).
//
// Runs after `vite build` (see `npm run build:seo`), where a browser can run:
// the Cloudflare Pages build image is an unprivileged gVisor container with no
// Chromium and no sudo, so prerendering happens in CI/Actions instead.
//
// For each PUBLIC_ROUTES entry it loads the built SPA in Chromium, waits for
// the page's anchor selector, and snapshots the live DOM (including the head
// tags React 19 hoists). The pristine shell is saved to dist/app-shell/ before
// dist/index.html is overwritten with the landing page, so app/auth routes can
// be rewritten to an empty shell.
//
// Run: node scripts/seo/prerender.mjs   (after `vite build`)
import { spawn, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import { chromium } from '@playwright/test'
import { PUBLIC_ROUTES, robotsDisallowPaths } from '../../src/lib/publicRoutes.ts'
import { buildRobots, buildSitemap, faqJsonLd, siteJsonLd } from '../../src/lib/seo.ts'
import { FAQ_ITEMS } from '../../src/lib/faq.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dist = join(root, 'dist')
// Use Vite's own env resolution (shell overrides files, `.env.local` over
// `.env`, mode-specific files) so the sitemap/robots origin agrees with the
// __SITE_URL__ baked into the bundle.
const fileEnv = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', root)
const siteUrl = process.env.VITE_SITE_URL || fileEnv.VITE_SITE_URL || 'https://rolebypost.com'
// Random high port so a stale preview server can never be mistaken for ours.
const port = Number(process.env.SEO_PORT) || 4300 + Math.floor(Math.random() * 400)
const base = `http://localhost:${port}`

if (process.env.SEO_SKIP_PRERENDER === '1') {
  console.log('SEO_SKIP_PRERENDER=1 — skipping prerender')
  process.exit(0)
}

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html is missing — run `vite build` first.')
  process.exit(1)
}

// 1. Preserve the pristine shell before index.html becomes the landing page.
const shellDir = join(dist, 'app-shell')
mkdirSync(shellDir, { recursive: true })
cpSync(join(dist, 'index.html'), join(shellDir, 'index.html'))

// 2. Crawl files, written from the same route registry the app uses. No
// `lastmod`: pages do not change on every deploy, and a build-date lastmod is
// an inaccurate crawl signal search engines learn to ignore (issue #643).
writeFileSync(
  join(dist, 'sitemap.xml'),
  buildSitemap(
    PUBLIC_ROUTES.map((route) => ({
      path: route.path,
      changeFrequency: route.changeFrequency,
      priority: route.priority,
    })),
    siteUrl,
  ),
)
writeFileSync(join(dist, 'robots.txt'), buildRobots(siteUrl, robotsDisallowPaths()))

async function ensureChromium() {
  try {
    const browser = await chromium.launch()
    await browser.close()
  } catch {
    console.log('Chromium is not installed — running `npx playwright install chromium`…')
    const result = spawnSync('npx', ['playwright', 'install', 'chromium'], {
      stdio: 'inherit',
      cwd: root,
    })
    if (result.status !== 0) throw new Error('Could not install Chromium for prerender')
  }
}

function startPreview() {
  // Detached so the whole process group (npx → vite) can be stopped together.
  return spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
    detached: true,
  })
}

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/`)
      if (response.ok) return
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`vite preview did not start on ${base}`)
}

async function captureRoutes() {
  const browser = await chromium.launch()
  const captures = []
  try {
    for (const route of PUBLIC_ROUTES) {
      // A fresh context per route, with the service worker blocked so it can
      // never serve a stale shell into the snapshot. The prerender flag keeps
      // client-only transient UI (e.g. the realtime banner) out of the snapshot.
      const context = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'light' })
      await context.addInitScript(() => {
        window.__PRERENDER__ = true
      })
      const page = await context.newPage()
      await page.goto(`${base}${route.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector(route.waitSelector, { timeout: 20_000 })
      await page.evaluate(() => document.fonts.ready)
      captures.push({ path: route.path, html: await page.content() })
      await context.close()
      console.log(`Captured ${route.path}`)
    }
  } finally {
    await browser.close()
  }
  return captures
}

// JSON-LD is a build-time head artefact, not a React one: rendering it as a
// React <script> throws a hydration mismatch (#418) against browser-prerendered
// markup. Inject it into the matching snapshot's <head> instead. Only the
// routes below get structured data (issue #644).
function jsonLdForPath(path) {
  if (path === '/') return siteJsonLd(siteUrl)
  if (path === '/features') return [faqJsonLd(FAQ_ITEMS)]
  return []
}

function injectJsonLd(html, path) {
  if (html.includes('application/ld+json')) return html
  const nodes = jsonLdForPath(path)
  if (nodes.length === 0) return html
  const scripts = nodes
    .map((node) => `<script type="application/ld+json">${JSON.stringify(node)}</script>`)
    .join('')
  return html.replace('</head>', `${scripts}</head>`)
}

function writeCaptures(captures) {
  for (const { path, html: rawHtml } of captures) {
    const html = injectJsonLd(rawHtml, path)
    // Flat files, not `dir/index.html`: Pages canonicalises a directory index
    // to a trailing slash (`/features` -> 308 `/features/`), but serves
    // `features.html` at the clean extension-less URL `/features`.
    const target =
      path === '/' ? join(dist, 'index.html') : join(dist, `${path.replace(/^\//, '')}.html`)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, html)
    console.log(`Wrote ${target}`)
  }
}

await ensureChromium()

const preview = startPreview()
try {
  await waitForServer()
  const captures = await captureRoutes()
  // Write only after every route is captured: vite preview serves the live
  // dist/index.html as its SPA fallback, so overwriting it mid-run would make
  // later routes capture the landing page instead of the shell.
  writeCaptures(captures)
} finally {
  if (preview.pid) {
    try {
      process.kill(-preview.pid, 'SIGTERM')
    } catch {
      preview.kill('SIGTERM')
    }
  }
}

console.log('Prerender complete')
