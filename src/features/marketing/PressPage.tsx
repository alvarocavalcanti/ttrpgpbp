import { Link } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { env } from '../../env'
import { MAX_CHANNELS_PER_USER } from '../../constants'
import { useAuth } from '../auth/useAuth'
import { MarketingHeader } from './MarketingHeader'
import { SiteFooter } from './SiteFooter'

// Public press kit (issue #646). Must stay Suspense-free and eager: the
// prerender script snapshots it and the client hydrates the baked markup, so a
// route-level boundary would throw React #418. Copy interpolations are built
// as single string nodes on purpose — two adjacent text nodes merge when HTML
// is re-parsed, which React reports as a hydration mismatch (see #643).
const GITHUB_URL = 'https://github.com/alvarocavalcanti/ttrpgpbp'

const SHOTS = [
  {
    src: '/help-images/lobby-with-channels.png',
    alt: 'Role by Post campaign lobby listing joined channels with unread counts',
    caption: 'The campaign lobby: every table in one place, with unread counts.',
  },
  {
    src: '/help-images/message-actions.png',
    alt: 'A message with reply, edit, reaction, and report actions',
    caption: 'A chat-first timeline that reads back like a story.',
  },
  {
    src: '/help-images/ability-check.png',
    alt: 'An ability check sheet with a modifier field and advantage toggle',
    caption: 'Dice rolls and ability checks with the full breakdown.',
  },
  {
    src: '/help-images/safety-tools.png',
    alt: 'Safety tools screen listing Lines and Veils for the table',
    caption: 'Built-in safety tools: Lines and Veils plus an anonymous X-Card.',
  },
  {
    src: '/help-images/status-bar.png',
    alt: 'Channel status bar showing active players and story notes',
    caption: 'A persistent status bar keeps initiative and story notes visible.',
  },
]

export function PressPage() {
  const { user } = useAuth()

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path="/press" />
      {/* Slim header for anonymous visitors only — hidden to match the
          prerendered signed-out markup and avoid stacking with the app header. */}
      {!user && <MarketingHeader />}

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 pb-16">
        <section className="pt-6 pb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
            Press kit
          </h1>
          <p className="mt-2 text-lg font-medium text-surface-700 dark:text-surface-300">
            Role by Post is a chat-first app for asynchronous tabletop RPGs.
          </p>
          <p className="mt-4 text-base text-surface-600 dark:text-surface-400">
            Role by Post keeps a tabletop roleplaying group&apos;s story moving one post at a
            time. Players write and roll from any phone or browser; the story stays in one
            readable timeline instead of scattering across chat apps, forums, and scheduling
            tools. It works for any tabletop RPG, with optional Shadowdark character stats when
            a table wants them.
          </p>
          <div className="mt-6 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-100">
              What it isn&apos;t — not a VTT
            </h2>
            <p className="mt-2 text-sm sm:text-base text-surface-600 dark:text-surface-400">
              Role by Post is not a virtual tabletop. There are no battle maps, tactical combat
              automation, animated dice, or AI-generated content. Each channel links out to its
              map and shared resources, and every player can pin a character sheet URL, so the
              table stays one tap away without leaving the conversation.
            </p>
          </div>
        </section>

        <section className="py-10 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Fact sheet</h2>
          <dl className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold text-surface-900 dark:text-surface-100">Product</dt>
            <dd className="text-surface-600 dark:text-surface-400">Role by Post</dd>

            <dt className="font-semibold text-surface-900 dark:text-surface-100">What it is</dt>
            <dd className="text-surface-600 dark:text-surface-400">
              A chat-first web app for asynchronous tabletop roleplaying (play-by-post).
            </dd>

            <dt className="font-semibold text-surface-900 dark:text-surface-100">Category</dt>
            <dd className="text-surface-600 dark:text-surface-400">
              Play-by-post RPG chat — not a virtual tabletop (VTT).
            </dd>

            <dt className="font-semibold text-surface-900 dark:text-surface-100">Price</dt>
            <dd className="text-surface-600 dark:text-surface-400">{`Free, with no paid tier — every account gets a generous campaign limit (default ${MAX_CHANNELS_PER_USER} active campaigns).`}</dd>

            <dt className="font-semibold text-surface-900 dark:text-surface-100">Platforms</dt>
            <dd className="text-surface-600 dark:text-surface-400">
              Web, on any modern browser — installable as a home-screen app on phones and
              desktops, with push notifications.
            </dd>

            <dt className="font-semibold text-surface-900 dark:text-surface-100">Audience</dt>
            <dd className="text-surface-600 dark:text-surface-400">
              Tabletop RPG groups who want to keep playing between sessions.
            </dd>
          </dl>
        </section>

        <section className="py-10 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">What it does</h2>
          <ul className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              'Chat-first campaign timeline with markdown, scene breaks, replies, and reactions',
              'Clickable dice rolls and ability checks with the full breakdown',
              'Private, invite-only campaign channels',
              'NPC personas with names and portraits',
              'Built-in safety tools: Lines and Veils plus an anonymous X-Card',
              'Full-text search and per-channel roll history',
              'Push notifications when it is your turn',
              'Installable, offline-capable progressive web app',
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3">
                <svg
                  className="mt-0.5 w-5 h-5 shrink-0 text-primary-600 dark:text-primary-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span className="text-sm text-surface-600 dark:text-surface-400">{feature}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="py-10 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Screenshots</h2>
          <div className="mt-6 grid gap-8 sm:grid-cols-2">
            {SHOTS.map((shot, index) => (
              <figure key={shot.src} className="m-0">
                <img
                  src={shot.src}
                  alt={shot.alt}
                  width={360}
                  height={780}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  className="w-full max-w-[240px] mx-auto h-auto rounded-2xl border border-surface-200 dark:border-surface-700 shadow"
                />
                <figcaption className="mt-3 text-sm text-center text-surface-600 dark:text-surface-400">
                  {`${shot.caption} `}
                  <a
                    href={shot.src}
                    download
                    className="text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Download full size
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="py-10 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Brand assets</h2>
          <ul className="mt-6 space-y-3">
            <li>
              <a
                href="/RoleByPost.png"
                download
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                Role by Post logo (PNG)
              </a>
            </li>
            <li>
              <a
                href="/og-image.png"
                download
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                Social share card (PNG, 1200×630)
              </a>
            </li>
          </ul>
        </section>

        <section className="py-10 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Press contact</h2>
          <p className="mt-4 text-base text-surface-600 dark:text-surface-400">
            {`For interviews, review access, or anything else, email `}
            <a
              href={`mailto:${env.VITE_CONTROLLER_EMAIL}`}
              className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
            >
              {env.VITE_CONTROLLER_EMAIL}
            </a>
            .
          </p>
        </section>

        <section className="py-10 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-100">Links</h2>
          <ul className="mt-6 space-y-3">
            <li>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                GitHub repository
              </a>
            </li>
            <li>
              <Link to="/features" className="text-primary-600 dark:text-primary-400 hover:underline font-medium">
                Features
              </Link>
            </li>
            <li>
              <Link
                to="/help/changelog"
                className="text-primary-600 dark:text-primary-400 hover:underline font-medium"
              >
                Changelog
              </Link>
            </li>
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
