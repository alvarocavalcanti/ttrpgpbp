import { parseFrontmatter } from '../../lib/helpFrontmatter'
import { ROUTES } from '../../lib/publicRoutes'

// Long-form public content (issue #644). Bodies live as markdown in
// docs/content/, one file per route; SEO titles/descriptions stay in
// PUBLIC_ROUTES (the prerender/sitemap source of truth) and the rendered `<h1>`
// comes from each file's frontmatter.
interface ContentDoc {
  slug: string
  title: string
  body: string
}

interface Breadcrumb {
  label: string
  /** Omitted for the current page (plain text, not a link). */
  to?: string
}

interface ContentRoute {
  path: string
  docSlug: string
  breadcrumbs: Breadcrumb[]
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

const HOW_TO: Breadcrumb = { label: 'How-to Guides' }
const COMPARISONS: Breadcrumb = { label: 'Comparisons' }
const ALTERNATIVES: Breadcrumb = { label: 'Alternatives' }

export const CONTENT_ROUTES: ContentRoute[] = [
  {
    path: ROUTES.playByPost,
    docSlug: 'play-by-post',
    breadcrumbs: [{ label: 'Home', to: '/' }, { label: 'Play-by-Post' }],
  },
  {
    path: ROUTES.howToDnd,
    docSlug: 'how-to-play-by-post-dnd',
    breadcrumbs: [{ label: 'Home', to: '/' }, HOW_TO, { label: 'How to Play D&D by Post' }],
  },
  {
    path: ROUTES.howToRun,
    docSlug: 'how-to-run-play-by-post',
    breadcrumbs: [{ label: 'Home', to: '/' }, HOW_TO, { label: 'How to Run a Play-by-Post Game' }],
  },
  {
    path: ROUTES.vsDiscord,
    docSlug: 'vs-discord',
    breadcrumbs: [{ label: 'Home', to: '/' }, COMPARISONS, { label: 'Role by Post vs Discord' }],
  },
  {
    path: ROUTES.altRpol,
    docSlug: 'alternatives-rpol',
    breadcrumbs: [{ label: 'Home', to: '/' }, ALTERNATIVES, { label: 'Role by Post vs RPOL' }],
  },
  {
    path: ROUTES.altMythWeavers,
    docSlug: 'alternatives-myth-weavers',
    breadcrumbs: [
      { label: 'Home', to: '/' },
      ALTERNATIVES,
      { label: 'Role by Post vs Myth-Weavers' },
    ],
  },
]
