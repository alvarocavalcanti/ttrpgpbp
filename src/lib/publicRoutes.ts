// Single source of truth for route paths and the public/marketing surfaces
// (issue #643). Kept free of React and `import.meta` so the SEO build scripts
// in scripts/seo/ can import it directly under Node 26 type stripping.

export const ROUTES = {
  home: '/',
  login: '/login',
  features: '/features',
  privacy: '/privacy',
  terms: '/terms',
  archived: '/archived',
  messages: '/messages',
  admin: '/admin',
  adminChannel: '/admin/channels/:id',
  join: '/join/:id',
  channel: '/channel/:id',
  settings: '/settings',
  help: '/help',
  helpTopic: '/help/:topic',
  changelog: '/changelog',
  about: '/about',
  notFound: '*',
} as const

export type RouteKey = keyof typeof ROUTES

export interface PublicRoute {
  path: string
  title: string
  description: string
  /** Selector the prerender script waits for before snapshotting the route. */
  waitSelector: string
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority: number
}

// Public, indexable marketing surfaces. Everything else is app/auth: client
// rendered, reachable through the /app-shell rewrite, and noindex.
export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: ROUTES.home,
    title: 'Role by Post — Play-by-Post RPG Chat',
    description:
      'Role by Post is a chat-first app for asynchronous tabletop RPGs: real-time play-by-post, dice rolling, campaign channels, safety tools, and push notifications.',
    waitSelector: 'h1',
    changeFrequency: 'weekly',
    priority: 1,
  },
  {
    path: ROUTES.features,
    title: 'Features — Role by Post',
    description:
      'Explore Role by Post: play-by-post chat, clickable dice rolls, campaign and NPC management, built-in safety tools, and a mobile-first design.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: ROUTES.privacy,
    title: 'Privacy Policy — Role by Post',
    description:
      'How Role by Post handles your data: what we collect, where it is stored, retention, and your data-protection rights.',
    waitSelector: 'h1',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
  {
    path: ROUTES.terms,
    title: 'Terms of Service — Role by Post',
    description:
      'The terms for using Role by Post, including acceptable use, content rules, and disclaimers.',
    waitSelector: 'h1',
    changeFrequency: 'yearly',
    priority: 0.3,
  },
]

// Routes that are marketing for everyone. `/` is deliberately excluded: it is
// the signed-out landing but the lobby once signed in, so callers decide with
// auth state (see InstallBannerGate).
const MARKETING_KEYS: RouteKey[] = ['features', 'privacy', 'terms']

// True for the always-marketing surfaces. Consumed by the gates that keep
// app-only surfaces (install banner, changelog auto-open) off these pages.
export function isMarketingPath(pathname: string): boolean {
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return MARKETING_KEYS.some((key) => ROUTES[key] === normalized)
}

// App/auth routes that must be rewritten to the prerendered empty SPA shell
// (Cloudflare Pages' automatic SPA fallback is disabled by a top-level
// 404.html, so these are re-declared in public/_redirects).
export const APP_ROUTE_KEYS: RouteKey[] = [
  'login',
  'archived',
  'messages',
  'admin',
  'adminChannel',
  'join',
  'channel',
  'settings',
  'help',
  'helpTopic',
  'changelog',
  'about',
]

// Trailing slash is required: Pages 308-redirects a rewrite target of
// `/app-shell` to `/app-shell/`, which would change the deep-link URL. The
// directory form is served in place with a 200.
export const APP_SHELL_DESTINATION = '/app-shell/'

export interface RedirectRule {
  source: string
  destination: string
  status: 200
}

// Turns a route template into a redirect source: dynamic templates collapse to
// a splat on their static prefix (`/join/:id` -> `/join/*`).
function redirectSource(path: string): string {
  const paramIndex = path.indexOf(':')
  if (paramIndex === -1) return path
  const prefix = path.slice(0, paramIndex).replace(/\/$/, '')
  return `${prefix}/*`
}

export function appRedirectRules(): RedirectRule[] {
  const rules = APP_ROUTE_KEYS.map((key) => ({
    source: redirectSource(ROUTES[key]),
    destination: APP_SHELL_DESTINATION,
    status: 200 as const,
  }))
  // Cloudflare evaluates _redirects in order and requires static rules before
  // dynamic ones, so splats go last.
  const isDynamic = (rule: RedirectRule) => rule.source.includes('*')
  return [...rules.filter((rule) => !isDynamic(rule)), ...rules.filter(isDynamic)]
}

export function buildRedirectsFile(): string {
  return (
    appRedirectRules()
      .map((rule) => `${rule.source} ${rule.destination} ${rule.status}`)
      .join('\n') + '\n'
  )
}

// Path prefixes crawlers should leave alone: the app/auth routes (noindex) and
// the shell itself.
export function robotsDisallowPaths(): string[] {
  const prefixes = APP_ROUTE_KEYS.map((key) =>
    redirectSource(ROUTES[key]).replace(/\/\*$/, ''),
  )
  return [...new Set([...prefixes, APP_SHELL_DESTINATION.replace(/\/$/, '')])]
}
