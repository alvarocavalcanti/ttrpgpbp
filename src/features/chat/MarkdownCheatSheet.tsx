import { BottomSheet } from '../../components/BottomSheet'
import { Markdown } from '../../components/Markdown'

interface CheatEntry {
  label: string
  syntax: string
  example: string
}

// Only syntax the renderer supports (GFM + spoilers + breaks).
const ENTRIES: CheatEntry[] = [
  { label: 'Bold', syntax: '**bold**', example: '**bold**' },
  { label: 'Italic', syntax: '*italic*', example: '*italic*' },
  { label: 'Strikethrough', syntax: '~~strikethrough~~', example: '~~strikethrough~~' },
  { label: 'Spoiler', syntax: '||spoiler||', example: '||spoiler||' },
  { label: 'Heading', syntax: '## Heading', example: '## Heading' },
  { label: 'Bulleted list', syntax: '- item', example: '- one\n- two' },
  { label: 'Numbered list', syntax: '1. item', example: '1. one\n2. two' },
  { label: 'Quote', syntax: '> quote', example: '> quoted text' },
  { label: 'Inline code', syntax: '`code`', example: '`code`' },
  { label: 'Code block', syntax: '```\ncode\n```', example: '```\ncode\n```' },
  { label: 'Link', syntax: '[text](https://example.com)', example: '[text](https://example.com)' },
  { label: 'Table', syntax: '| a | b |\n|---|---|\n| 1 | 2 |', example: '| a | b |\n|---|---|\n| 1 | 2 |' },
]

export function MarkdownCheatSheet({ onClose }: { onClose: () => void }) {
  return (
    <BottomSheet title="Markdown cheat sheet" onClose={onClose}>
      <ul className="space-y-4">
        {ENTRIES.map((e) => (
          <li key={e.label} className="border-b border-surface-100 dark:border-surface-700 pb-3 last:border-0">
            <div className="text-sm font-medium text-surface-900 dark:text-surface-100">{e.label}</div>
            <code className="mt-1 block whitespace-pre-wrap rounded bg-surface-100 dark:bg-surface-700 px-2 py-1 text-xs text-surface-800 dark:text-surface-200">{e.syntax}</code>
            <div className="prose prose-sm max-w-none dark:prose-invert mt-1">
              <Markdown breaks spoilers>{e.example}</Markdown>
            </div>
          </li>
        ))}
      </ul>
    </BottomSheet>
  )
}
