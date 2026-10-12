import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import MarkdownImpl from '../components/MarkdownImpl'

// Spoilers render as the interactive Spoiler control (role="button"), not as
// a bare span — the parser and the renderer are one unit in MarkdownImpl.
function spoilerTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('span[role="button"]')).map(el => el.textContent ?? '')
}

describe('remarkSpoiler (issue #709)', () => {
  it('turns ||…|| into a hidden spoiler control', () => {
    const { container } = render(<MarkdownImpl spoilers>{'Look out ||the bridge is trapped|| today'}</MarkdownImpl>)
    expect(spoilerTexts(container)).toEqual(['the bridge is trapped'])
  })

  it('finds several spoilers in one message', () => {
    const { container } = render(<MarkdownImpl spoilers>{'||one|| and ||two||'}</MarkdownImpl>)
    expect(spoilerTexts(container)).toEqual(['one', 'two'])
  })

  it('leaves ||…|| inside inline code alone', () => {
    const { container } = render(<MarkdownImpl spoilers>{'Type `||x||` to hide'}</MarkdownImpl>)
    expect(container.querySelector('span[role="button"]')).toBeNull()
    expect(container.querySelector('code')?.textContent).toBe('||x||')
  })

  it('leaves ||…|| inside fenced code blocks alone', () => {
    const { container } = render(<MarkdownImpl spoilers>{'```\n||x||\n```'}</MarkdownImpl>)
    expect(container.querySelector('span[role="button"]')).toBeNull()
  })

  it('ignores empty ||||', () => {
    const { container } = render(<MarkdownImpl spoilers>{'||||'}</MarkdownImpl>)
    expect(container.querySelector('span[role="button"]')).toBeNull()
  })

  it('stays inert without the spoilers prop (help/legal docs)', () => {
    const { container } = render(<MarkdownImpl>{'Hide ||the twist||'}</MarkdownImpl>)
    expect(container.querySelector('span[role="button"]')).toBeNull()
    expect(container.textContent).toContain('||the twist||')
  })

  it('composes with chat-style line breaks', () => {
    const { container } = render(<MarkdownImpl breaks spoilers>{'a ||x|| b\nc'}</MarkdownImpl>)
    expect(spoilerTexts(container)).toEqual(['x'])
    expect(container.querySelector('br')).not.toBeNull()
  })
})
