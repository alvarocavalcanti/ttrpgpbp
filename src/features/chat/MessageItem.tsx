import { Avatar } from '../../components/Avatar';
import { SignedImg } from '../../components/SignedImg';
import { useState, useRef, useEffect, useMemo, memo } from 'react'
import { Markdown } from '../../components/Markdown'
import { linkifyDice, isValidDiceNotation } from '../dice/parser'
import { getSystemAttributes, clampModifier, getModifierLimits } from '../../game-systems'
import { BottomSheet } from '../../components/BottomSheet'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ModifierInput } from '../../components/ModifierInput'
import { EmojiPicker } from './EmojiPicker'
import type { ReactionSummary } from './useMessages'
import type { ChatMessage, Member } from './types'
import { isNpcIconUrl } from './npcIcons'
import { MAX_MESSAGE_LENGTH } from '../../constants'

type Message = ChatMessage

// Touch-target sizing for message actions (UX audit: minimum ~32-36px targets).
// The touch-target test below asserts these utility strings literally — if the
// sizing changes, update that test on purpose instead of silently following.
const MESSAGE_ACTION_SIZING = {
  /** padding on icon buttons and the ⋯ button */
  padding: 'p-1.5',
  /** icon glyph size */
  icon: 'w-5 h-5',
  /** class hiding the ⋯ button on desktop */
  menuButtonVisibility: 'sm:hidden',
  /** class hiding the hover-icon row on mobile */
  desktopRowVisibility: 'hidden sm:flex',
} as const

