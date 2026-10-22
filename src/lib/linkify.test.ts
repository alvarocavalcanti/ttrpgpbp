import { describe, it, expect } from 'vitest'
import { splitLinks } from './linkify'

// Test assertions use string literals on purpose (DAMP): a change to the
// trim rules or the candidate pattern should break these tests loudly.
function links(text: string) {
  return splitLinks(text).filter((part) => part.href !== null)
}

function flat(text: string) {
  return splitLinks(text)
    .map((part) => part.text)
    .join('')
}

describe('splitLinks', () => {
  it('returns nothing for empty or whitespace-only input', () => {
    expect(splitLinks('')).toEqual([])
    expect(splitLinks('   \n ')).toEqual([{ text: '   \n ', href: null }])
  })

  it('leaves text without a URL as one plain run', () => {
    expect(splitLinks('A weekly Shadowdark game.')).toEqual([
      { text: 'A weekly Shadowdark game.', href: null },
    ])
  })

  it('linkifies a whole-string https URL', () => {
    expect(splitLinks('https://example.com/recruit')).toEqual([
      { text: 'https://example.com/recruit', href: 'https://example.com/recruit' },
    ])
  })

  it('linkifies http as well as https', () => {
    expect(links('Old link: http://example.com')).toEqual([
      { text: 'http://example.com', href: 'http://example.com' },
    ])
  })

  it('keeps the surrounding text in order and preserves newlines', () => {
    expect(splitLinks('Apply here:\nhttps://example.com/app\nPost most days.')).toEqual([
      { text: 'Apply here:\n', href: null },
      { text: 'https://example.com/app', href: 'https://example.com/app' },
      { text: '\nPost most days.', href: null },
    ])
  })

  it('linkifies several URLs', () => {
    expect(links('https://a.example and www.b.example/path')).toEqual([
      { text: 'https://a.example', href: 'https://a.example' },
      { text: 'www.b.example/path', href: 'https://www.b.example/path' },
    ])
  })

  it('gives bare www. URLs an https href but shows the text as typed', () => {
    const [part] = splitLinks('www.example.com/path')
    expect(part).toEqual({ text: 'www.example.com/path', href: 'https://www.example.com/path' })
  })

  it('drops trailing sentence punctuation from the link and keeps it as text', () => {
    expect(splitLinks('See https://example.com/app.')).toEqual([
      { text: 'See ', href: null },
      { text: 'https://example.com/app', href: 'https://example.com/app' },
      { text: '.', href: null },
    ])
    expect(flat('Read https://example.com, then https://other.example!')).toBe(
      'Read https://example.com, then https://other.example!',
    )
    expect(links('https://example.com;')).toEqual([
      { text: 'https://example.com', href: 'https://example.com' },
    ])
    expect(links('https://example.com:')).toEqual([
      { text: 'https://example.com', href: 'https://example.com' },
    ])
  })

  it('keeps balanced parentheses inside a URL', () => {
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual([
      {
        text: 'https://en.wikipedia.org/wiki/Foo_(bar)',
        href: 'https://en.wikipedia.org/wiki/Foo_(bar)',
      },
    ])
  })

  it('strips a wrapping bracket and a following period', () => {
    expect(splitLinks('(see https://example.com).')).toEqual([
      { text: '(see ', href: null },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: ').', href: null },
    ])
    expect(links('https://example.com.)')).toEqual([
      { text: 'https://example.com', href: 'https://example.com' },
    ])
  })

  it('refuses non-http(s) schemes', () => {
    expect(links('javascript:alert(1)')).toEqual([])
    expect(links('data:text/html,<b>x</b>')).toEqual([])
    expect(links('ftp://example.com/file')).toEqual([])
    // Not a scheme we autolink: bare addresses stay plain text.
    expect(links('mailto:gm@example.com')).toEqual([])
    expect(links('gm@example.com')).toEqual([])
  })

  it('does not autolink bare domains', () => {
    expect(links('example.com/recruit')).toEqual([])
  })

  it('leaves a malformed candidate inert instead of dropping it', () => {
    expect(flat('https:// then https://example.com')).toBe('https:// then https://example.com')
    expect(links('https:// then https://example.com')).toEqual([
      { text: 'https://example.com', href: 'https://example.com' },
    ])
    expect(links('www.')).toEqual([])
    // Parses as neither http nor https: the URL constructor throws.
    expect(links('https://[')).toEqual([])
    expect(flat('https://[')).toBe('https://[')
  })

  it('leaves markdown link syntax unparsed', () => {
    expect(splitLinks('[label](https://example.com)')).toEqual([
      { text: '[label](', href: null },
      { text: 'https://example.com', href: 'https://example.com' },
      { text: ')', href: null },
    ])
  })

  it('keeps markup-looking text inert', () => {
    expect(links('<b>not bold</b> https://example.com')).toEqual([
      { text: 'https://example.com', href: 'https://example.com' },
    ])
    expect(links('https://example.com"><script>alert(1)</script>')).toEqual([
      { text: 'https://example.com', href: 'https://example.com' },
    ])
  })

  it('never returns a link whose href differs from a safe http(s) URL', () => {
    const hostile = [
      'javascript://example.com/alert(1)',
      'https://example.com javascript://x',
      'JAVASCRIPT:alert(1)',
      '  https://example.com',
    ]
    for (const text of hostile) {
      for (const part of links(text)) {
        expect(part.href).toMatch(/^https?:\/\//)
      }
    }
  })
})
