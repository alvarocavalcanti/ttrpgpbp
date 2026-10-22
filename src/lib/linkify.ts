// Splits GM-authored listing copy (channel description / constraints) into
// plain-text runs and clickable http(s) links. Links only by design: no
// markdown, no images, no bare domains, no mailto. Stays free of React so both
// component tests and any future prerender script can use it.

export interface TextPart {
  text: string
  href: string | null
}

// Schemed URLs only, plus the `www.` shorthand people type by hand. Quotes and
// angle brackets end a candidate so `<a href="https://x">` never swallows the
// markup around it.
const CANDIDATE = /(?:https?:\/\/|www\.)[^\s<>"']+/gi

const TRAILING_PUNCTUATION = /[.,;:!?]+$/

const CLOSER_OPENER: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function countChar(text: string, char: string): number {
  let count = 0
  for (const c of text) if (c === char) count++
  return count
}

// Drops sentence punctuation and brackets that wrap the URL rather than belong
// to it: `(see https://x.com).` keeps `https://x.com`, while
// `https://en.wikipedia.org/wiki/Foo_(bar)` keeps its balanced paren.
function trimTrailing(raw: string): string {
  let end = raw.length
  for (let changed = true; changed && end > 0; ) {
    changed = false
    const slice = raw.slice(0, end)
    const withoutPunctuation = slice.replace(TRAILING_PUNCTUATION, '')
    if (withoutPunctuation.length !== end) {
      end = withoutPunctuation.length
      changed = true
      continue
    }
    const last = raw[end - 1]
    const opener = CLOSER_OPENER[last]
    if (!opener) break
    if (countChar(slice, last) <= countChar(slice, opener)) break
    end--
    changed = true
  }
  return raw.slice(0, end)
}

function toHref(text: string): string | null {
  const candidate = /^www\./i.test(text) ? `https://${text}` : text
  try {
    // The candidate pattern only ever produces http(s) URLs; parsing here is
    // what rejects malformed ones (`https://[`).
    new URL(candidate)
    return candidate
  } catch {
    return null
  }
}

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = []
  let consumed = 0

  for (const match of text.matchAll(CANDIDATE)) {
    const start = match.index
    const raw = match[0]
    const display = trimTrailing(raw)
    const href = toHref(display)
    // An unusable candidate is left in the surrounding text run below.
    if (!href) continue

    if (start > consumed) parts.push({ text: text.slice(consumed, start), href: null })
    parts.push({ text: display, href })
    const dropped = raw.slice(display.length)
    if (dropped) parts.push({ text: dropped, href: null })
    consumed = start + raw.length
  }

  if (consumed < text.length) parts.push({ text: text.slice(consumed), href: null })
  return parts
}
