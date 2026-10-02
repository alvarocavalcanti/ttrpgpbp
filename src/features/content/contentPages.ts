import { parseFrontmatter } from '../../lib/helpFrontmatter'

// Long-form public content (issue #644). Bodies live as markdown in
// docs/content/, one file per route; SEO titles/descriptions stay in
// PUBLIC_ROUTES (the prerender/sitemap source of truth) and the rendered `<h1>`
// comes from each file's frontmatter. The path/breadcrumb registry lives in
// `src/lib/contentRoutes.ts` so the SEO build scripts can import it.
interface ContentDoc {
  slug: string
  title: string
  body: string
}

const modules = import.meta.glob('/docs/content/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function buildDocs(): Record<string, ContentDoc> {
  const docs: Record<string, ContentDoc> = {}
  for (const [path, raw] of Object.entries(modules)) {
    const slug = path.split('/').pop()?.replace(/\.md$/, '') ?? ''
    const { frontmatter, body } = parseFrontmatter(raw)
    const doc: ContentDoc = { slug, title: frontmatter.title ?? slug, body }
    docs[slug] = doc
  }
  return docs
}

const DOCS = buildDocs()

export function getContentDoc(slug: string): ContentDoc | undefined {
  return DOCS[slug]
}
