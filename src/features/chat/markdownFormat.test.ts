import { describe, it, expect } from 'vitest'
import { applyMarkdownFormat } from './markdownFormat'
import { MAX_MESSAGE_LENGTH } from '../../constants'

describe('applyMarkdownFormat', () => {
  it('wraps a selection with bold markers and selects inner text', () => {
    const r = applyMarkdownFormat('hello world', 6, 11, 'bold', MAX_MESSAGE_LENGTH)!
    expect(r.value).toBe('hello **world**')
    expect(r.selectionStart).toBe(8)
    expect(r.selectionEnd).toBe(13)
  })

  it('inserts placeholder when selection is empty', () => {
    const r = applyMarkdownFormat('hi ', 3, 3, 'italic', MAX_MESSAGE_LENGTH)!
    expect(r.value).toBe('hi *italic*')
    expect(r.selectionStart).toBe(4)
    expect(r.selectionEnd).toBe(10)
  })

  it('wraps spoiler markers', () => {
    const r = applyMarkdownFormat('secret', 0, 6, 'spoiler', MAX_MESSAGE_LENGTH)!
    expect(r.value).toBe('||secret||')
  })

  it('wraps strikethrough and inline code', () => {
    expect(applyMarkdownFormat('x', 0, 1, 'strikethrough', MAX_MESSAGE_LENGTH)!.value).toBe('~~x~~')
    expect(applyMarkdownFormat('x', 0, 1, 'inline-code', MAX_MESSAGE_LENGTH)!.value).toBe('`x`')
  })

  it('prefixes a single line with heading', () => {
    const r = applyMarkdownFormat('title', 0, 5, 'heading', MAX_MESSAGE_LENGTH)!
    expect(r.value).toBe('## title')
  })

  it('prefixes every line of a multi-line selection', () => {
    const r = applyMarkdownFormat('a\nb\nc', 0, 5, 'bulleted-list', MAX_MESSAGE_LENGTH)!
    expect(r.value).toBe('- a\n- b\n- c')
    expect(r.selectionStart).toBe(0)
    expect(r.selectionEnd).toBe('- a\n- b\n- c'.length)
  })

  it('numbers list lines incrementally', () => {
    const r = applyMarkdownFormat('a\nb', 0, 3, 'numbered-list', MAX_MESSAGE_LENGTH)!
    expect(r.value).toBe('1. a\n2. b')
  })

  it('prefixes quote and fences code blocks', () => {
    expect(applyMarkdownFormat('hi', 0, 2, 'quote', MAX_MESSAGE_LENGTH)!.value).toBe('> hi')
    expect(applyMarkdownFormat('a\nb', 0, 3, 'code-block', MAX_MESSAGE_LENGTH)!.value).toBe('```\na\nb\n```')
  })

  it('returns null when the edit would exceed max length', () => {
    const value = 'a'.repeat(MAX_MESSAGE_LENGTH - 1)
    expect(applyMarkdownFormat(value, 0, value.length, 'bold', MAX_MESSAGE_LENGTH)).toBeNull()
  })

  it('handles selections at both ends', () => {
    expect(applyMarkdownFormat('', 0, 0, 'bold', MAX_MESSAGE_LENGTH)!.value).toBe('**bold**')
    const r = applyMarkdownFormat('ab', 2, 2, 'spoiler', MAX_MESSAGE_LENGTH)!
    expect(r.value).toBe('ab||spoiler||')
    expect(r.selectionStart).toBe(4)
  })
})
