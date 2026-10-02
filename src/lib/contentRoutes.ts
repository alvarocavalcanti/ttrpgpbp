// Pure route/breadcrumb registry for the long-form public content pages
// (issue #644, split out for issue #645). Kept free of React and `import.meta`
// so the SEO build scripts in scripts/seo/ can import it under Node 26 type
// stripping — hence the explicit `.ts` extension on the import.
import { ROUTES } from './publicRoutes.ts'

export interface Breadcrumb {
  label: string
  /** Omitted for the current page (plain text, not a link). */
  to?: string
}

export interface ContentRoute {
  path: string
  docSlug: string
  breadcrumbs: Breadcrumb[]
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
