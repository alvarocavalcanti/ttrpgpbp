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

export interface ContentShot {
  /** Full-size capture under /help-images/; the thumbnail is derived at render. */
  src: string
  alt: string
  caption: string
}

export interface ContentRoute {
  path: string
  docSlug: string
  breadcrumbs: Breadcrumb[]
  /** Optional in-flow screenshots, rendered where the doc's `<!-- shots -->` marker sits. */
  shots?: ContentShot[]
  /** Optional 1200x630 social card; defaults to the site-wide og-image.png. */
  ogImage?: string
}

const HOW_TO: Breadcrumb = { label: 'How-to Guides' }
const COMPARISONS: Breadcrumb = { label: 'Comparisons' }

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
    path: ROUTES.alternatives,
    docSlug: 'alternatives',
    breadcrumbs: [{ label: 'Home', to: '/' }, { label: 'Alternatives' }],
  },
  {
    path: ROUTES.altRpol,
    docSlug: 'alternatives-rpol',
    breadcrumbs: [
      { label: 'Home', to: '/' },
      { label: 'Alternatives', to: ROUTES.alternatives },
      { label: 'Role by Post vs RPOL' },
    ],
    ogImage: '/og-image-rpol.png',
    shots: [
      {
        src: '/help-images/status-bar.png',
        alt: 'Role by Post campaign timeline on a phone with dice results, scene text, and the status bar',
        caption: 'A campaign reads back like a story — rolls, scene breaks, and notes in one place.',
      },
      {
        src: '/help-images/rooms.png',
        alt: 'Room settings inside a Role by Post campaign, including a private room for the Game Master',
        caption: 'Rooms keep dice and out-of-character talk out of the story.',
      },
      {
        src: '/help-images/dice-panel.png',
        alt: 'Role by Post dice roller on a phone with quick-roll chips and the successes pool mode',
        caption: 'Tap dice in a post to roll, or open an ability check with the modifier already set.',
      },
    ],
  },
  {
    path: ROUTES.altMythWeavers,
    docSlug: 'alternatives-myth-weavers',
    breadcrumbs: [
      { label: 'Home', to: '/' },
      { label: 'Alternatives', to: ROUTES.alternatives },
      { label: 'Role by Post vs Myth-Weavers' },
    ],
    ogImage: '/og-image-myth-weavers.png',
    shots: [
      {
        src: '/help-images/message-actions.png',
        alt: 'A Role by Post message on a phone with reply, edit, reaction, and report actions',
        caption: 'Replies and reactions stay attached to the post they belong to, so the story reads in order.',
      },
      {
        src: '/help-images/rooms.png',
        alt: 'Room settings inside a Role by Post campaign, including a private room for the Game Master',
        caption: 'Rooms keep dice and out-of-character talk out of the story.',
      },
      {
        src: '/help-images/notes.png',
        alt: 'Campaign notes in Role by Post with Character, Party, and GM notebooks',
        caption: 'Character, party, and GM notes live with the campaign instead of in a separate document.',
      },
    ],
  },
  {
    path: ROUTES.aiDisclaimer,
    docSlug: 'ai-disclaimer',
    breadcrumbs: [{ label: 'Home', to: '/' }, { label: 'AI Disclaimer' }],
  },
]
