import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'

// Shared public-site footer (issue #644). Every indexable marketing/content
// route is linked here so the pages form a crawlable internal-link graph.
//
// The link list is grouped so the footer reads as columns on desktop while
// staying compact on phones: below `md` the groups collapse behind a single
// native <details> disclosure (issue #706). The switch is CSS-only — the two
// variants are both rendered and toggled by `hidden md:grid` / `md:hidden` — so
// the prerendered public pages hydrate identically on every viewport (any
// JS media-query branch would mismatch the 1280px prerender snapshot).
const LINK = 'text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors'
const GROUP_HEADING = 'text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400 mb-2'

type FooterLink = { label: string; to: string } | { label: string; href: string }

interface FooterGroup {
  label: string
  links: FooterLink[]
}

const FOOTER_GROUPS: FooterGroup[] = [
  {
    label: 'Product',
    links: [
      { label: 'Home', to: '/' },
      { label: 'Features', to: '/features' },
      { label: 'Dice Roller', to: '/dice-roller' },
      { label: 'Play-by-Post', to: '/play-by-post' },
      { label: 'Shadowdark', to: '/game-systems/shadowdark' },
    ],
  },
  {
    label: 'Guides',
    links: [
      { label: 'Play D&D by Post', to: '/how-to/play-by-post-dnd' },
      { label: 'Run a Play-by-Post Game', to: '/how-to/run-play-by-post' },
      { label: 'Help', to: '/help' },
    ],
  },
  {
    label: 'Compare',
    links: [
      { label: 'vs Discord', to: '/vs/discord' },
      { label: 'RPOL Alternative', to: '/alternatives/rpol' },
      { label: 'Myth-Weavers Alternative', to: '/alternatives/myth-weavers' },
    ],
  },
  {
    label: 'Company',
    links: [
      { label: 'Press Kit', to: '/press' },
      { label: 'Privacy Policy', to: '/privacy' },
      { label: 'Terms of Service', to: '/terms' },
    ],
  },
  {
    label: 'Elsewhere',
    links: [
      { label: 'GitHub', href: 'https://github.com/alvarocavalcanti/ttrpgpbp' },
      { label: 'Buy Me a Coffee', href: 'https://www.buymeacoffee.com/alvarocavalcanti' },
      { label: 'Ko-fi', href: 'https://ko-fi.com/O4O1WSP5B' },
      { label: 'You See This — token art', href: 'https://youseethis.blog' },
    ],
  },
]

function FooterLinkItem({ link }: { link: FooterLink }) {
  if ('to' in link) {
    return (
      <Link to={link.to} className={LINK}>
        {link.label}
      </Link>
    )
  }
  return (
    <a href={link.href} target="_blank" rel="noreferrer" className={LINK}>
      {link.label}
    </a>
  )
}

function FooterGroupList({ group }: { group: FooterGroup }) {
  return (
    <section>
      <h2 className={GROUP_HEADING}>{group.label}</h2>
      <ul className="space-y-1">
        {group.links.map((link) => (
          <li key={link.label}>
            <FooterLinkItem link={link} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SiteFooter() {
  // The <details> owns its open state; this mirrors it only so Escape-to-close
  // is registered while the disclosure is open. It never affects markup, so it
  // cannot cause a hydration mismatch.
  const [isOpen, setIsOpen] = useState(false)
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false
  }
  useEscapeToClose(close, isOpen)

  return (
    <footer className="border-t border-surface-200 dark:border-surface-700 px-4 sm:px-6 py-8">
      <p className="text-center text-sm text-surface-600 dark:text-surface-400 mb-4">
        {'by '}
        <a
          href="https://memorablenaton.es"
          target="_blank"
          rel="noreferrer"
          className="text-primary-600 dark:text-primary-400 hover:underline"
        >
          Alvaro Cavalcanti
        </a>
      </p>

      <nav aria-label="Footer" className="text-sm">
        {/* Desktop: grouped columns, always visible. */}
        <div className="hidden md:grid max-w-6xl mx-auto md:grid-cols-3 lg:grid-cols-5 gap-6">
          {FOOTER_GROUPS.map((group) => (
            <FooterGroupList key={group.label} group={group} />
          ))}
        </div>

        {/* Mobile: one disclosure that opens upward over the content, so it
            never reflows the article behind it. */}
        <details
          ref={detailsRef}
          data-testid="footer-disclosure"
          onToggle={(e) => setIsOpen(e.currentTarget.open)}
          className="md:hidden relative"
        >
          <summary className="relative z-40 flex items-center justify-center min-h-11 py-3 cursor-pointer text-surface-600 dark:text-surface-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
            Site links
          </summary>
          <div
            data-testid="footer-backdrop"
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-30 bg-surface-600/75 dark:bg-surface-900/80"
          />
          <div className="absolute bottom-full left-0 z-40 w-full max-h-[70dvh] overflow-y-auto bg-white dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700 shadow-lg p-4 space-y-4">
            {FOOTER_GROUPS.map((group) => (
              <FooterGroupList key={group.label} group={group} />
            ))}
          </div>
        </details>
      </nav>
    </footer>
  )
}
