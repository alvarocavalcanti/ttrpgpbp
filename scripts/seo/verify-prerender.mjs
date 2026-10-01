// Post-build verification for the SEO prerender (issue #643). Fails CI if any
// public route HTML is missing content or metadata, or if the crawl files are
// absent. Run after `npm run build:seo`.
//
// Run: node scripts/seo/verify-prerender.mjs
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_ROUTES } from '../../src/lib/publicRoutes.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dist = join(root, 'dist')
const errors = []

function read(relative) {
  const file = join(dist, relative)
  if (!existsSync(file)) {
    errors.push(`missing ${relative}`)
    return null
  }
  return readFileSync(file, 'utf8')
}

function outputFile(path) {
  return path === '/' ? 'index.html' : `${path.replace(/^\//, '')}.html`
}

for (const route of PUBLIC_ROUTES) {
  const relative = outputFile(route.path)
  const html = read(relative)
  if (!html) continue

  const titles = html.match(/<title>[^<]*<\/title>/g) ?? []
  if (titles.length !== 1) {
    errors.push(`${relative}: expected exactly one <title>, found ${titles.length}`)
  } else if (!titles[0].includes(route.title)) {
    errors.push(`${relative}: title does not match the route registry`)
  }
  if (!html.includes('rel="canonical"')) errors.push(`${relative}: missing canonical link`)
  if (!html.includes('property="og:title"')) errors.push(`${relative}: missing og:title`)
  if (!/<h1[\s>]/.test(html)) errors.push(`${relative}: missing an <h1> (no body content)`)
  if (!html.includes('id="root"')) errors.push(`${relative}: missing the React root`)
}

for (const required of ['robots.txt', 'sitemap.xml', '404.html', '_redirects', 'app-shell/index.html']) {
  read(required)
}

const shell = read('app-shell/index.html')
if (shell && !/<div id="root">\s*<\/div>/.test(shell)) {
  errors.push('app-shell/index.html: #root must be empty (it is the app shell)')
}
const prerendered = read('index.html')
if (prerendered && prerendered.includes('<div id="root"></div>')) {
  errors.push('index.html: should be the prerendered landing page, not the empty shell')
}

if (errors.length > 0) {
  console.error('Prerender verification failed:')
  for (const error of errors) console.error(`  - ${error}`)
  process.exit(1)
}
console.log(`Prerender verified for ${PUBLIC_ROUTES.length} routes`)
