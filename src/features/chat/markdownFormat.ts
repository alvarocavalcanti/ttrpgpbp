import { MAX_MESSAGE_LENGTH } from '../../constants'

export type MarkdownFormat =
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'spoiler'
  | 'heading'
  | 'bulleted-list'
  | 'numbered-list'
  | 'quote'
  | 'inline-code'
  | 'code-block'

export interface EditResult {
  value: string
  selectionStart: number
  selectionEnd: number
}

const INLINE_MARKERS: Record<string, { marker: string; placeholder: string }> = {
  bold: { marker: '**', placeholder: 'bold' },
  italic: { marker: '*', placeholder: 'italic' },
  strikethrough: { marker: '~~', placeholder: 'strikethrough' },
  spoiler: { marker: '||', placeholder: 'spoiler' },
  'inline-code': { marker: '`', placeholder: 'code' },
}

const LINE_PREFIXES: Record<string, string> = {
  heading: '## ',
  'bulleted-list': '- ',
  quote: '> ',
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// shortcut: add-only formatting, upgrade if users ask to un-format.
export function applyMarkdownFormat(
  value: string,
  start: number,
  end: number,
  format: MarkdownFormat,
  maxLength: number = MAX_MESSAGE_LENGTH,
): EditResult | null {
  const len = value.length
  const s = clamp(start, 0, len)
  const e = clamp(end, 0, len)
  const from = Math.min(s, e)
  const to = Math.max(s, e)

  const inline = INLINE_MARKERS[format]
  if (inline) {
    const inner = value.slice(from, to)
    const body = inner || inline.placeholder
    const next = value.slice(0, from) + inline.marker + body + inline.marker + value.slice(to)
    if (next.length > maxLength) return null
    const selStart = from + inline.marker.length
    return { value: next, selectionStart: selStart, selectionEnd: selStart + body.length }
  }

  // Line formats: expand to full lines.
  const lineStart = value.lastIndexOf('\n', from - 1) + 1
  let lineEnd = value.indexOf('\n', to)
  if (lineEnd === -1) lineEnd = len
  const block = value.slice(lineStart, lineEnd)
  const lines = block.split('\n')

  let edited: string
  if (format === 'code-block') {
    edited = '```\n' + block + '\n```'
  } else if (format === 'numbered-list') {
    edited = lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
  } else {
    const prefix = LINE_PREFIXES[format]
    edited = lines.map((l) => prefix + l).join('\n')
  }
  const next = value.slice(0, lineStart) + edited + value.slice(lineEnd)
  if (next.length > maxLength) return null
  return { value: next, selectionStart: lineStart, selectionEnd: lineStart + edited.length }
}
