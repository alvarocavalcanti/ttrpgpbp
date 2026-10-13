import { useState } from 'react'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { BottomSheet } from '../../components/BottomSheet'
import { MarkdownCheatSheet } from './MarkdownCheatSheet'
import type { MarkdownFormat } from './markdownFormat'

interface MarkdownToolbarProps {
  onApply: (format: MarkdownFormat) => void
  hidden?: boolean
}

interface ToolDef {
  format: MarkdownFormat
  label: string
  title: string
  icon: React.ReactNode
}

const svgProps = {
  className: 'w-5 h-5',
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
} as const

const TOOLS: ToolDef[] = [
  { format: 'bold', label: 'Bold', title: 'Bold (**text**)', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 5h6a3.5 3.5 0 010 7H7zM7 12h7a3.5 3.5 0 010 7H7z" /></svg>) },
  { format: 'italic', label: 'Italic', title: 'Italic (*text*)', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5L9 19" /></svg>) },
  { format: 'strikethrough', label: 'Strikethrough', title: 'Strikethrough (~~text~~)', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16M8 5c3-1 9-1 9 3s-6 3-8 4-5 2-2 5c1 2 4 2 6 2" /></svg>) },
  { format: 'spoiler', label: 'Spoiler', title: 'Spoiler (||text||)', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12s3.5-6 9-6c2 0 3.7.8 5.2 2M21 12s-3.5 6-9 6c-2 0-3.7-.8-5.2-2M4 4l16 16" /></svg>) },
  { format: 'heading', label: 'Heading', title: 'Heading (## )', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5v14M19 5v14M5 12h14" /></svg>) },
  { format: 'bulleted-list', label: 'Bulleted list', title: 'Bulleted list (- )', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>) },
  { format: 'numbered-list', label: 'Numbered list', title: 'Numbered list (1. )', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6h10M10 12h10M10 18h10M4 6h1v4M4 12h1l-1 3h1M4 18h1v3" /></svg>) },
  { format: 'quote', label: 'Quote', title: 'Quote (> )', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10v4c0 3-2 5-5 6l-2 1M7 17l1-4" /></svg>) },
  { format: 'inline-code', label: 'Inline code', title: 'Inline code (`text`)', icon: (<svg {...svgProps}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l-4 3 4 3M16 9l4 3-4 3M13 5l-2 14" /></svg>) },
  { format: 'code-block', label: 'Code block', title: 'Code block (```)', icon: (<svg {...svgProps}><rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 10l-2 2 2 2M14 10l2 2-2 2" /></svg>) },
]

const btnClass =
  'p-2 text-surface-500 dark:text-surface-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500'

export function MarkdownToolbar({ onApply, hidden }: MarkdownToolbarProps) {
  const [cheatOpen, setCheatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isNarrow = useMediaQuery('(max-width: 640px)')

  // Sheets live outside the toolbar row: opening one moves focus into the
  // sheet (blur), which must not unmount the open sheet with it.
  const sheetOpen = cheatOpen || menuOpen
  if (hidden && !sheetOpen) return null

  const cheatButton = (
    <button
      key="cheat-sheet"
      type="button"
      aria-label="Markdown cheat sheet"
      title="Markdown cheat sheet"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => setCheatOpen(true)}
      className={btnClass}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.5 9.5a2.5 2.5 0 114 2c-.8.6-2 .8-2 2.5M10 17h.01" />
      </svg>
    </button>
  )

  const toolButtons = TOOLS.map((t) => (
    <button
      key={t.format}
      type="button"
      aria-label={t.label}
      title={t.title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onApply(t.format)}
      className={btnClass}
    >
      {t.icon}
    </button>
  ))

  return (
    <>
      {!hidden && (
      <div role="toolbar" aria-label="Text formatting" className="flex items-center justify-end gap-0.5 px-2 sm:px-0">
        {cheatButton}
        {!isNarrow && toolButtons}
        {isNarrow && (
          <button
            type="button"
            aria-label="More formatting options"
            aria-haspopup="dialog"
            aria-expanded={menuOpen}
            title="More formatting options"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setMenuOpen(true)}
            className={btnClass}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        )}
      </div>
      )}
      {menuOpen && (
        <BottomSheet title="Formatting" onClose={() => setMenuOpen(false)}>
          <div className="flex flex-col">
            {TOOLS.map((t) => (
              <button
                key={t.format}
                type="button"
                aria-label={t.label}
                onClick={() => { onApply(t.format); setMenuOpen(false) }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-surface-900 dark:text-surface-100 hover:bg-primary-50 dark:hover:bg-primary-950 rounded-lg"
              >
                <span className="text-primary-500 dark:text-primary-400">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {cheatOpen && <MarkdownCheatSheet onClose={() => setCheatOpen(false)} />}
    </>
  )
}
