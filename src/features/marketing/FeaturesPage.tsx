import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../../components/ThemeToggle'
import { useAuth } from '../auth/useAuth'
import { trackEvent } from '../../lib/analytics'

type Track = 'gm' | 'player'

interface FeatureCard {
  title: string
  copy: string
  shot: string
  alt: string
}

// Screenshots are the committed help captures in public/help/ (360x780 CSS,
// captured at 3x). Reused here so the marketing page needs no new tooling.
const GM_CARDS: FeatureCard[] = [
  {
    title: 'Run the table your way',
    copy: 'Private channels with invite links, an optional password, character profiles, and a persistent status bar for initiative and notes.',
    shot: '/help/gm-settings.png',
    alt: 'Channel settings screen with game system, member, and safety options',
  },
  {
    title: 'Speak as your NPCs',
    copy: 'Give every non-player character a name and portrait. Past messages keep their look even when the roster changes.',
    shot: '/help/npc-composer.png',
    alt: 'Message composer in NPC mode with portrait picker',
  },
  {
    title: 'Keep the story on track',
    copy: 'A persistent status bar holds initiative order, active players, and notes in markdown — always one glance away.',
    shot: '/help/status-bar.png',
    alt: 'Channel status bar showing active players and story notes',
  },
  {
    title: 'Safety tools built in',
    copy: 'Lines and veils plus an anonymous X-card keep every table comfortable, with no awkward conversation needed.',
    shot: '/help/safety-tools.png',
    alt: 'Safety tools screen listing lines and veils',
  },
]

const PLAYER_CARDS: FeatureCard[] = [
  {
    title: 'Your campaigns in one place',
    copy: 'Every private campaign you join lives in one lobby, sorted by recent play, with unread counts and search.',
    shot: '/help/lobby-with-channels.png',
    alt: 'Lobby listing joined channels with unread counts',
  },
  {
    title: 'Chat that reads like a story',
    copy: 'Markdown, scene breaks, replies, reactions, and whispers with the GM — a timeline that reads back like fiction.',
    shot: '/help/message-actions.png',
    alt: 'Message with reply, edit, reaction, and report actions',
  },
  {
    title: 'Roll straight from the message',
    copy: 'Tap dice notation to roll, or open an ability check with your modifier pre-filled. Results show the full breakdown.',
    shot: '/help/ability-check.png',
    alt: 'Ability check sheet with modifier and advantage toggle',
  },
  {
    title: 'Everything one tap away',
    copy: 'Roll history, channel media, the NPC roster, safety tools, and search live in the channel sidebar.',
    shot: '/help/sidebar.png',
    alt: 'Channel sidebar with media, rolls, NPCs, and safety tools',
  },
]

const MORE_FEATURES: Array<{ title: string; copy: string }> = [
  { title: 'Drafts that survive', copy: 'The composer saves per channel and retries safely, so a dead connection never eats a post.' },
  { title: 'Never lose your place', copy: 'Unread counts and a New messages divider jump you straight back in.' },
  { title: 'Search the story', copy: 'Full-text search finds any message and jumps the timeline to it.' },
  { title: 'Take the story home', copy: 'Export the full history to a Markdown file.' },
  { title: 'Every picture in one place', copy: 'A media browser grids every image shared in the channel.' },
  { title: 'Private asides', copy: 'Whispers stay visible only to you and the GM, inside the same timeline.' },
  { title: 'Step away cleanly', copy: 'AFK status tells the table you are away and pauses your-turn alerts.' },
  { title: 'Every roll on record', copy: 'A per-channel history lists every roll with its breakdown.' },
  { title: 'Easy on the eyes', copy: 'Dark mode follows your device; text stays legible everywhere.' },
  { title: 'Plays like an app', copy: 'Installable, works offline, and sends push alerts when it is your turn.' },
  { title: 'Alerts your way', copy: 'Per channel, get everything, GM messages only, or just your turn.' },
  { title: 'Invite-only tables', copy: 'Private channels joined by invite link, with an optional password.' },
]

function StartCta({ location, className }: { location: string; className?: string }) {
  return (
    <Link
      to="/"
      onClick={() => trackEvent('marketing_cta_click', { location })}
      className={`inline-flex items-center justify-center min-h-11 px-8 py-3 text-base font-semibold rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors ${className ?? ''}`}
    >
      Start now!
    </Link>
  )
}

