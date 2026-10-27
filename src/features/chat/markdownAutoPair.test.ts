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

  it('pairs instead of skipping after punctuation that can only open', () => {
    // `(*` must still become `(**|**)`, not be treated as closing a pair.
    expect(markdownAutoPair('(**', 2, '*')).toEqual({ kind: 'paired', value: '(****', caret: 3 })
    expect(markdownAutoPair('“**', 2, '*')).toEqual({ kind: 'paired', value: '“****', caret: 3 })
  })

  it('skips a closer that follows closing punctuation', () => {
    expect(markdownAutoPair('**bold!**', 8, '*')).toEqual({ kind: 'skip' })
    expect(markdownAutoPair('**bold.**', 8, '*')).toEqual({ kind: 'skip' })
  })

  it('keeps italic and bold opened separately from being mistaken for closers', () => {
    // The run before the caret follows a space, so it opens a new pair.
    expect(markdownAutoPair('*a* **', 5, '*')).toEqual({ kind: 'paired', value: '*a* ****', caret: 6 })
  })

  it('never pairs a literal marker inside an inline code span', () => {
    expect(markdownAutoPair('`2`', 2, '*')).toBeNull()
    expect(markdownAutoPair('`2`', 2, '~')).toBeNull()
    expect(markdownAutoPair('`a`', 2, '*')).toBeNull()
    // Inside code the escape is literal too, so the backtick is the only escape.
    expect(markdownAutoPair('`a\\`', 3, '*')).toBeNull()
  })

  it('still steps over the closing backtick of a code span', () => {
    expect(markdownAutoPair('`2*3`', 4, '`')).toEqual({ kind: 'skip' })
  })

  it('pairs again once the code span is closed', () => {
    expect(markdownAutoPair('`a` ', 4, '*')).toEqual({ kind: 'paired', value: '`a` **', caret: 5 })
  })

  it('keeps markers literal inside a fenced code block', () => {
    expect(markdownAutoPair('```', 3, '*')).toBeNull()
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