interface MessageItemProps {
  message: Message
  currentUserId: string | undefined
  isGM: boolean
  onEdit: (id: string, newContent: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onRollDice?: (notation: string, replyToId?: string, warning?: string, dc?: number | null) => void
  isHighlighted?: boolean
  members?: Member[]
  gameSystem?: string
  reactions?: ReactionSummary[]
  onToggleReaction?: (messageId: string, emoji: string) => void
  onReply?: (message: Message) => void
  onJumpToMessage?: (messageId: string) => void
  onXCard?: (messageId: string) => void
  onRetry?: (messageId: string) => void
  onRemovePending?: (messageId: string) => void
  onEditCharacter?: () => void
}

function snippet(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
    .trim()
}

function formatTimestamp(createdAt: string): string {
  const d = new Date(createdAt)
  const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60)
  return diffHours > 20
    ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Pure link sanitizer; hoisted so ReactMarkdown gets a stable reference.
function urlTransform(url: string): string {
  if (url.startsWith('dice:') || url.startsWith('check:') || url.startsWith('user:')) return url
  // Basic sanitization for other URLs, matching react-markdown defaults roughly
  const protocols = ['http', 'https', 'mailto', 'tel']
  try {
    const parsed = new URL(url)
    if (protocols.includes(parsed.protocol.replace(':', ''))) return url
  } catch {
    // Relative URLs are fine
    if (url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) return url
    // Bare private-bucket object paths ({channel_id}/{folder}/{uuid}.jpg) are
    // allowed so message images survive into the markdown img renderer, which
    // exchanges them for signed URLs. No scheme, so nothing to sanitize.
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//.test(url)) return url
  }
  return ''
}

type CheckAdvDis = 'adv' | 'dis' | null

interface CheckDraft {
  ability: string
  dc: number | null
  advDis: CheckAdvDis
  modifier: string
  missing: boolean
}

interface CheckSheetProps {
  draft: CheckDraft
  gameSystem: string
  onModifierChange: (value: string) => void
  onAdvDisChange: (value: CheckAdvDis) => void
  onEditCharacter?: () => void
  onRoll: () => void
  onClose: () => void
}

// Styled replacement for the old window.prompt flow when tapping an ability
// check chip: modifier pre-filled from the profile, Adv/Dis toggle, Roll/Cancel.
function CheckSheet({ draft, gameSystem, onModifierChange, onAdvDisChange, onEditCharacter, onRoll, onClose }: CheckSheetProps) {
  const limits = getModifierLimits(gameSystem)
  const segmentBtn = (selected: boolean) =>
    `flex-1 text-xs py-1 rounded transition-colors ${selected ? 'bg-white dark:bg-gray-800 shadow-sm font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`
  const advBtn = (selected: boolean) =>
    `flex-1 text-xs py-1 rounded transition-colors ${selected ? 'bg-green-100 dark:bg-green-900 shadow-sm font-medium text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`
  const disBtn = (selected: boolean) =>
    `flex-1 text-xs py-1 rounded transition-colors ${selected ? 'bg-red-100 dark:bg-red-900 shadow-sm font-medium text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`

  return (
    <BottomSheet title={`Roll ${draft.ability} Check${draft.dc ? ` (DC ${draft.dc})` : ''}`} onClose={onClose}>
      <label htmlFor="check-modifier" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Modifier
      </label>
      <ModifierInput attr="check-modifier" value={draft.modifier} onChange={onModifierChange} min={limits.min} max={limits.max} />
      {draft.missing && (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
          {draft.ability} modifier missing in your character profile.{' '}
          {onEditCharacter && (
            <button
              type="button"
              onClick={onEditCharacter}
              className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Set it in your character sheet
            </button>
          )}
        </p>
      )}
      <div className="mt-4 flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-md">
        <button type="button" onClick={() => onAdvDisChange(null)} className={segmentBtn(draft.advDis === null)}>Normal</button>
        <button type="button" onClick={() => onAdvDisChange('adv')} className={advBtn(draft.advDis === 'adv')}>Adv</button>
        <button type="button" onClick={() => onAdvDisChange('dis')} className={disBtn(draft.advDis === 'dis')}>Dis</button>
      </div>
      <div className="mt-4 flex space-x-2">
        <button
          type="button"
          onClick={onRoll}
          className="flex-1 flex justify-center py-1.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Roll
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 flex justify-center py-1.5 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          Cancel
        </button>
      </div>
    </BottomSheet>
  )
}

export const MessageItem = memo(function MessageItem({ message, currentUserId, isGM, onEdit, onDelete, onRollDice, isHighlighted, members, gameSystem = 'none', reactions, onToggleReaction, onReply, onJumpToMessage, onXCard, onRetry, onRemovePending, onEditCharacter }: MessageItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkDraft, setCheckDraft] = useState<CheckDraft | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const itemRef = useRef<HTMLDivElement>(null)

  const senderName = message.npc_name || members?.find(m => m.user_id === message.sender_id)?.character_name || message.sender?.display_name
  const replySenderName = message.reply?.sender_id ? members?.find(m => m.user_id === message.reply?.sender_id)?.character_name : undefined

  const systemAttributes = useMemo(() => getSystemAttributes(gameSystem), [gameSystem])

  useEffect(() => {
    if (isHighlighted && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [isHighlighted])

  const isMe = message.sender_id === currentUserId
  const isWhisper = !!message.whisper_to
  const isScene = message.type === 'scene'
  const isSystem = message.type === 'system'
  const isNpc = message.type === 'npc'

  // Check 15 min edit window. Scene messages are GM-authored, so the GM can
  // edit/delete them; the author can also edit/delete within 15 minutes. NPC
  // messages respect the same 15-minute window as regular messages.
  const withinEditWindow = new Date().getTime() - new Date(message.created_at).getTime() < 15 * 60 * 1000
  const canEdit = !message.is_deleted && (
    (isMe && withinEditWindow && (message.type === 'regular' || message.type === 'npc')) ||
    (isGM && message.type === 'scene')
  )

  const handleSaveEdit = async () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false)
      return
    }
    setIsSubmitting(true)
    setError(null)
    try {
      await onEdit(message.id, editContent)
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to edit message', err)
      setError('Failed to edit message.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const runDelete = async () => {
    setConfirmDelete(false)
    setIsSubmitting(true)
    setError(null)
    try {
      await onDelete(message.id)
    } catch (err) {
      console.error('Failed to delete message', err)
      setError('Failed to delete message.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleToggleReaction = (emoji: string) => {
    onToggleReaction?.(message.id, emoji)
  }

  // Rolls the pending check from the CheckSheet with the same notation rules
  // as before: kh1/kl1 for adv/dis, clamped modifier, warning kept out of the
  // notation when the profile attribute is missing.
  const rollCheck = () => {
    if (!checkDraft) return
    const { ability, dc, advDis, modifier, missing } = checkDraft
    const parsed = /^-?\d+$/.test(modifier.trim()) ? parseInt(modifier.trim(), 10) : 0
    const finalModifier = clampModifier(gameSystem, parsed)
    const sign = finalModifier >= 0 ? '+' : ''
    const dice = advDis ? `2d20${advDis === 'adv' ? 'kh1' : 'kl1'}` : '1d20'
    const notation = `${dice}${finalModifier !== 0 ? `${sign}${finalModifier}` : ''}`
    const warning = missing ? `*⚠️ Missing ${ability} modifier in character profile. Result may require manual math if not entered correctly.*` : ''
    onRollDice?.(notation, message.id, warning || undefined, dc ?? undefined)
    setCheckDraft(null)
  }

  const handleEditCharacter = () => {
    setCheckDraft(null)
    onEditCharacter?.()
  }

  // Recreate renderers only when the values the closures capture change, so
  // local re-renders (e.g. editing) don't hand ReactMarkdown a new `components`
  // reference and force a markdown re-parse.
  const renderers = useMemo(() => ({
    a: ({ node: _node, href, children, ...props }: React.ComponentProps<'a'> & { node?: unknown }) => {
      if (href?.startsWith('dice:')) {
        const notation = href.slice(5)
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              // Validate at the click site: a hand-crafted `dice:` href with
              // invalid notation would otherwise mint a misleading "Rolling"
              // bubble before the server rejects it.
              if (!isValidDiceNotation(notation)) return
              onRollDice?.(notation, message.id)
            }}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-colors cursor-pointer border border-indigo-200 dark:border-indigo-800 shadow-sm"
            title={`Roll ${notation}`}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="16" height="16" rx="3" strokeWidth={2} /><circle cx="8" cy="8" r="2" fill="currentColor" /><circle cx="16" cy="8" r="2" fill="currentColor" /><circle cx="12" cy="12" r="2" fill="currentColor" /><circle cx="8" cy="16" r="2" fill="currentColor" /><circle cx="16" cy="16" r="2" fill="currentColor" /></svg>
            {children}
          </button>
        )
      }
      if (href?.startsWith('check:')) {
        const [ability, ...rest]: string[] = href.slice(6).split(':')
        const dcSegment = rest.find(s => /^\d+$/.test(s))
        const advSegment = rest.find(s => s === 'adv' || s === 'dis')
        const dc = dcSegment ? parseInt(dcSegment, 10) : null
        const advDis = advSegment || null
        return (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              // Pre-fill the sheet from the profile; a missing (or unknown)
              // ability attribute falls back to 0 and flags the missing state.
              const myMember = members?.find(m => m.user_id === currentUserId)
              const attrValue = systemAttributes.includes(ability)
                ? myMember?.attributes?.[ability]
                : undefined
              // Only flag missing (link + roll warning) when the ability is a
              // real system attribute that the profile lacks, matching the
              // old prompt flow's warning behavior.
              setCheckDraft({
                ability,
                dc,
                advDis,
                modifier: typeof attrValue === 'number' ? String(attrValue) : '0',
                missing: systemAttributes.includes(ability) && typeof attrValue !== 'number',
              })
            }}
            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors cursor-pointer border border-amber-200 dark:border-amber-800 shadow-sm"
            title={`Roll ${ability} Check${dc ? ` (DC ${dc})` : ''}${advDis ? ` with ${advDis === 'adv' ? 'Advantage' : 'Disadvantage'}` : ''}`}
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            {children}
          </button>
        )
      }
      if (href?.startsWith('user:')) {
        return (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium text-xs border border-indigo-100 dark:border-indigo-900">
            {children}
          </span>
        )
      }
      return <a href={href} {...props} target="_blank" rel="noopener noreferrer">{children}</a>
    },
img: ({ node: _node, src, alt, ...props }: React.ComponentProps<'img'> & { node?: unknown }) => {
      return (
        <SignedImg 
          src={src} 
          alt={alt || "Image"} 
          className="max-w-full h-auto rounded-lg shadow-sm my-2 object-contain max-h-96" 
          loading="lazy" 
          referrerPolicy="no-referrer"
          {...props} 
        />
      )
    }
  }), [onRollDice, systemAttributes, members, currentUserId, message.id])

  // Per-message actions, gated by role/edit-window. Rendered as hover icons on
  // desktop and collapsed behind a single "…" button opening a sheet on mobile,
  // so touch users get one large target instead of several tiny ones.
  const actions = useMemo(() => {
    const list: { id: string; label: string; danger?: boolean; onClick: () => void; icon: React.ReactNode }[] = []
    if (onReply) {
      list.push({
        id: 'reply', label: 'Reply', onClick: () => onReply(message),
        icon: <svg className={MESSAGE_ACTION_SIZING.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>,
      })
    }
    if (canEdit) {
      list.push({
        id: 'edit', label: 'Edit', onClick: () => setIsEditing(true),
        icon: <svg className={MESSAGE_ACTION_SIZING.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
      })
    }
    if (canEdit || isGM) {
      list.push({
        id: 'delete', label: 'Delete', danger: true, onClick: () => setConfirmDelete(true),
        icon: <svg className={MESSAGE_ACTION_SIZING.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
      })
    }
    if (onXCard) {
      list.push({
        id: 'x-card', label: 'X-Card', danger: true, onClick: () => onXCard(message.id),
        icon: (
          <svg className={MESSAGE_ACTION_SIZING.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 8l8 8M16 8l-8 8" />
          </svg>
        ),
      })
    }
    return list
  }, [onReply, canEdit, isGM, onXCard, message])

  const actionIconClass = (danger?: boolean) =>
    `${MESSAGE_ACTION_SIZING.padding} rounded transition-colors text-gray-400 dark:text-gray-500 ${danger ? 'hover:text-red-600 dark:hover:text-red-400' : 'hover:text-indigo-600 dark:hover:text-indigo-400'}`

  const actionIcons = actions.map(a => (
    <button key={a.id} type="button" onClick={a.onClick} aria-label={a.label} title={a.label} className={actionIconClass(a.danger)}>
      {a.icon}
    </button>
  ))

  const mobileMenuButton = (
    <button
      type="button"
      onClick={() => setActionsOpen(true)}
      aria-label="Message actions"
      title="Message actions"
      className={`${MESSAGE_ACTION_SIZING.menuButtonVisibility} ${MESSAGE_ACTION_SIZING.padding} rounded transition-colors text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400`}
    >
      <svg className={MESSAGE_ACTION_SIZING.icon} fill="currentColor" viewBox="0 0 24 24">
        <circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" />
      </svg>
    </button>
  )

  const actionsSheet = actionsOpen && actions.length > 0 ? (
    <BottomSheet title="Message actions" onClose={() => setActionsOpen(false)}>
      <div className="flex flex-col gap-1">
        {actions.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => { setActionsOpen(false); a.onClick() }}
            className={`w-full text-left px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${a.danger ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950' : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </BottomSheet>
  ) : null

  const deleteConfirmDialog = confirmDelete ? (
    <ConfirmDialog
      title="Delete message?"
      description="This removes the message for everyone and can't be undone."
      onConfirm={runDelete}
      onClose={() => setConfirmDelete(false)}
    />
  ) : null

  const replyBlock = message.reply?.id ? (
    <button
      type="button"
      onClick={() => onJumpToMessage?.(message.reply!.id)}
      disabled={!onJumpToMessage}
      className="mt-1 w-full text-left px-2 py-1.5 rounded-md bg-gray-50 dark:bg-gray-900 border-l-2 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-colors"
    >
      <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
        Replying to {replySenderName || 'someone'}
      </span>
      <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
        {message.reply!.is_deleted ? 'This message was deleted.' : snippet(message.reply!.content) || '(no text)'}
      </span>
    </button>
  ) : null

  const reactionsRow = reactions && reactions.length > 0 ? (
    <div className="flex flex-wrap gap-1">
      {reactions.map(r => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => handleToggleReaction(r.emoji)}
          className={`px-1.5 py-0.5 rounded-full text-xs border transition-colors ${r.hasReacted ? 'bg-indigo-100 dark:bg-indigo-900 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          aria-label={`Reaction ${r.emoji}, ${r.count}`}
        >
          <span className="mr-0.5">{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}
    </div>
  ) : null

  const reactionPicker = onToggleReaction && !message.pending ? (
    <EmojiPicker onPick={handleToggleReaction} />
  ) : null

  const pendingOverlay = message.pending && !message.error ? (
    <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 flex items-center justify-center rounded-lg z-10 pointer-events-none">
      <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  ) : null

  const errorOverlay = message.error ? (
    <div className="mt-2 text-sm">
      <div className="text-red-600 dark:text-red-400 font-medium mb-1">Failed to send: {message.error}</div>
      <div className="flex space-x-3">
        <button type="button" onClick={() => onRetry?.(message.id)} className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-semibold">Retry</button>
        <button type="button" onClick={() => onRemovePending?.(message.id)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">Remove</button>
      </div>
    </div>
  ) : null

  if (isSystem) {
    return (
      <div ref={itemRef} className={`relative flex justify-center my-4 transition-colors duration-1000 ${isHighlighted ? 'bg-yellow-100 dark:bg-yellow-900 rounded-lg p-2' : ''} ${message.pending ? 'opacity-60' : ''}`}>
        {pendingOverlay}
        <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs px-3 py-1 rounded-full">
          {message.content}
        </div>
        {errorOverlay}
      </div>
    )
  }

  if (isScene) {
    return (
      <div ref={itemRef} className={`relative my-6 px-4 py-6 bg-parchment dark:bg-parchment-dark border-y-2 border-parchment-border dark:border-parchment-border-dark shadow-sm flex flex-col items-center transition-colors duration-1000 ${isHighlighted ? 'ring-4 ring-yellow-400 ring-offset-2' : ''} ${message.pending ? 'opacity-60' : ''}`}>
        {pendingOverlay}
        <div className="max-w-2xl w-full text-center font-serif text-parchment-ink dark:text-parchment-ink-dark prose prose-narrative dark:prose-invert prose-p:text-parchment-ink dark:prose-p:text-parchment-ink-dark prose-headings:text-parchment-ink-strong dark:prose-headings:text-parchment-ink-strong-dark prose-strong:text-parchment-ink-strong dark:prose-strong:text-parchment-ink-strong-dark prose-em:text-parchment-ink dark:prose-em:text-parchment-ink-dark prose-a:text-parchment-ink-strong dark:prose-a:text-parchment-ink-strong-dark prose-blockquote:text-parchment-ink dark:prose-blockquote:text-parchment-ink-dark prose-blockquote:border-parchment-border dark:prose-blockquote:border-parchment-border-dark prose-ul:text-parchment-ink dark:prose-ul:text-parchment-ink-dark prose-ol:text-parchment-ink dark:prose-ol:text-parchment-ink-dark max-w-none break-words [&>p:last-child]:bg-parchment-shade dark:[&>p:last-child]:bg-parchment-shade-dark [&>p:last-child]:p-4 [&>p:last-child]:mt-6 [&>p:last-child]:rounded-md [&>p:last-child]:shadow-inner [&>p:last-child]:font-bold [&>p:last-child]:italic [&>p:last-child]:text-parchment-ink-strong dark:[&>p:last-child]:text-parchment-ink-strong-dark">
          {isEditing ? (
            <div className="mt-2 text-left">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={MAX_MESSAGE_LENGTH}
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                rows={3}
              />
              <div className="mt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting || !editContent.trim()}
                  className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <Markdown components={renderers} urlTransform={urlTransform}>{linkifyDice(message.content, systemAttributes)}</Markdown>
          )}
          {error && <div className="text-red-500 dark:text-red-400 text-xs mt-1">{error}</div>}
          {errorOverlay}
        </div>
        {checkDraft && (
          <CheckSheet
            draft={checkDraft}
            gameSystem={gameSystem}
            onModifierChange={(value) => setCheckDraft(d => d ? { ...d, modifier: value } : d)}
            onAdvDisChange={(value) => setCheckDraft(d => d ? { ...d, advDis: value } : d)}
            onEditCharacter={onEditCharacter ? handleEditCharacter : undefined}
            onRoll={rollCheck}
            onClose={() => setCheckDraft(null)}
          />
        )}
        {!message.is_deleted && !message.pending && !isEditing && actions.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-1 mt-3">
            <div className={`${MESSAGE_ACTION_SIZING.desktopRowVisibility} items-center gap-1`}>{actionIcons}</div>
            {mobileMenuButton}
          </div>
        )}
        {actionsSheet}
        {deleteConfirmDialog}
      </div>
    )
  }

  if (message.type === 'dice_roll') {
    const isSuccess = message.roll_success === true
    const isFailure = message.roll_success === false
    const tone = isSuccess ? {
      container: 'bg-green-50 dark:bg-green-950 border-green-100 dark:border-green-900',
      icon: 'bg-green-200 dark:bg-green-800 text-green-700 dark:text-green-400',
      label: 'text-green-800 dark:text-green-300',
    } : isFailure ? {
      container: 'bg-red-50 dark:bg-red-950 border-red-100 dark:border-red-900',
      icon: 'bg-red-200 dark:bg-red-800 text-red-700 dark:text-red-400',
      label: 'text-red-800 dark:text-red-300',
    } : {
      container: 'bg-indigo-50 dark:bg-indigo-950 border-indigo-100 dark:border-indigo-900',
      icon: 'bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300',
      label: 'text-indigo-800 dark:text-indigo-200',
    }
    return (
      <div ref={itemRef} className={`relative flex items-center space-x-3 my-4 px-4 ${tone.container} py-3 rounded-lg border shadow-sm mx-auto max-w-lg transition-all duration-1000 ${isHighlighted ? 'ring-4 ring-yellow-400 ring-offset-2 scale-[1.02]' : ''} ${message.pending ? 'opacity-60' : ''}`}>
        {pendingOverlay}
        <div className={`flex-shrink-0 ${tone.icon} p-2 rounded-full`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth={2} />
            <circle cx="8" cy="8" r="2" fill="currentColor" />
            <circle cx="16" cy="8" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="8" cy="16" r="2" fill="currentColor" />
            <circle cx="16" cy="16" r="2" fill="currentColor" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          {replyBlock}
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${tone.label} tracking-wide uppercase`}>
              {senderName} rolled dice
            </span>
            {message.roll_dc != null && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                DC {message.roll_dc}
              </span>
            )}
            {typeof message.roll_success === 'boolean' && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isSuccess ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-300'}`}>
                {isSuccess ? 'Success' : 'Failure'}
              </span>
            )}
          </div>
          <div className="text-gray-900 dark:text-gray-100 text-lg">
            <Markdown>{message.content}</Markdown>
          </div>
          {errorOverlay}
        </div>
      </div>
    )
  }

  return (
    <div ref={itemRef} className={`relative group flex items-start space-x-3 my-4 px-4 py-2 transition-all duration-1000 ${isWhisper ? 'bg-purple-50 dark:bg-purple-950 rounded-lg border border-purple-100 dark:border-purple-900' : ''} ${isNpc ? 'bg-parchment dark:bg-parchment-dark rounded-lg border border-parchment-border dark:border-parchment-border-dark' : ''} ${isHighlighted ? 'bg-yellow-50 dark:bg-yellow-950 ring-2 ring-yellow-400 rounded-lg' : ''} ${message.pending ? 'opacity-60' : ''}`}>
      {pendingOverlay}
      <div className="flex-shrink-0">
        {isNpc ? (
          message.npc_avatar_url ? (
            <Avatar className={`h-10 w-10 rounded-full flex-shrink-0 ${isNpcIconUrl(message.npc_avatar_url) ? 'dark:invert' : ''}`} src={message.npc_avatar_url} alt="" referrerPolicy="no-referrer" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-parchment-border dark:bg-parchment-border-dark flex items-center justify-center text-parchment-ink dark:text-parchment-ink-dark font-serif">
              {message.npc_name?.[0]?.toUpperCase() || '?'}
            </div>
          )
        ) : message.sender?.avatar_url ? (
          <Avatar className="h-10 w-10 rounded-full flex-shrink-0" src={message.sender.avatar_url} alt="" referrerPolicy="no-referrer" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400">
            {senderName?.[0]?.toUpperCase() || '?'}
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline space-x-2">
          <span className={`text-sm font-medium ${isNpc ? 'font-serif text-parchment-ink-strong dark:text-parchment-ink-strong-dark' : 'text-gray-900 dark:text-gray-100'}`}>
            {senderName}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTimestamp(message.created_at)}
          </span>
          {isWhisper && (
            <span className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
              Whisper to {message.whisper_to === currentUserId ? 'You' : message.whisper_target?.display_name}
            </span>
          )}
          {message.is_edited && !message.is_deleted && (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">(edited)</span>
          )}
        </div>

        {replyBlock}

        <div className={`mt-1 text-sm text-gray-800 dark:text-gray-200 prose prose-sm prose-indigo dark:prose-invert max-w-none break-words ${isNpc ? 'font-serif prose-narrative text-parchment-ink dark:text-parchment-ink-dark prose-p:text-parchment-ink dark:prose-p:text-parchment-ink-dark prose-a:text-parchment-ink-strong dark:prose-a:text-parchment-ink-strong-dark prose-strong:text-parchment-ink-strong dark:prose-strong:text-parchment-ink-strong-dark' : ''}`}>
          {message.is_deleted ? (
            <span className="text-gray-400 dark:text-gray-500 italic">This message was deleted.</span>
          ) : isEditing ? (
            <div className="mt-2">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                maxLength={MAX_MESSAGE_LENGTH}
                className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm p-2 border"
                rows={3}
              />
              <div className="mt-2 flex space-x-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting || !editContent.trim()}
                  className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  disabled={isSubmitting}
                  className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <Markdown components={renderers} urlTransform={urlTransform}>{linkifyDice(message.content, systemAttributes)}</Markdown>
          )}
          {error && <div className="text-red-500 dark:text-red-400 text-xs mt-1">{error}</div>}
          {errorOverlay}
        </div>
        {checkDraft && (
          <CheckSheet
            draft={checkDraft}
            gameSystem={gameSystem}
            onModifierChange={(value) => setCheckDraft(d => d ? { ...d, modifier: value } : d)}
            onAdvDisChange={(value) => setCheckDraft(d => d ? { ...d, advDis: value } : d)}
            onEditCharacter={onEditCharacter ? handleEditCharacter : undefined}
            onRoll={rollCheck}
            onClose={() => setCheckDraft(null)}
          />
        )}

        {!message.is_deleted && !message.pending && !isEditing && (
          <div className="mt-1 flex items-center gap-0.5">
            {reactionsRow}
            {reactionPicker}
          </div>
        )}
      </div>

      {!message.is_deleted && !message.pending && !isEditing && actions.length > 0 && (
        <div className="flex-shrink-0">
          <div className={`${MESSAGE_ACTION_SIZING.desktopRowVisibility} opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity items-center`}>
            {actionIcons}
          </div>
          {mobileMenuButton}
        </div>
      )}
      {actionsSheet}
      {deleteConfirmDialog}
    </div>
  )
})
