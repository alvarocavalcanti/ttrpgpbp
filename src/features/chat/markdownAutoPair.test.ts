import { describe, it, expect } from 'vitest'
import { markdownAutoPair } from './markdownAutoPair'
import { MAX_MESSAGE_LENGTH } from '../../constants'

// `|` in these tests marks the caret, matching the way the feature was
// specified; it is never part of the text.
describe('markdownAutoPair', () => {
  it('pairs an italic opener at the end of the text', () => {
    const r = markdownAutoPair('hi ', 3, '*')
    expect(r).toEqual({ kind: 'paired', value: 'hi **', caret: 4 })
  })

  it('nests a second asterisk into a bold pair, caret inside', () => {
    const r = markdownAutoPair('**', 1, '*')
    expect(r).toEqual({ kind: 'paired', value: '****', caret: 2 })
  })

  it('nests a second tilde into a strikethrough pair, caret inside', () => {
    const r = markdownAutoPair('~~', 1, '~')
    expect(r).toEqual({ kind: 'paired', value: '~~~~', caret: 2 })
  })

  it('pairs an inline code backtick', () => {
    const r = markdownAutoPair('', 0, '`')
    expect(r).toEqual({ kind: 'paired', value: '``', caret: 1 })
  })

  it('skips over the closer after bold content', () => {
    expect(markdownAutoPair('**bold**', 6, '*')).toEqual({ kind: 'skip' })
  })

  it('skips over the second closer of a bold pair', () => {
    expect(markdownAutoPair('**bold**', 7, '*')).toEqual({ kind: 'skip' })
  })

  it('skips over a strikethrough closer', () => {
    expect(markdownAutoPair('~~strike~~', 8, '~')).toEqual({ kind: 'skip' })
  })

  it('skips a closer in the middle of a sentence', () => {
    expect(markdownAutoPair('hi **bold** there', 9, '*')).toEqual({ kind: 'skip' })
  })

  it('pairs instead of skipping after whitespace', () => {
    const r = markdownAutoPair('hi ** ', 6, '*')
    expect(r).toEqual({ kind: 'paired', value: 'hi ** **', caret: 7 })
  })

  it('ignores an escaped marker', () => {
    expect(markdownAutoPair('a \\', 3, '*')).toBeNull()
  })

  it('ignores underscores, pipes and other punctuation', () => {
    expect(markdownAutoPair('x', 1, '_')).toBeNull()
    expect(markdownAutoPair('x', 1, '|')).toBeNull()
    expect(markdownAutoPair('x', 1, '[')).toBeNull()
    expect(markdownAutoPair('x', 1, '(')).toBeNull()
  })

  it('refuses a pair that would exceed the message limit', () => {
    const atLimit = 'a'.repeat(MAX_MESSAGE_LENGTH - 1)
    expect(markdownAutoPair(atLimit, atLimit.length, '*')).toBeNull()
  })

  it('clamps an out-of-range caret instead of throwing', () => {
    expect(markdownAutoPair('hi', 99, '*')).toEqual({ kind: 'paired', value: 'hi**', caret: 3 })
    expect(markdownAutoPair('hi', -5, '*')).toEqual({ kind: 'paired', value: '**hi', caret: 1 })
  })
})
