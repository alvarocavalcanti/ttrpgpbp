import { describe, it, expect } from 'vitest'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
// @ts-expect-error — tailwind config is an untyped JS module
import config from '../tailwind.config.js'

// Token smoke test: guards the semantic palette so component classes can't
// drift back to ad-hoc hex values. Values must match the originals they
// replaced (indigo/gray scales, parchment paper tones).
describe('tailwind design tokens', () => {
  const extend = (config.theme as { extend: { colors: Record<string, unknown>; fontFamily: Record<string, unknown> } }).extend
  const colors = extend.colors

  it('maps serif to Crimson Pro for narrative text', () => {
    expect(extend.fontFamily.serif).toContain('"Crimson Pro"')
  })

  it('aliases primary to the indigo scale', () => {
    expect(colors.primary).toMatchObject({ 600: '#4f46e5', 700: '#4338ca' })
  })

  it('aliases surface to the gray scale', () => {
    expect(colors.surface).toMatchObject({ 800: '#1f2937', 900: '#111827' })
  })

  it('defines the parchment paper tones', () => {
    expect(colors.parchment).toMatchObject({
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
    })
  })
})

// Message heading scale (docs/audit/20260923). Values are literal (DAMP) so a
// silent edit to the modifier fails here. The compile-level test guards the
// cascade: `prose-chat` must emit after `prose-sm`, or prose-sm's h1 wins.
describe('message heading scale', () => {
  const extend = (config.theme as { extend: { typography: { chat: { css: Record<string, any> } } } }).extend
  const typography = extend.typography

  it('sizes chat h1 to the old h3 ratio and flattens h3-h6 to body size', () => {
    expect(typography.chat.css.h1.fontSize).toBe('1.2857em')
    expect(typography.chat.css.h2.fontSize).toBe('1.1429em')
    expect(typography.chat.css['h3, h4, h5, h6']).toMatchObject({ fontSize: '1em', fontWeight: '600' })
  })

  it('emits the prose-chat h1 rule after prose-sm so it wins the cascade', async () => {
    const result = await postcss([
      tailwindcss({ ...config, content: [{ raw: '<div class="prose prose-sm prose-chat"></div>' }] }),
    ]).process('@tailwind base;@tailwind components;@tailwind utilities;', { from: undefined })
    const smIndex = result.css.indexOf('.prose-sm :where(h1)')
    const chatIndex = result.css.indexOf('.prose-chat :where(h1)')
    expect(smIndex).toBeGreaterThan(-1)
    expect(chatIndex).toBeGreaterThan(smIndex)
    expect(result.css.slice(chatIndex, chatIndex + 200)).toMatch(/font-size:\s*1\.2857em/)
  })
})
