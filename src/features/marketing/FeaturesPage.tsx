import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from '../../components/ThemeToggle'
import { Seo } from '../../components/Seo'
import { ImageViewerModal } from '../../components/ImageViewerModal'
import { useAuth } from '../auth/useAuth'
import { trackEvent } from '../../lib/analytics'
import { FAQ_ITEMS } from '../../lib/faq'
import { SiteFooter } from './SiteFooter'

type Track = 'gm' | 'player'

interface FeatureCard {
  title: string
  copy: string
  shot: string
  alt: string
}

interface GalleryImage {
  src: string
  alt: string
}

// The hero phone mockup shows the campaign lobby — the same capture as the
// first player card. Clicking it opens the enlarged viewer (issue #615); the
// gallery dedupes by src so it maps to one shared entry, never a duplicate.
const HERO_SHOT = '/help-images/lobby-with-channels.png'
const HERO_ALT = 'Role by Post campaign lobby on a phone'

// Builds the enlarged-viewer sequence for the active track from the
// full-size PNGs (never the card thumbnails). The hero is prepended only
// when no card already shows it (the GM track); on the player track the
// shared lobby entry keeps the card's descriptive alt.
function buildGallery(cards: FeatureCard[]): { items: GalleryImage[]; heroIndex: number } {
  const items: GalleryImage[] = cards.map((c) => ({ src: c.shot, alt: c.alt }))
  const heroIndex = items.findIndex((i) => i.src === HERO_SHOT)
  if (heroIndex === -1) {
    items.unshift({ src: HERO_SHOT, alt: HERO_ALT })
    return { items, heroIndex: 0 }
  }
  return { items, heroIndex }
}

// Screenshots are the committed help captures in public/help-images/ (360x780 CSS,
// captured at 3x). The cards render at 80-96px CSS, so they serve 320px WebP
// thumbnails from public/help-images/thumbs/ (the full PNGs stay for the help docs).
// Derivation (not a hand-typed thumb field) keeps a card from ever pointing
// at the wrong file; the test pins the resulting paths.
const thumbSrc = (shot: string) => shot.replace('/help-images/', '/help-images/thumbs/').replace(/\.png$/, '.webp')
const GM_CARDS: FeatureCard[] = [
  {
    title: 'Run the table your way',
    copy: 'Private channels with invite links, an optional password, character profiles, and a persistent status bar for initiative and notes.',
    shot: '/help-images/gm-settings.png',
    alt: 'Channel settings screen with game system, member, and safety options',
  },
  {
    title: 'Speak as your NPCs',
    copy: 'Give every non-player character a name and portrait. Past messages keep their look even when the roster changes.',
    shot: '/help-images/npc-composer.png',
    alt: 'Message composer in NPC mode with portrait picker',
  },
  {
    title: 'Keep the story on track',
    copy: 'A persistent status bar holds initiative order, active players, and notes in markdown — always one glance away.',
    shot: '/help-images/status-bar.png',
    alt: 'Channel status bar showing active players and story notes',
  },
  {
    title: 'Safety tools built in',
    copy: 'Lines and veils plus an anonymous X-card keep every table comfortable, with no awkward conversation needed.',
    shot: '/help-images/safety-tools.png',
    alt: 'Safety tools screen listing lines and veils',
  },
]

