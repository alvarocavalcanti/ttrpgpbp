import { Link } from 'react-router-dom'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Seo } from '../../components/Seo'

const FEATURES = [
  {
    title: 'Real-time Chat',
    description: 'Markdown messages, scene breaks, whispers, and daily date dividers keep the story flowing.',
    icon: (
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    ),
  },
  {
    title: 'Dice Rolling',
    description: 'Clickable dice notation, advantage and disadvantage, and built-in ability checks.',
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="15.5" r="1" fill="currentColor" stroke="none" />
      </>
    ),
  },
  {
    title: 'Campaign Management',
    description: 'Private channels with invite links, character tracking, and persistent status bars.',
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    title: 'Push Notifications',
    description: "Stay in the loop with web push alerts when it's your turn or new messages arrive.",
    icon: (
      <>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </>
    ),
  },
  {
    title: 'Mobile First',
    description: 'Designed to feel like a native chat app, on your phone or on the web.',
    icon: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M12 18h.01" />
      </>
    ),
  },
]

const HERO_SHOT = '/help/lobby-with-channels.png'

// Signed-out marketing landing at `/` (issue #643). The prerender script
// snapshots this route; `data-seo="landing"` is the wait selector.
export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path="/" />
      <link rel="preload" as="image" href={HERO_SHOT} fetchPriority="high" />
      <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 max-w-5xl mx-auto w-full">
        <span className="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100">
          <img src="/RoleByPost.png" alt="" width={32} height={32} className="w-8 h-8 rounded" />
          Role by Post
        </span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            to="/login"
            className="inline-flex items-center min-h-11 px-4 py-2 text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <section className="pt-8 sm:pt-14 pb-12 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
              Play your tabletop RPG, one post at a time
            </h1>
            <p className="mt-4 text-base sm:text-lg text-surface-600 dark:text-surface-400">
              Role by Post is a chat-first app for asynchronous tabletop roleplaying. Keep the
              story moving from any phone or browser — no scheduling, no video call, no battle
              map required.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Link
                to="/login"
                className="inline-flex items-center justify-center min-h-11 px-6 py-3 text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Get started
              </Link>
              <Link
                to="/features"
                className="inline-flex items-center justify-center min-h-11 px-6 py-3 text-sm font-medium rounded-md text-surface-700 dark:text-surface-300 bg-white dark:bg-surface-800 border border-surface-300 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                See features
              </Link>
            </div>
          </div>
          <img
            src={HERO_SHOT}
            alt="Role by Post campaign lobby on a phone"
            width={360}
            height={780}
            fetchPriority="high"
            className="mx-auto w-52 sm:w-60 h-auto rounded-[2rem] border-8 border-surface-900 dark:border-surface-100 shadow-xl"
          />
        </section>

        <section className="py-12 border-t border-surface-200 dark:border-surface-700 max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">
            Text-first, no bloat
          </h2>
          <p className="mt-2 text-sm sm:text-base text-surface-600 dark:text-surface-400">
            Role by Post is a chat-first app for asynchronous tabletop RPGs, with a few
            quality-of-life tools to keep play moving. Bring any tabletop RPG: generic play is
            built in, with optional Shadowdark character stats when useful.
          </p>

          <div className="mt-6 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 text-left shadow-sm">
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              Not a VTT
            </h3>
            <p className="mt-2 text-sm sm:text-base text-surface-600 dark:text-surface-400">
              You won&apos;t find battle maps, tactical combat automation, animated dice, or
              AI-generated content here. Role by Post keeps the conversation flowing while
              reducing app and tab switching.
            </p>
            <p className="mt-2 text-sm sm:text-base text-surface-600 dark:text-surface-400">
              Instead, each channel links out to its Map and shared Resources (plus a GM-only
              resources link), and every player can pin a character sheet URL — so your table
              stays one tap away without leaving the conversation.
            </p>
          </div>
        </section>

        <section className="py-12 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-center text-2xl font-bold text-surface-900 dark:text-surface-100">
            Why Role by Post?
          </h2>
          <p className="mt-2 text-center text-sm text-surface-600 dark:text-surface-400">
            The home for asynchronous tabletop roleplaying
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-950 flex items-center justify-center text-primary-600 dark:text-primary-400">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    {feature.icon}
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-100">{feature.title}</h3>
                  <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">{feature.description}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <Link to="/features" className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline">
              See all features →
            </Link>
          </div>
        </section>
      </main>

      <footer className="text-center text-sm text-surface-600 dark:text-surface-400 space-y-2 flex flex-col items-center pb-10">
        <p>
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
        <div className="flex gap-4 text-xs">
          <Link to="/privacy" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Privacy Policy
          </Link>
          <span className="text-surface-300 dark:text-surface-700">|</span>
          <Link to="/terms" className="text-surface-500 hover:text-primary-600 dark:text-surface-400 dark:hover:text-primary-400 transition-colors">
            Terms of Service
          </Link>
        </div>
      </footer>
    </div>
  )
}
