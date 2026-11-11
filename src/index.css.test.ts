import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// Guards the shared dark-mode base rules in the stylesheet. Component-level
// classes can drift and were the cause of repeated dark-mode regressions
// (dark surfaces without matching text color), so the contracts that apply to
// every input/select/textarea and every focus ring live here in one place.
describe('index.css dark-mode base rules', () => {
  const css = readFileSync(resolve(import.meta.dirname, 'index.css'), 'utf8')

  it('pins body colors for both themes', () => {
    expect(css).toMatch(/bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100/)
  })

  it('gives every form control a readable text and placeholder color in dark mode', () => {
    expect(css).toMatch(/input,\n  select,\n  textarea/)
    expect(css).toMatch(/text-gray-900 placeholder-gray-400 dark:text-gray-100 dark:placeholder-gray-500/)
  })

  it('recolors the focus-ring offset to the dark surface instead of white', () => {
    expect(css).toMatch(/:is\(\.dark \*\) \*:focus-visible/)
    expect(css).toMatch(/--tw-ring-offset-color: #1f2937/)
  })

  it('scales the root font size from the Text size preference (#807)', () => {
    expect(css).toMatch(/html\s*\{\s*font-size:\s*calc\(106\.25%\s*\*\s*var\(--text-scale,\s*1\)\)/)
  })

  it('has no leftover text-size setting attribute rules (#523)', () => {
    expect(css).not.toMatch(/data-text-size/)
  })
})