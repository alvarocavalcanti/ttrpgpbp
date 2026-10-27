import { MAX_MESSAGE_LENGTH } from '../../constants'

// Delimiters that pair while typing. `_` is absent (snake_case and emphasis
// inside a word would pair constantly) and so is `|` (a single pipe is how GFM
// tables are typed, so pairing it would break ordinary typing).
const AUTO_PAIR_DELIMITERS: readonly string[] = ['*', '~', '`']

// Punctuation that can only open something, so the marker after it is an
// opener and not a closer: `(*` must still become `(**|**)`, while the closer
// in `**bold!**` follows `!` and must be skipped over.
const OPENING_PUNCTUATION = `([{<"'\u00ab\u201c\u2018`

type AutoPairOutcome =
  // Caret sits between the opener the player typed and the closer we added.
  | { kind: 'paired'; value: string; caret: number }
  // The character after the caret is already the marker being typed: step the
  // caret over it instead of doubling it.
  | { kind: 'skip' }
  // Not ours to handle: let the browser insert the character normally.
  | null

// Typing a markdown delimiter closes it for you: `*` becomes `*|*`, a second
// `*` nests into `**|**`, and typing the closing marker steps over the one
// already there. Callers must run this BEFORE the character reaches the
// textarea (keydown + preventDefault) so state and DOM never drift apart.
// shortcut: outside a code span every delimiter keystroke pairs, so a literal
// marker needs the `\*` escape; upgrade if players ask for a smarter rule.

// Odd number of backticks before the caret means it sits inside a code span.
// Fenced blocks land on the same count, which is what we want: markers typed
// inside code are literal.
function isInsideInlineCode(value: string, caret: number): boolean {
  let backticks = 0
  for (let i = 0; i < caret; i++) if (value[i] === '`') backticks++
  return backticks % 2 === 1
}

export function markdownAutoPair(
  value: string,
  caret: number,
  char: string,
  maxLength: number = MAX_MESSAGE_LENGTH,
): AutoPairOutcome {
  if (!AUTO_PAIR_DELIMITERS.includes(char)) return null

  const len = value.length
  const p = Math.min(Math.max(caret, 0), len)
  // `\*` is how a player types a literal marker.
  if (p > 0 && value[p - 1] === '\\') return null

  let forwardRun = 0
  while (p + forwardRun < len && value[p + forwardRun] === char) forwardRun++

  let backRun = 0
  while (p - backRun - 1 >= 0 && value[p - backRun - 1] === char) backRun++
  const runStart = p - backRun
  const beforeRun = runStart > 0 ? value[runStart - 1] : ''

  // A run of the same marker before the caret that follows text is a closing
  // marker, not an opener: the player is re-typing the closer we inserted.
  if (forwardRun > 0 && beforeRun && !/\s/.test(beforeRun) && !OPENING_PUNCTUATION.includes(beforeRun)) {
    return { kind: 'skip' }
  }

  // Backslash escapes are literal inside a code span, so pairing would corrupt
  // the code (`2*3` became `2*3*`). Leave the markers alone there; the closing
  // backtick is still skipped over above.
  if (isInsideInlineCode(value, p)) return null

  const next = value.slice(0, p) + char + value.slice(p, p + forwardRun) + char + value.slice(p + forwardRun)
  if (next.length > maxLength) return null
  return { kind: 'paired', value: next, caret: p + 1 }
}
