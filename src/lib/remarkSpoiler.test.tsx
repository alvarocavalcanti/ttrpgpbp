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

  it('pairs across a text sibling with no delimiters', () => {
    const { container } = render(<MarkdownImpl spoilers>{'Secret ||a **b** `code` tail|| end'}</MarkdownImpl>)
    const controls = container.querySelectorAll('span[role="button"]')
    expect(controls).toHaveLength(1)
    expect(controls[0].textContent).toContain('code')
    expect(container.textContent).not.toContain('||')
  })

  it('pairs when the opener starts the run', () => {
    const { container } = render(<MarkdownImpl spoilers>{'||**b**|| tail'}</MarkdownImpl>)
    expect(spoilerTexts(container)).toEqual(['b'])
  })

  it('hides inline formatting inside the spoiler', () => {
    const { container } = render(<MarkdownImpl spoilers>{'The killer is ||**the butler**||, obviously'}</MarkdownImpl>)
    expect(spoilerTexts(container)).toEqual(['the butler'])
    expect(container.querySelector('span[role="button"] strong')).not.toBeNull()
    expect(container.textContent).not.toContain('||')
  })

  it('hides pre-linkified dice chips inside the spoiler', () => {
    const { container } = render(<MarkdownImpl spoilers>{'Go ||through [1d20](dice:1d20) door|| now'}</MarkdownImpl>)
    const controls = container.querySelectorAll('span[role="button"]')
    expect(controls).toHaveLength(1)
    expect(controls[0].textContent).toContain('1d20')
    expect(container.textContent).not.toContain('||')
  })

  it('leaves an unclosed opener literal', () => {
    const { container } = render(<MarkdownImpl spoilers>{'a || b'}</MarkdownImpl>)
    expect(container.querySelector('span[role="button"]')).toBeNull()
    expect(container.textContent).toContain('a || b')
  })

  it('never pairs across paragraphs', () => {
    const { container } = render(<MarkdownImpl spoilers>{'||open\n\nclose||'}</MarkdownImpl>)
    expect(container.querySelector('span[role="button"]')).toBeNull()
  })

  it('keeps siblings after an unclosed opener', () => {
    const { container } = render(<MarkdownImpl spoilers>{'a ||b **c**'}</MarkdownImpl>)
    expect(container.querySelector('span[role="button"]')).toBeNull()
    expect(container.textContent).toContain('a ||b ')
    expect(container.querySelector('strong')?.textContent).toBe('c')
  })
})
