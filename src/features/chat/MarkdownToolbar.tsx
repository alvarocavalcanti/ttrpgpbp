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

export function MarkdownToolbar({ onApply }: MarkdownToolbarProps) {
  const [cheatOpen, setCheatOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [focusIndex, setFocusIndex] = useState(0)
  const isNarrow = useMediaQuery('(max-width: 640px)')

  const boldTool = TOOLS[0]
  // One flat list for both layouts: the roving tabindex needs a single order.
  const actions = [
    {
      key: 'cheat-sheet',
      label: 'Markdown cheat sheet',
      title: 'Markdown cheat sheet',
      icon: <CircleHelp className="w-5 h-5" />,
      select: () => setCheatOpen(true),
    },
    ...(isNarrow
      ? [
          { key: boldTool.format, label: boldTool.label, title: boldTool.title, icon: boldTool.icon, select: () => onApply(boldTool.format) },
          { key: 'more', label: 'More formatting options', title: 'More formatting options', icon: <Ellipsis className="w-5 h-5" />, select: () => setMenuOpen(true) },
        ]
      : TOOLS.map((t) => ({ key: t.format, label: t.label, title: t.title, icon: t.icon, select: () => onApply(t.format) }))),
  ]
  // A resized window can shrink the list under a stale index.
  const activeIndex = Math.min(focusIndex, actions.length - 1)

  // Roving tabindex: toolbar is one Tab stop, arrows move between its buttons.
  const handleToolbarKeys = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    const toolbar = e.currentTarget.closest('[role="toolbar"]')
    if (!toolbar) return
    const buttons = Array.from(toolbar.querySelectorAll<HTMLButtonElement>('button'))
    if (buttons.length === 0) return
    e.preventDefault()
    const current = buttons.indexOf(e.currentTarget)
    const next =
      e.key === 'Home' ? 0
        : e.key === 'End' ? buttons.length - 1
          : (current + step + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <>
      <div role="toolbar" aria-label="Text formatting" className="flex items-center gap-0.5 px-2 py-1">
        {actions.map((a, i) => (
          <button
            key={a.key}
            type="button"
            aria-label={a.label}
            title={a.title}
            tabIndex={i === activeIndex ? 0 : -1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={a.select}
            onFocus={() => setFocusIndex(i)}
            onKeyDown={handleToolbarKeys}
            aria-haspopup={a.key === 'more' ? 'dialog' : undefined}
            aria-expanded={a.key === 'more' ? menuOpen : undefined}
            className={btnClass}
          >
            {a.icon}
          </button>
        ))}
      </div>
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
