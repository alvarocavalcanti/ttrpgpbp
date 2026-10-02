import { Link } from 'react-router-dom'

// Shared public-site footer (issue #644). Every indexable marketing/content
// route is linked here so the pages form a crawlable internal-link graph.
const LINK = 'text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors'

export function SiteFooter() {
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
      <nav aria-label="Footer" className="max-w-6xl mx-auto flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
        <Link to="/" className={LINK}>
          Home
        </Link>
        <Link to="/features" className={LINK}>
          Features
        </Link>
        <Link to="/dice-roller" className={LINK}>
          Dice Roller
        </Link>
        <Link to="/game-systems/shadowdark" className={LINK}>
          Shadowdark
        </Link>
        <Link to="/play-by-post" className={LINK}>
          Play-by-Post
        </Link>
        <Link to="/how-to/play-by-post-dnd" className={LINK}>
          Play D&amp;D by Post
        </Link>
        <Link to="/how-to/run-play-by-post" className={LINK}>
          Run a Play-by-Post Game
        </Link>
        <Link to="/vs/discord" className={LINK}>
          vs Discord
        </Link>
        <Link to="/alternatives/rpol" className={LINK}>
          RPOL Alternative
        </Link>
        <Link to="/alternatives/myth-weavers" className={LINK}>
          Myth-Weavers Alternative
        </Link>
        <Link to="/help" className={LINK}>
          Help
        </Link>
        <Link to="/privacy" className={LINK}>
          Privacy Policy
        </Link>
        <Link to="/terms" className={LINK}>
          Terms of Service
        </Link>
        <a href="https://github.com/alvarocavalcanti/ttrpgpbp" target="_blank" rel="noreferrer" className={LINK}>
          GitHub
        </a>
        <a href="https://www.buymeacoffee.com/alvarocavalcanti" target="_blank" rel="noreferrer" className={LINK}>
          Buy Me a Coffee
        </a>
        <a href="https://ko-fi.com/O4O1WSP5B" target="_blank" rel="noreferrer" className={LINK}>
          Ko-fi
        </a>
        <a href="https://youseethis.blog" target="_blank" rel="noreferrer" className={LINK}>
          You See This — token art
        </a>
      </nav>
    </footer>
  )
}
