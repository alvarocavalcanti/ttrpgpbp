// Post-build verification for the SEO prerender (issue #643). Fails CI if any
// public route HTML is missing content or metadata, or if the crawl files are
// absent. Run after `npm run build:seo`.
//
// Run: node scripts/seo/verify-prerender.mjs
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PUBLIC_ROUTES } from '../../src/lib/publicRoutes.ts'
import { jsonLdForRoute } from '../../src/lib/structuredData.ts'

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

// The snapshot serializes `&` as `&amp;` inside `<title>` (e.g. "D&D"), so
// compare entity-decoded text against the registry's plain string.
function decodeEntities(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

for (const route of PUBLIC_ROUTES) {
  const relative = outputFile(route.path)
  const html = read(relative)
  if (!html) continue

  const titles = html.match(/<title>[^<]*<\/title>/g) ?? []
  if (titles.length !== 1) {
    errors.push(`${relative}: expected exactly one <title>, found ${titles.length}`)
  } else if (!decodeEntities(titles[0]).includes(route.title)) {
    errors.push(`${relative}: title does not match the route registry`)
  }
  if (!html.includes('rel="canonical"')) errors.push(`${relative}: missing canonical link`)
  if (!html.includes('property="og:title"')) errors.push(`${relative}: missing og:title`)
  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length
  if (h1Count !== 1) {
    errors.push(`${relative}: expected exactly one <h1>, found ${h1Count}`)
  }
  if (!html.includes('id="root"')) errors.push(`${relative}: missing the React root`)
  if (route.path === '/' && !html.includes('application/ld+json')) {
    errors.push(`${relative}: missing JSON-LD`)
  }
  if (route.path === '/features' && !html.includes('FAQPage')) {
    errors.push(`${relative}: missing FAQPage JSON-LD`)
  }
  // Structured data on the guide/help routes (#645).
  const structuredData = jsonLdForRoute(route.path, 'https://rolebypost.com')
  if (structuredData.length > 0 && !html.includes('application/ld+json')) {
    errors.push(`${relative}: missing structured data`)
  }
  for (const node of structuredData) {
    const type = node['@type']
    if (!html.includes(`"@type":"${type}"`)) {
      errors.push(`${relative}: missing ${type} JSON-LD`)
    }
  }
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
