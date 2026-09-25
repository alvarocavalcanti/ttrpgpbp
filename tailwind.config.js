const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
// Semantic palette: primary (interactive accent), surface (neutral grays),
// parchment (scene/NPC paper tones). Existing indigo-/gray- classes resolve to
// the same values, so components can migrate to the semantic names gradually.
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        'slide-in-right': {
          from: { transform: 'translateX(100%)' },
          to: { transform: 'translateX(0)' },
        },
      },
      animation: {
        'slide-in-right': 'slide-in-right 0.3s ease-in-out',
      },
      fontFamily: {
        serif: ['"Crimson Pro"', 'Georgia', 'serif'],
      },
      colors: {
        primary: colors.indigo,
        surface: colors.gray,
        parchment: {
          DEFAULT: '#fdf6e3',
          dark: '#2a2620',
          border: '#e6d0a4',
          'border-dark': '#4a4238',
          ink: '#5c4a3d',
          'ink-dark': '#d8cfc0',
          'ink-strong': '#4a3b31',
          'ink-strong-dark': '#ece4d6',
          shade: '#f4e4c1',
          'shade-dark': '#3a342a',
        },
      },
      // Chat is not a document: heading sizes must stay proportionate to the
      // message text, and h4-h6 must not collapse below body size. Sizes are
      // `em`, so each prose surface keeps its own base (chat 18.06px, scene
      // 17px, channel status 14.88px) while the ratio stays constant. h1 lands
      // on today's h3 size; h3-h6 share one style. Weights for h1/h2 come from
      // the plugin's DEFAULT; h3-h6 need explicit 600 because h5/h6 have no
      // DEFAULT rule. Margins reuse h3's current em values.
      typography: {
        chat: {
          css: {
            h1: { fontSize: '1.2857em' },
            h2: { fontSize: '1.1429em' },
            'h3, h4, h5, h6': {
              fontSize: '1em',
              fontWeight: '600',
              marginTop: '1.5555556em',
              marginBottom: '0.4444444em',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
