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
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
