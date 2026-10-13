import { useState } from 'react'
import {
  Bold,
  CircleHelp,
  Code,
  Ellipsis,
  EyeOff,
  Heading,
  Italic,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
} from 'lucide-react'
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

const iconClass = 'w-5 h-5'

const TOOLS: ToolDef[] = [
  { format: 'bold', label: 'Bold', title: 'Bold (**text**)', icon: (<Bold className={iconClass} />) },
  { format: 'italic', label: 'Italic', title: 'Italic (*text*)', icon: (<Italic className={iconClass} />) },
  { format: 'strikethrough', label: 'Strikethrough', title: 'Strikethrough (~~text~~)', icon: (<Strikethrough className={iconClass} />) },
  { format: 'spoiler', label: 'Spoiler', title: 'Spoiler (||text||)', icon: (<EyeOff className={iconClass} />) },
  { format: 'heading', label: 'Heading', title: 'Heading (## )', icon: (<Heading className={iconClass} />) },
  { format: 'bulleted-list', label: 'Bulleted list', title: 'Bulleted list (- )', icon: (<List className={iconClass} />) },
  { format: 'numbered-list', label: 'Numbered list', title: 'Numbered list (1. )', icon: (<ListOrdered className={iconClass} />) },
  { format: 'quote', label: 'Quote', title: 'Quote (> )', icon: (<Quote className={iconClass} />) },
  { format: 'inline-code', label: 'Inline code', title: 'Inline code (`text`)', icon: (<Code className={iconClass} />) },
  { format: 'code-block', label: 'Code block', title: 'Code block (```)', icon: (<SquareCode className={iconClass} />) },
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
      <CircleHelp className="w-5 h-5" />
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
          <>
            <button
              type="button"
              aria-label={TOOLS[0].label}
              title={TOOLS[0].title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApply(TOOLS[0].format)}
              className={btnClass}
            >
              {TOOLS[0].icon}
            </button>
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
            <Ellipsis className="w-5 h-5" />
            </button>
          </>
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