export function FeaturesPage() {
  const { user, loading } = useAuth()
  const [track, setTrack] = useState<Track>('gm')

  const selectTrack = (next: Track) => {
    if (next === track) return
    setTrack(next)
    trackEvent('marketing_track_toggle', { track: next })
  }

  const cards = track === 'gm' ? GM_CARDS : PLAYER_CARDS

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900">
      {/* Slim header for anonymous visitors only: signed-in users already get
          the app header, and a second one would stack. Hidden while auth is
          still loading so it never flashes next to the app header. */}
      {!loading && !user && (
        <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 max-w-6xl mx-auto w-full">
          <Link to="/features" className="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100">
            <img src="/RoleByPost.png" alt="" className="w-8 h-8 rounded" />
            Role by Post
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to="/login"
              className="inline-flex items-center min-h-11 px-4 py-2 text-sm font-medium rounded-md text-primary-700 dark:text-primary-300 hover:bg-surface-100 dark:hover:bg-surface-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              Sign in
            </Link>
          </div>
        </header>
      )}

      <main className="px-4 sm:px-6 pb-16 max-w-6xl mx-auto w-full">
        <section className="pt-10 sm:pt-16 pb-12 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
              Play your tabletop RPG, one post at a time
            </h1>
            <p className="mt-4 text-base sm:text-lg text-surface-600 dark:text-surface-400">
              Role by Post is a chat-first app for asynchronous tabletop roleplaying.
              Your group keeps the story moving from any phone or browser — no
              scheduling, no video call, no battle map required.
            </p>
            <div className="mt-8">
              <StartCta location="hero" />
            </div>
          </div>
          <div className="mx-auto w-52 sm:w-60 overflow-hidden rounded-[2rem] border-8 border-surface-900 dark:border-surface-100 shadow-xl">
            <img
              src="/help/lobby-with-channels.png"
              alt="Lobby listing joined channels with unread counts"
              width={360}
              height={780}
              className="w-full h-auto block"
            />
          </div>
        </section>

        <section className="py-12 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-surface-900 dark:text-surface-100">
            Made for your side of the table
          </h2>
          <div className="mt-6 flex justify-center">
            <div
              role="group"
              aria-label="Show features for"
              className="inline-flex rounded-lg border border-surface-300 dark:border-surface-600 p-1 bg-white dark:bg-surface-800"
            >
              <button
                type="button"
                aria-pressed={track === 'gm'}
                onClick={() => selectTrack('gm')}
                className={`min-h-11 px-6 py-2 text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  track === 'gm'
                    ? 'bg-primary-600 text-white'
                    : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
                }`}
              >
                Game Masters
              </button>
              <button
                type="button"
                aria-pressed={track === 'player'}
                onClick={() => selectTrack('player')}
                className={`min-h-11 px-6 py-2 text-sm font-semibold rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                  track === 'player'
                    ? 'bg-primary-600 text-white'
                    : 'text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
                }`}
              >
                Players
              </button>
            </div>
          </div>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {cards.map((card) => (
              <article
                key={card.title}
                className="flex gap-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 shadow-sm"
              >
                <img
                  src={card.shot}
                  alt={card.alt}
                  width={360}
                  height={780}
                  loading="lazy"
                  className="w-20 sm:w-24 shrink-0 self-start rounded-xl border-2 border-surface-200 dark:border-surface-700 shadow"
                />
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-surface-900 dark:text-surface-100">{card.title}</h3>
                  <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">{card.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="py-12 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-surface-900 dark:text-surface-100">
            And a lot more
          </h2>
          <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {MORE_FEATURES.map((feature) => (
              <li key={feature.title} className="flex items-start gap-3">
                <svg className="mt-0.5 w-5 h-5 shrink-0 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">{feature.title}</h3>
                  <p className="mt-0.5 text-sm text-surface-600 dark:text-surface-400">{feature.copy}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="py-12 border-t border-surface-200 dark:border-surface-700 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-surface-100">
            Your table is waiting
          </h2>
          <p className="mt-3 text-base text-surface-600 dark:text-surface-400">
            Sign in with Google and start your first campaign in minutes.
          </p>
          <div className="mt-8">
            <StartCta location="bottom" />
          </div>
        </section>
      </main>

      <footer className="border-t border-surface-200 dark:border-surface-700 px-4 sm:px-6 py-8">
        <nav aria-label="Footer" className="max-w-6xl mx-auto flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link to="/about" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            About
          </Link>
          <Link to="/privacy" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Privacy Policy
          </Link>
          <Link to="/terms" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Terms of Service
          </Link>
          <a href="https://github.com/alvarocavalcanti/ttrpgpbp" target="_blank" rel="noreferrer" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            GitHub
          </a>
          <a href="https://www.buymeacoffee.com/alvarocavalcanti" target="_blank" rel="noreferrer" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Buy Me a Coffee
          </a>
          <a href="https://ko-fi.com/O4O1WSP5B" target="_blank" rel="noreferrer" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Ko-fi
          </a>
        </nav>
      </footer>
    </div>
  )
}
