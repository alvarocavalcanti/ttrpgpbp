// Single source of truth for route paths and the public/marketing surfaces
// (issue #643). Kept free of React and `import.meta` so the SEO build scripts
// in scripts/seo/ can import it directly under Node 26 type stripping.

export const ROUTES = {
  home: '/',
  login: '/login',
  features: '/features',
  press: '/press',
  diceRoller: '/dice-roller',
  gameSystem: '/game-systems/:slug',
  playByPost: '/play-by-post',
  howToDnd: '/how-to/play-by-post-dnd',
  howToRun: '/how-to/run-play-by-post',
  vsDiscord: '/vs/discord',
  altRpol: '/alternatives/rpol',
  altMythWeavers: '/alternatives/myth-weavers',
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

// The public help guides. Slug maps 1:1 to a `docs/help/{general,channel}/*.md`
// file; a guard test keeps this list and the markdown directory in sync. Titles
// are SEO strings and must stay free of `&` (the prerender verifier compares
// them against HTML-escaped `<title>` text). The rendered page heading comes
// from each markdown file's frontmatter, not from here.
interface HelpTopic {
  slug: string
  title: string
  description: string
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    slug: 'ability-checks',
    title: 'Ability Checks and DCs — Role by Post Help',
    description:
      'How ability checks and difficulty classes work in Role by Post, including modifiers, advantage, and the full dice breakdown.',
  },
  {
    slug: 'account',
    title: 'Account and Settings — Role by Post Help',
    description:
      'Manage your Role by Post account: sign-in, display name, avatar, character notes, data export, and account deletion.',
  },
  {
    slug: 'afk-away',
    title: 'AFK and Away Status — Role by Post Help',
    description:
      'Set yourself AFK in Role by Post so your table knows you are away and your turn alerts pause until you return.',
  },
  {
    slug: 'changelog',
    title: 'Changelog — Role by Post Help',
    description: 'Every update shipped to Role by Post, newest first, written for players.',
  },
  {
    slug: 'dice-rolling',
    title: 'Dice Rolling — Role by Post Help',
    description:
      'Roll dice in Role by Post: clickable notation, ability checks, pools, successes, sorting, and full breakdowns.',
  },
  {
    slug: 'lobby',
    title: 'Lobby and Joining Channels — Role by Post Help',
    description:
      'The Role by Post lobby: find your campaigns, join by invite link, and see unread messages at a glance.',
  },
  {
    slug: 'messages',
    title: 'Messages — Role by Post Help',
    description:
      'Post, reply, react, whisper, edit, and format messages in a Role by Post campaign timeline.',
  },
  {
    slug: 'notifications',
    title: 'Notifications — Role by Post Help',
    description:
      'Choose push alerts per channel in Role by Post: everything, GM messages only, or just your turn.',
  },
  {
    slug: 'npcs',
    title: 'NPCs — Role by Post Help',
    description:
      'Speak as non-player characters in Role by Post with names and portraits that persist in the timeline.',
  },
  {
    slug: 'safety-tools',
    title: 'Safety Tools — Role by Post Help',
    description:
      'Built-in safety tools in Role by Post: lines and veils plus an anonymous X-card for every table.',
  },
  {
    slug: 'search',
    title: 'Search — Role by Post Help',
    description: "Search a Role by Post campaign's full message history and jump straight to the result.",
  },
  {
    slug: 'export-chat',
    title: 'Export Chat — Role by Post Help',
    description: "Export a Role by Post campaign's chat history to a Markdown file you can keep.",
  },
  {
    slug: 'gm-tools',
    title: 'GM Tools — Role by Post Help',
    description:
      'Game Master tools in Role by Post: channel settings, player management, safety tools, and story controls.',
  },
  {
    slug: 'sidebar',
    title: 'Channel Sidebar and Menus — Role by Post Help',
    description:
      'The Role by Post channel sidebar: media, roll history, NPCs, safety tools, and search in one place.',
  },
  {
    slug: 'status-bar',
    title: 'Channel Status Bar — Role by Post Help',
    description:
      'Keep initiative, active players, and story notes visible with the Role by Post channel status bar.',
  },
]

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
    path: ROUTES.press,
    title: 'Press Kit — Role by Post',
    description:
      'Press and creator resources for Role by Post: the product story, brand assets, screenshots, a fact sheet, and a contact for media enquiries.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  {
    path: ROUTES.diceRoller,
    title: 'Dice Roller — Roll Dice Online — Role by Post',
    description:
      'A free online dice roller for tabletop RPGs: d4 to d100, modifiers, advantage and disadvantage, dice pools, and success checks. Rolls run in your browser with no sign-in.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  // Concrete instances of ROUTES.gameSystem. Keep one entry per system that
  // has copy in src/game-systems/marketing.ts (guarded by a test).
  {
    path: '/game-systems/shadowdark',
    title: 'Shadowdark Play-by-Post — Role by Post',
    description:
      'Play Shadowdark by post in Role by Post: six-stat modifiers, clickable d20 checks, advantage and disadvantage, and a shared timeline for asynchronous play.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.6,
  },
  {
    path: ROUTES.playByPost,
    title: 'Play-by-Post Tabletop RPGs — Role by Post',
    description:
      'What play-by-post is, why asynchronous tabletop RPGs fit busy groups, and how Role by Post keeps the story moving from any phone or browser.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.9,
  },
  {
    path: ROUTES.howToDnd,
    title: 'How to Play D&D by Post — Role by Post',
    description:
      'A practical guide to running a Dungeons & Dragons game by post: pacing, scene breaks, dice rolls, and keeping every player in the story.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: ROUTES.howToRun,
    title: 'How to Run a Play-by-Post Game — Role by Post',
    description:
      'How to game-master an asynchronous tabletop RPG: recruiting players, setting pace, using safety tools, and keeping a campaign alive.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: ROUTES.vsDiscord,
    title: 'Role by Post vs Discord — Role by Post',
    description:
      'How Role by Post compares with Discord for play-by-post tabletop RPGs: campaign structure, dice, NPCs, and keeping the story readable.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: ROUTES.altRpol,
    title: 'Role by Post vs RPOL — Role by Post',
    description:
      'Comparing Role by Post with RPOL for play-by-post RPGs: mobile-first chat, dice rolling, safety tools, and a modern interface.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: ROUTES.altMythWeavers,
    title: 'Role by Post vs Myth-Weavers — Role by Post',
    description:
      'Comparing Role by Post with Myth-Weavers for play-by-post RPGs: a chat-first timeline, campaign tools, and play from any device.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.7,
  },
  {
    path: ROUTES.help,
    title: 'Help and Guides — Role by Post',
    description:
      'Guides for every Role by Post feature: dice rolling, ability checks, messages, NPCs, safety tools, notifications, and more.',
    waitSelector: 'h1',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
  ...HELP_TOPICS.map(
    (topic): PublicRoute => ({
      path: `${ROUTES.help}/${topic.slug}`,
      title: topic.title,
      description: topic.description,
      waitSelector: 'h1',
      changeFrequency: 'monthly',
      priority: 0.4,
    }),
  ),
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

// Routes that are marketing/content for everyone. `/` is deliberately excluded:
// it is the signed-out landing but the lobby once signed in, so callers decide
// with auth state (see InstallBannerGate). Help topic paths are covered by the
// prefix check below.
const MARKETING_KEYS: RouteKey[] = [
  'features',
  'press',
  'playByPost',
  'howToDnd',
  'howToRun',
  'vsDiscord',
  'altRpol',
  'altMythWeavers',
  'help',
  'privacy',
  'terms',
]

// Strips a single trailing slash (except on the root) so route-registry
// lookups agree with how React Router matches `/path/`. Shared by the SEO
// metadata lookups and the marketing gates.
export function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
}

// True for the always-marketing surfaces. Consumed by the gates that keep
// app-only surfaces (install banner, changelog auto-open) off these pages.
export function isMarketingPath(pathname: string): boolean {
  const normalized = normalizePath(pathname)
  if (normalized.startsWith(`${ROUTES.help}/`)) return true
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
  'changelog',
  'about',
]

// Route templates whose concrete instances are public and prerendered (one
// PUBLIC_ROUTES entry per HELP_TOPICS slug), but which are not themselves a
// concrete path. Excluded from the app-shell rewrite so the splat cannot
// shadow the prerendered help pages, and from the "every non-public route"
// guard's expected set.
export const PUBLIC_DYNAMIC_ROUTE_KEYS: RouteKey[] = ['helpTopic', 'gameSystem']

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
