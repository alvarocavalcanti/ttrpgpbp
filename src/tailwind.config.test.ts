import { describe, it, expect } from 'vitest'
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
