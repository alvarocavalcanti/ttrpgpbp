import { MAX_MESSAGE_LENGTH } from '../../constants'

// Delimiters that pair while typing. `_` is absent (snake_case and emphasis
// inside a word would pair constantly) and so is `|` (a single pipe is how GFM
// tables are typed, so pairing it would break ordinary typing).
export const AUTO_PAIR_DELIMITERS: readonly string[] = ['*', '~', '`']

export type AutoPairOutcome =
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

  // A run of the same marker before the caret that follows text is a closing
  // marker, not an opener: the player is re-typing the closer we inserted.
  if (forwardRun > 0 && runStart > 0 && !/\s/.test(value[runStart - 1])) return { kind: 'skip' }

  const next = value.slice(0, p) + char + value.slice(p, p + forwardRun) + char + value.slice(p + forwardRun)
  if (next.length > maxLength) return null
  return { kind: 'paired', value: next, caret: p + 1 }
}
