// Schema.org JSON-LD for the public routes (issues #644, #645). Pure and
// `import.meta`-free so the SEO build scripts can import it under Node 26 type
// stripping (hence the explicit `.ts` extensions). The prerender script injects
// the output into each route's static <head> at build time; React never renders
// it (a rendered <script> throws React #418 against browser-prerendered markup).
import { canonicalUrl, faqJsonLd, siteJsonLd } from './seo.ts'
import { FAQ_ITEMS } from './faq.ts'
import { AUTHOR } from './author.ts'
import { CONTENT_ROUTES } from './contentRoutes.ts'
import type { Breadcrumb } from './contentRoutes.ts'
import { HELP_TOPICS, PUBLIC_ROUTES, ROUTES } from './publicRoutes.ts'

type JsonLd = Record<string, unknown>

export interface HowToStep {
  name: string
  text: string
}

export function breadcrumbJsonLd(
  items: Breadcrumb[],
  currentPath: string,
  siteUrl: string,
): JsonLd {
  const last = items.length - 1
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => {
      const entry: JsonLd = {
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
      }
      if (item.to) entry.item = canonicalUrl(siteUrl, item.to)
      else if (index === last) entry.item = canonicalUrl(siteUrl, currentPath)
      return entry
    }),
  }
}

export function articleJsonLd({
  headline,
  description,
  url,
}: {
  headline: string
  description: string
  url: string
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    url,
    author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
  }
}

export function howToJsonLd({
  name,
  description,
  url,
  steps,
}: {
  name: string
  description: string
  url: string
  steps: HowToStep[]
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    url,
    author: { '@type': 'Person', name: AUTHOR.name, url: AUTHOR.url },
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  }
}

// Step outlines for the two how-to guides. Hand-authored so they stay stable
// when a guide's prose is edited (a heading-parse would churn the structured
// data).
const HOW_TO_STEPS: Record<string, HowToStep[]> = {
  [ROUTES.howToDnd]: [
    { name: 'Gather your table', text: 'Invite a handful of players and agree on a tone, schedule, and posting pace before the first scene.' },
    { name: 'Create the campaign', text: 'Open a channel, give it a name, and set a status that keeps the party goal visible.' },
    { name: 'Post in scenes', text: 'Break the session into scenes and write each turn as a short post so the story reads like a novel.' },
    { name: 'Roll as you go', text: 'Tap dice notation in a post to roll, or use ability checks with the modifier already filled in.' },
    { name: 'Keep momentum', text: 'Use turn reminders and notifications so the table keeps moving between sessions.' },
  ],
  [ROUTES.howToRun]: [
    { name: 'Set expectations', text: 'Recruit players, agree on posting frequency, and share the safety tools before play starts.' },
    { name: 'Create the campaign', text: 'Start a channel, invite the table, and write the opening hook as the first post.' },
    { name: 'Frame each scene', text: 'Close a scene and open the next with a clear prompt so every player knows what to respond to.' },
    { name: 'Manage downtime', text: 'Use away status and turn alerts to handle slow days without losing the thread.' },
    { name: 'Keep the story alive', text: 'Check in regularly, recap long gaps, and let the safety tools handle anything uncomfortable.' },
  ],
}

// Maps a public route path to its structured data. Returns [] for routes with
// no schema (privacy, terms).
export function jsonLdForRoute(path: string, siteUrl: string): JsonLd[] {
  if (path === ROUTES.home) return siteJsonLd(siteUrl)
  if (path === ROUTES.features) return [faqJsonLd(FAQ_ITEMS)]

  const route = PUBLIC_ROUTES.find((entry) => entry.path === path)
  if (!route) return []

  let breadcrumbs: Breadcrumb[]
  const content = CONTENT_ROUTES.find((entry) => entry.path === path)
  if (content) {
    breadcrumbs = content.breadcrumbs
  } else if (path === ROUTES.help || path.startsWith(`${ROUTES.help}/`)) {
    const topic = HELP_TOPICS.find((entry) => `${ROUTES.help}/${entry.slug}` === path)
    breadcrumbs = topic
      ? [{ label: 'Home', to: ROUTES.home }, { label: 'Help', to: ROUTES.help }, { label: topic.title }]
      : [{ label: 'Home', to: ROUTES.home }, { label: 'Help' }]
  } else {
    return []
  }

  const url = canonicalUrl(siteUrl, path)
  const steps = HOW_TO_STEPS[path]
  const primary = steps
    ? howToJsonLd({ name: route.title, description: route.description, url, steps })
    : articleJsonLd({ headline: route.title, description: route.description, url })
  return [primary, breadcrumbJsonLd(breadcrumbs, path, siteUrl)]
}