const PLAYER_CARDS: FeatureCard[] = [
  {
    title: 'Your campaigns in one place',
    copy: 'Every private campaign you join lives in one lobby, sorted by recent play, with unread counts and search.',
    shot: '/help-images/lobby-with-channels.png',
    alt: 'Lobby listing joined channels with unread counts',
  },
  {
    title: 'Chat that reads like a story',
    copy: 'Markdown, scene breaks, replies, reactions, and whispers with the GM — a timeline that reads back like fiction.',
    shot: '/help-images/message-actions.png',
    alt: 'Message with reply, edit, reaction, and report actions',
  },
  {
    title: 'Roll straight from the message',
    copy: 'Tap dice notation to roll, or open an ability check with your modifier pre-filled. Results show the full breakdown.',
    shot: '/help-images/ability-check.png',
    alt: 'Ability check sheet with modifier and advantage toggle',
  },
  {
    title: 'Everything one tap away',
    copy: 'Roll history, channel media, the NPC roster, safety tools, and search live in the channel sidebar.',
    shot: '/help-images/sidebar.png',
    alt: 'Channel sidebar with media, rolls, NPCs, and safety tools',
  },
  {
    title: 'Dice pools that read as rolled',
    copy: 'For games where each die is read on its own: roll NdMp to list every face, or NdM>=T to count successes against a target. The roller has matching Pool and Successes modes.',
    shot: '/help-images/dice-panel.png',
    alt: 'Dice Roller with quick-roll chips and the Successes pool mode selected, showing the target-number field',
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
  { title: 'Sign in your way', copy: 'Continue with Google or a one-time email link — nothing to remember.' },
]

// The guided tour (issue #647): a linear walkthrough of one session, distinct
// from the GM/player feature cards. Reuses the committed help captures (thumbs
// via `thumbSrc`), so no new screenshots and nothing is fetched at runtime.
const TOUR_STEPS: FeatureCard[] = [
  {
    title: 'Create your campaign',
    copy: 'Open a channel, name your table, and set the game system. Players join by invite link, with an optional password.',
    shot: '/help-images/gm-settings.png',
    alt: 'Channel settings screen with game system, member, and safety options',
  },
  {
    title: 'Gather the table',
    copy: 'Every campaign you play lives in one lobby, sorted by recent play, with unread counts so nobody loses the thread.',
    shot: '/help-images/lobby-with-channels.png',
    alt: 'Lobby listing joined channels with unread counts',
  },
  {
    title: 'Play out a scene',
    copy: 'Posts read back like a story: markdown, scene breaks, replies, reactions, and whispers with the GM in the same timeline.',
    shot: '/help-images/message-actions.png',
    alt: 'Message with reply, edit, reaction, and report actions',
  },
  {
    title: 'Roll the dice',
    copy: 'Tap dice notation to roll, or open an ability check with the modifier pre-filled. Every result shows its full breakdown.',
    shot: '/help-images/dice-panel.png',
    alt: 'Dice Roller with quick-roll chips and the Successes pool mode selected',
  },
  {
    title: 'Keep everyone safe',
    copy: 'Lines and veils plus an anonymous X-card keep the table comfortable, without an awkward conversation.',
    shot: '/help-images/safety-tools.png',
    alt: 'Safety tools screen listing lines and veils',
  },
  {
    title: 'Keep momentum',
    copy: 'A persistent status bar holds initiative order, active players, and story notes — always one glance away.',
    shot: '/help-images/status-bar.png',
    alt: 'Channel status bar showing active players and story notes',
  },
]

function StartCta({ location }: { location: string }) {
  const { user } = useAuth()
  return (
    <Link
      // Signed-out visitors go straight to sign-in; signed-in visitors return
      // to the lobby (`/`), not the marketing landing.
      to={user ? '/' : '/login'}
      onClick={() => trackEvent('marketing_cta_click', { location })}
      className="inline-flex items-center justify-center min-h-11 px-8 py-3 text-base font-semibold rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
    >
      Start now!
    </Link>
  )
}

export function FeaturesPage() {
  const { user } = useAuth()
  const [track, setTrack] = useState<Track>('gm')

  const selectTrack = (next: Track) => {
    if (next === track) return
    setTrack(next)
    trackEvent('marketing_track_toggle', { track: next })
  }

  const cards = track === 'gm' ? GM_CARDS : PLAYER_CARDS
  // Gallery index into the active track's enlarged-viewer sequence
  // (issue #615). Null means the viewer is closed.
  const [viewing, setViewing] = useState<number | null>(null)
  // The guided tour's own viewer index (issue #647). Kept separate from
  // `viewing` so it never opens the wrong image when the track toggles.
  const [tourViewing, setTourViewing] = useState<number | null>(null)
  const gallery = buildGallery(cards)
  // A track switch must not leave a stale gallery index behind.
  useEffect(() => {
    setViewing(null)
  }, [track])

  const current = viewing !== null ? gallery.items[viewing] : undefined

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900">
      <Seo path="/features" />
      {/* Slim header for anonymous visitors only: signed-in users already get
          the app header, and a second one would stack. Keyed on the user, not
          the auth loading state, so the prerendered signed-out markup hydrates
          cleanly (issue #643). */}
      {!user && (
        <header className="flex items-center justify-between gap-2 px-4 sm:px-6 py-3 max-w-6xl mx-auto w-full">
          <Link to="/features" className="flex items-center gap-2 text-lg font-bold text-surface-900 dark:text-surface-100">
            <img src="/RoleByPost.png" alt="" width={32} height={32} className="w-8 h-8 rounded" />
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
          {/* The hero mockup is also an enlarged-viewer trigger (issue
              #615). The img keeps alt="" so the button's label is the single
              accessible name; the viewer itself uses the gallery alt. */}
          <button
            type="button"
            onClick={() => setViewing(gallery.heroIndex)}
            aria-label="View campaign lobby image fullscreen"
            className="mx-auto w-52 sm:w-60 overflow-hidden rounded-[2rem] border-8 border-surface-900 dark:border-surface-100 shadow-xl cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <img
              src="/help-images/lobby-with-channels.png"
              alt=""
              width={360}
              height={780}
              fetchPriority="high"
              className="w-full h-auto block"
            />
          </button>
        </section>

        <section className="py-12 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-surface-900 dark:text-surface-100">
            A session, start to finish
          </h2>
          <p className="mt-3 text-center text-base text-surface-600 dark:text-surface-400 max-w-2xl mx-auto">
            From the first invite to the last roll — here is how a campaign plays out, without an account.
          </p>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOUR_STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4 shadow-sm"
              >
                {/* Thumbnail trigger for the tour viewer; index is the step's
                    position in TOUR_STEPS. */}
                <button
                  type="button"
                  onClick={() => setTourViewing(index)}
                  aria-label={`View ${step.title} image fullscreen`}
                  className="shrink-0 self-start rounded-xl cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {/* Empty alt like the hero trigger: the button's label is the
                      single accessible name; the viewer uses the step alt. */}
                  <img
                    src={thumbSrc(step.shot)}
                    alt=""
                    width={360}
                    height={780}
                    loading="lazy"
                    className="w-20 sm:w-24 block rounded-xl border-2 border-surface-200 dark:border-surface-700 shadow"
                  />
                </button>
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary-600 dark:text-primary-400">
                    {`Step ${index + 1}`}
                  </p>
                  <h3 className="mt-0.5 text-base font-semibold text-surface-900 dark:text-surface-100">{step.title}</h3>
                  <p className="mt-1 text-sm text-surface-600 dark:text-surface-400">{step.copy}</p>
                </div>
              </li>
            ))}
          </ol>
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
                {/* Thumbnail trigger for the enlarged viewer (issue #615).
                    The index is resolved by src so the hero-prepend/dedupe
                    shift never opens the wrong image. */}
                <button
                  type="button"
                  onClick={() =>
                    setViewing(gallery.items.findIndex((i) => i.src === card.shot))
                  }
                  aria-label={`View ${card.title} image fullscreen`}
                  className="shrink-0 self-start rounded-xl cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <img
                    src={thumbSrc(card.shot)}
                    alt={card.alt}
                    width={360}
                    height={780}
                    loading="lazy"
                    className="w-20 sm:w-24 block rounded-xl border-2 border-surface-200 dark:border-surface-700 shadow"
                  />
                </button>
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

        <section className="py-12 border-t border-surface-200 dark:border-surface-700">
          <h2 className="text-2xl sm:text-3xl font-bold text-center text-surface-900 dark:text-surface-100">
            Frequently asked questions
          </h2>
          <dl className="mt-8 max-w-3xl mx-auto space-y-6">
            {FAQ_ITEMS.map((item) => (
              <div key={item.question}>
                <dt className="text-base font-semibold text-surface-900 dark:text-surface-100">
                  {item.question}
                </dt>
                <dd className="mt-1 text-sm sm:text-base text-surface-600 dark:text-surface-400">
                  {item.answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="py-12 border-t border-surface-200 dark:border-surface-700 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-surface-900 dark:text-surface-100">
            Your table is waiting
          </h2>
          {/* Signed-in visitors arrive here from the menu drawer — the
              sign-in prompt below is for anonymous visitors only. */}
          {!user && (
            <p className="mt-3 text-base text-surface-600 dark:text-surface-400">
              Sign in with Google or an email link and start your first campaign in minutes.
            </p>
          )}
          <div className="mt-8">
            <StartCta location="bottom" />
          </div>
        </section>
      </main>

      <SiteFooter />

      {/* Enlarged viewer (issue #615). A neighbor handler is passed only
          when that neighbor exists, so the viewer clamps at both ends. */}
      {current && (
        <ImageViewerModal
          src={current.src}
          alt={current.alt}
          onClose={() => setViewing(null)}
          onPrev={viewing !== null && viewing > 0 ? () => setViewing(viewing - 1) : undefined}
          onNext={
            viewing !== null && viewing < gallery.items.length - 1
              ? () => setViewing(viewing + 1)
              : undefined
          }
        />
      )}

      {/* Guided-tour viewer (issue #647): its own gallery, so the active
          GM/player track never changes which step it opens. */}
      {tourViewing !== null && (
        <ImageViewerModal
          src={TOUR_STEPS[tourViewing].shot}
          alt={TOUR_STEPS[tourViewing].alt}
          onClose={() => setTourViewing(null)}
          onPrev={tourViewing > 0 ? () => setTourViewing(tourViewing - 1) : undefined}
          onNext={
            tourViewing < TOUR_STEPS.length - 1
              ? () => setTourViewing(tourViewing + 1)
              : undefined
          }
        />
      )}
    </div>
  )
}
