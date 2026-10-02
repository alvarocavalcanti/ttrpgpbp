// FAQ content for /features (issue #644). Single source for the visible FAQ
// section and the build-time FAQPage JSON-LD. Keep answers free of `</script>`
// and plain text; this module stays free of React/`import.meta` so the SEO
// build scripts can import it.

export interface FaqItem {
  question: string
  answer: string
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'Can I install Role by Post and use it offline?',
    answer:
      'Yes. Role by Post installs like an app, works offline, and sends push alerts when it is your turn.',
  },
  {
    question: 'How do the dice rolls work?',
    answer:
      'Tap dice notation in a message to roll it, or open an ability check with your modifier pre-filled. Pool and success dice are supported, and every result shows its full breakdown.',
  },
  {
    question: 'Can I play my favorite game system?',
    answer:
      'Bring any tabletop RPG. Generic play is built in, with optional Shadowdark character stats when useful.',
  },
  {
    question: 'Is Role by Post good on a phone?',
    answer:
      'Yes. Role by Post is mobile-first and installs like a native chat app, so you can post from any device.',
  },
  {
    question: 'Does it include safety tools?',
    answer:
      'Yes. Lines and veils plus an anonymous X-card are built into every channel, with no extra setup.',
  },
  {
    question: 'Can I keep a copy of my campaign?',
    answer: 'Yes. Export the full message history to a Markdown file whenever you like.',
  },
  {
    question: 'How do I sign in?',
    answer: 'Continue with Google or a one-time email link — there is nothing to remember.',
  },
  {
    question: 'Is Role by Post free?',
    answer: 'Yes. Role by Post is free to use.',
  },
]
