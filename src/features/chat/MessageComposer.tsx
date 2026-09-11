import { Avatar } from '../../components/Avatar';
import { useState, useRef, useEffect, useId, useCallback, useImperativeHandle, forwardRef } from 'react'
import type { Database } from '../../types/database'
import type { MessageSendPayload } from './types'
import { DiceRoller } from '../dice/DiceRoller'
import { linkifyMentions } from './mentions'
import { randomNpcIconUrl, isNpcIconUrl } from './npcIcons'
import { IconPicker } from './IconPicker'
import { Menu } from '../../components/Menu'
import { BottomSheet } from '../../components/BottomSheet'
import { useImageUpload } from '../../hooks/useImageUpload'
import { SignedImg } from '../../components/SignedImg'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { MAX_MESSAGE_LENGTH, MAX_NPC_NAME_LENGTH } from '../../constants'
import { chipBase, chipIdle, chipActive } from './composerChip'
import { safeGetItem, safeSetItem, safeRemoveItem } from '../../lib/safeStorage'

type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}
type Npc = Database['public']['Tables']['channel_npcs']['Row']

export interface ReplyTarget {
  id: string
  content: string
  senderName: string | null
}

interface MessageComposerProps {
  channelId?: string
  isGM: boolean
  members: ChannelMember[]
  npcs?: Npc[]
  onSendMessage: (payload: { content: string, type: 'regular' | 'scene' | 'npc', whisper_to?: string, active_player_ids?: string[], reply_to?: string, npc_name?: string, npc_avatar_url?: string }) => Promise<void>
  onRollDice?: (notation: string, replyToId?: string) => void
  replyTo?: ReplyTarget | null
  onCancelReply?: () => void
  onXCard?: () => void
}

// Imperative surface for the Channel Media panel (#465): the GM picks images
// in a panel that lives in ChannelView and asks the composer to insert their
// markdown at the cursor, without lifting the composer's draft state up.
export interface MessageComposerHandle {
  insertImages: (paths: string[]) => void
}

export const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(function MessageComposer({ channelId, isGM, members, npcs = [], onSendMessage, onRollDice, replyTo, onCancelReply, onXCard }: MessageComposerProps, ref) {
  const [content, setContent] = useState('')
  const [isScene, setIsScene] = useState(false)

  const draftKey = channelId ? `composer_draft_${channelId}` : null

  // Latest content for the save-on-leave cleanup below, which must persist
  // the text belonging to the key being left — a closure would see stale
  // content (typing doesn't re-run a [draftKey] effect). Synced in a
  // committed effect, not render (React Doctor no-ref-current-in-render):
  // cleanups run after the last commit, so the ref already holds the final
  // content when a key change or unmount persists it. Declared before the
  // restore effect so this commit's sync runs before its re-stamp.
  const contentRef = useRef(content)
  useEffect(() => {
    contentRef.current = content
  }, [content])

  useEffect(() => {
    // Restore: bring this channel's draft into the composer. From this point
    // the content that "belongs" to this key is the saved draft (or empty) —
    // the ref is re-stamped so a mid-switch unmount persists the right value.
    if (draftKey) {
      const saved = safeGetItem(draftKey)
      contentRef.current = saved ?? ''
      setContent(saved ?? '')
    } else {
      contentRef.current = ''
      setContent('')
    }
    return () => {
      // Save on key change/unmount: the cleanup runs BEFORE the next key's
      // restore and always with the key it belongs to, so a quick channel
      // switch can never write the old channel's text over the new channel's
      // stored draft (#404). Only non-empty writes — the empty transition is
      // handled by the live-save effect below, and a no-op keeps StrictMode's
      // double-mount from wiping a draft before its restore re-reads it.
      if (draftKey && contentRef.current) safeSetItem(draftKey, contentRef.current)
    }
  }, [draftKey])

  // Live-save while composing. Keyed on content only: re-running on draftKey
  // would replay the pre-restore text into the new key — the race PBP-4
  // fixes. The key-change persist is the restore effect's cleanup above.
  useEffect(() => {
    if (draftKey) {
      if (content) safeSetItem(draftKey, content)
      else safeRemoveItem(draftKey)
    }
  }, [content])

  const [isNpc, setIsNpc] = useState(false)
  const [npcName, setNpcName] = useState('')
  const [npcAvatarUrl, setNpcAvatarUrl] = useState<string | null>(null)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [whisperTo, setWhisperTo] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragDepth = useRef(0)
  const [isExpanded, setIsExpanded] = useState(false)
  const [mentionState, setMentionState] = useState<{ start: number; query: string } | null>(null)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)
  const listboxId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { uploadEnabled, settingsLoading, uploading, uploadImage } = useImageUpload(channelId)

  const matchedNpc = npcName.trim()
    ? npcs.find(n => n.name.toLowerCase() === npcName.trim().toLowerCase())
    : undefined
  const npcNameMatches = npcName.trim()
    ? npcs.filter(n => n.name.toLowerCase().includes(npcName.trim().toLowerCase())).slice(0, 5)
    : []
  // Existing NPC wins; otherwise the explicitly-picked/shuffled avatar.
  const resolvedNpcAvatar = matchedNpc?.avatar_url || npcAvatarUrl

  const toggleNpc = (on: boolean) => {
    setIsNpc(on)
    setIsScene(false)
    if (on && !npcAvatarUrl) setNpcAvatarUrl(randomNpcIconUrl())
  }

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`
    }
  }, [content])

  const matchedMembers = mentionState
    ? members.filter(m => m.character_name && m.character_name.toLowerCase().startsWith(mentionState.query.toLowerCase()))
    : []
  const showAllMention = isGM && mentionState && 'all'.startsWith(mentionState.query.toLowerCase())
  // Flattened option list: @all first (GM only), then matching members.
  const mentionOptions = [
    ...(showAllMention ? ['all' as string] : []),
    ...matchedMembers.map(m => m.character_name),
  ]
  const mentionOpen = mentionOptions.length > 0
  const memberStartIndex = showAllMention ? 1 : 0

  // Keep the highlight on a valid option when the list shrinks.
  useEffect(() => {
    setActiveMentionIndex(i => (mentionOpen ? Math.min(i, mentionOptions.length - 1) : 0))
  }, [mentionOptions.length, mentionOpen])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    const cursor = e.target.selectionStart ?? value.length
    setContent(value)
    // Detect an in-progress @mention: '@' preceded by start/whitespace, no spaces after.
    const uptoCursor = value.slice(0, cursor)
    const match = uptoCursor.match(/(^|\s)@([^\s]*)$/)
    if (match) {
      const atIndex = cursor - match[2].length - 1
      setMentionState({ start: atIndex, query: match[2] })
    } else {
      setMentionState(null)
    }
  }

  const selectMention = (name: string) => {
    if (!mentionState || !textareaRef.current) return
    const value = content
    const cursor = textareaRef.current.selectionStart ?? value.length
    const start = mentionState.start
    const next = value.slice(0, start) + '@' + name + ' ' + value.slice(cursor)
    setContent(next)
    setMentionState(null)
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      const pos = start + name.length + 2
      ta.setSelectionRange(pos, pos)
    })
  }

  // Single insertion path shared by the Upload button, drag-and-drop and the
  // Channel Media panel (#465): insert at the cursor, keep focus and move the
  // caret past the inserted markdown. Uses a functional update so an async
  // caller (an in-flight upload) never writes a stale content snapshot.
  const insertAtCursor = useCallback((insertion: string) => {
    if (!insertion) return
    const ta = textareaRef.current
    const cursor = ta?.selectionStart ?? contentRef.current.length
    setContent(prev => prev.slice(0, cursor) + insertion + prev.slice(cursor))
    setMentionState(null)
    requestAnimationFrame(() => {
      const nextTa = textareaRef.current
      if (!nextTa) return
      nextTa.focus()
      nextTa.setSelectionRange(cursor + insertion.length, cursor + insertion.length)
    })
  }, [])

  const insertImagePaths = useCallback((paths: string[]) => {
    insertAtCursor(paths.map(p => `![](${p})\n`).join(''))
  }, [insertAtCursor])

  useImperativeHandle(ref, () => ({ insertImages: insertImagePaths }), [insertImagePaths])

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageError(null)
    try {
      // ~1200px keeps maps/handouts legible; storage cost stays tiny after the
      // JPEG re-encode.
      const publicUrl = await uploadImage(file, 'message', 1200)
      if (publicUrl) insertImagePaths([publicUrl])
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to upload image.')
    }
  }

  // Drag-and-drop is a desktop-only entry point for the same upload flow,
  // available only when a GM may actually upload. Non-GM/no-op leaves the
  // browser's default drop behavior untouched (acceptance #4).
  const canDropImages = isGM && uploadEnabled && !settingsLoading

  const handleDragEnter = (e: React.DragEvent) => {
    if (!canDropImages) return
    e.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (!canDropImages) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = () => {
    if (!canDropImages) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    if (!canDropImages) return
    e.preventDefault()
    dragDepth.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (!files.length) return
    setImageError(null)
    const images = files.filter(f => f.type.startsWith('image/'))
    const rejected = files.length - images.length
    const paths: string[] = []
    let failed = 0
    for (const file of images) {
      try {
        const path = await uploadImage(file, 'message', 1200)
        if (path) paths.push(path)
      } catch {
        failed += 1
      }
    }
    // Successful files still insert; failures/rejections report inline.
    if (paths.length) insertImagePaths(paths)
    if (failed > 0) setImageError(failed === 1 ? 'Failed to upload image.' : `Failed to upload ${failed} images.`)
    else if (rejected > 0) setImageError('Please choose an image file.')
  }

  const handleNpcImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageError(null)
    try {
      const publicUrl = await uploadImage(file, 'npc')
      if (publicUrl) setNpcAvatarUrl(publicUrl)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'Failed to upload image.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    if (isNpc && !npcName.trim()) {
      setError('Enter an NPC name to speak as.')
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const { content: mentionContent } = linkifyMentions(content, members, { allMentionEnabled: isGM })

      const payload: MessageSendPayload = {
        content: mentionContent,
        type: isNpc ? 'npc' : isScene ? 'scene' : 'regular',
        whisper_to: whisperTo || undefined,
      }
      if (isNpc) {
        payload.npc_name = npcName.trim()
        payload.npc_avatar_url = resolvedNpcAvatar ?? undefined
      }
      if (replyTo) payload.reply_to = replyTo.id

      await onSendMessage(payload)
      setContent('')
      if (draftKey) safeRemoveItem(draftKey)
      setIsScene(false)
      setIsNpc(false)
      setNpcName('')
      setNpcAvatarUrl(null)
      setWhisperTo('')
      setMentionState(null)
      onCancelReply?.()
    } catch (err) {
      console.error('Failed to send message:', err)
      setError('Failed to send message. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Send on Cmd/Ctrl + Enter
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit(e as unknown as React.FormEvent)
      return
    }
    // Enter/Tab while a mention is open picks the highlighted option instead of submitting
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveMentionIndex(i => (i + 1) % mentionOptions.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveMentionIndex(i => (i - 1 + mentionOptions.length) % mentionOptions.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        selectMention(mentionOptions[activeMentionIndex])
        return
      }
      // Escape cancels the mention list without inserting anything;
      // stopPropagation keeps the same keypress from also closing a modal
      // below via the useEscapeToClose stack.
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setMentionState(null)
      }
    }
  }

  // ponytail: touch users lose the shortcut tip; title on send button covers pointer users
  const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0
  const isMobile = useMediaQuery('(max-width: 640px)')

  const optionsContent = (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-wrap items-center gap-3">
        {onRollDice && (
          <div className="shrink-0">
            <DiceRoller popup={isMobile} channelId={channelId} onRoll={(notation) => {
              // Collapse the options panel so the rolled message is visible.
              setIsExpanded(false)
              if (replyTo) onRollDice?.(notation, replyTo.id)
              else onRollDice?.(notation)
            }} />
          </div>
        )}

        {onXCard && (
          <button
            type="button"
            onClick={onXCard}
            aria-label="X-Card"
            className={`${chipBase} ${chipIdle} text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 border-red-200 dark:border-red-800`}
            title="X-Card: privately flag the current scene to the GM"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="2" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 8l8 8M16 8l-8 8" />
            </svg>
            X Card
          </button>
        )}

        {isGM && (
          <label
            className={`${chipBase} ${chipIdle} cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Upload an image"
          >
            <input
              type="file"
              accept="image/*"
              aria-label="Upload Image"
              disabled={uploading || !uploadEnabled || settingsLoading}
              onChange={handleImageUpload}
              className="hidden"
            />
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {uploading ? 'Uploading...' : 'Upload'}
          </label>
        )}
      </div>

      {isGM && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            aria-pressed={isScene}
            aria-label="Scene Description"
            onClick={() => { setIsScene(!isScene); if (!isScene) setIsNpc(false) }}
            className={`${chipBase} ${isScene ? chipActive : chipIdle}`}
            title="Scene Description"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
            Scene
          </button>

          <button
            type="button"
            aria-pressed={isNpc}
            aria-label="NPC Mode"
            onClick={() => toggleNpc(!isNpc)}
            className={`${chipBase} ${isNpc ? chipActive : chipIdle}`}
            title="Speak as an NPC"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            NPC
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!isScene && (
          <Menu
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            }
            label="Whisper"
            value={whisperTo}
            onSelect={setWhisperTo}
            popup={isMobile}
            options={[
              { value: '', label: 'Everyone (Public)' },
              ...members.map(m => ({ value: m.user_id, label: m.character_name, hint: m.profile?.display_name || undefined })),
            ]}
          />
        )}
      </div>
    </div>
  )

  // Collapsed-state indicator bar: a small chip per active option so the GM
  // sees what's queued (scene/NPC/whisper) without opening the options
  // panel. Clicking a chip reopens the panel.
  const whisperMember = whisperTo ? members.find(m => m.user_id === whisperTo) : undefined
  const indicatorChips: { key: string; label: string; icon: React.ReactNode }[] = []
  if (isScene) {
    indicatorChips.push({
      key: 'scene',
      label: 'Scene',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
      ),
    })
  }
  if (isNpc) {
    indicatorChips.push({
      key: 'npc',
      label: 'NPC',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    })
  }
  if (whisperMember) {
    indicatorChips.push({
      key: 'whisper',
      label: `Whisper: ${whisperMember.character_name}`,
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    })
  }

  return (
    <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-2 sm:p-4">
      <form
        onSubmit={handleSubmit}
        data-testid="composer-dropzone"
        data-dragging={isDragging}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={isDragging ? 'rounded-lg ring-2 ring-inset ring-indigo-400' : undefined}
      >
        <div className="flex flex-col space-y-2">
          {/* Reply target bar */}
          {replyTo && (
            <div className="flex items-center space-x-2 px-2 text-sm bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 rounded-md py-1.5">
              <svg className="w-4 h-4 flex-shrink-0 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                <span className="font-medium text-indigo-700 dark:text-indigo-300">Replying to {replyTo.senderName || 'someone'}:</span>{' '}
                {replyTo.content.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')}
              </span>
              <button
                type="button"
                onClick={onCancelReply}
                className="ml-auto p-0.5 text-gray-400 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-400"
                aria-label="Cancel reply"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          )}

          {/* Controls row */}
          {isExpanded && !isMobile && (
            <div className="px-2 sm:px-0 mb-2">{optionsContent}</div>
          )}
          {isExpanded && isMobile && (
            <BottomSheet title="Options" onClose={() => setIsExpanded(false)}>{optionsContent}</BottomSheet>
          )}

          {/* NPC config row */}
          {isNpc && (
            <div className="flex items-center gap-2 px-2 sm:px-0">
              <div className="relative flex-1 min-w-[160px]">
                <input
                  value={npcName}
                  onChange={(e) => setNpcName(e.target.value)}
                  maxLength={MAX_NPC_NAME_LENGTH}
                  placeholder="NPC name (reuse existing or create new)"
                  aria-label="NPC Name"
                  className="block w-full bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 rounded-md text-sm py-1.5 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {npcNameMatches.length > 0 && (
                  <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {npcNameMatches.map(n => (
                      <button
                        key={n.id}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setNpcName(n.name); setNpcAvatarUrl(n.avatar_url) }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-950 flex items-center space-x-2"
                      >
                        <Avatar className={`h-5 w-5 rounded-full flex-shrink-0 ${isNpcIconUrl(n.avatar_url) ? 'dark:invert' : ''}`} src={n.avatar_url} alt="" referrerPolicy="no-referrer" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">{n.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {resolvedNpcAvatar && (
                <SignedImg
                  className={`h-8 w-8 rounded-full ${isNpcIconUrl(resolvedNpcAvatar) ? 'dark:invert' : ''}`}
                  src={resolvedNpcAvatar}
                  alt={matchedNpc ? `${matchedNpc.name} portrait` : 'NPC portrait preview'}
                  referrerPolicy="no-referrer"
                />
              )}
              <button
                type="button"
                onClick={() => setNpcAvatarUrl(randomNpcIconUrl())}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-full transition-colors"
                aria-label="Randomize NPC portrait"
                title="Random portrait"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setShowIconPicker(true)}
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-full transition-colors"
                aria-label="Choose NPC portrait"
                title="Choose portrait"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              <label
                className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-full transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                title="Upload portrait"
              >
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Upload NPC portrait"
                  disabled={uploading || !uploadEnabled || settingsLoading}
                  onChange={handleNpcImageUpload}
                  className="hidden"
                />
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </label>
            </div>
          )}

          {showIconPicker && (
            <IconPicker
              onPick={(url) => { setNpcAvatarUrl(url); setShowIconPicker(false) }}
              onClose={() => setShowIconPicker(false)}
            />
          )}

          {error && (
            <div className="mb-2 p-2 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-800">
              {error}
            </div>
          )}

          {imageError && (
            <div className="mb-2 p-2 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-800" role="alert">
              {imageError}
            </div>
          )}

          {!isExpanded && indicatorChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 px-2 sm:px-0">
              {indicatorChips.map(chip => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setIsExpanded(true)}
                  aria-label={`Edit ${chip.label}`}
                  className={`${chipBase} ${chipActive} !px-2 !py-1 text-xs`}
                >
                  {chip.icon}
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end space-x-2 relative">
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="mb-1 p-3 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 flex-shrink-0"
              aria-label="Toggle options"
            >
              <svg className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-45 text-indigo-600' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <div className="relative flex-1">
              {(showAllMention || matchedMembers.length > 0) && (
                <div id={listboxId} role="listbox" aria-label="Mention options" className="absolute bottom-full mb-1 left-0 right-0 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {showAllMention && (
                    <button
                      type="button"
                      role="option"
                      id={`${listboxId}-option-0`}
                      aria-selected={activeMentionIndex === 0}
                      onMouseDown={(e) => { e.preventDefault(); selectMention('all') }}
                      className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 ${activeMentionIndex === 0 ? 'bg-indigo-50 dark:bg-indigo-950' : 'hover:bg-indigo-50 dark:hover:bg-indigo-950'}`}
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">@all</span>
                      <span className="text-xs text-gray-400 dark:text-gray-400">All players</span>
                    </button>
                  )}
                  {matchedMembers.map((m, i) => {
                    const active = activeMentionIndex === memberStartIndex + i
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        id={`${listboxId}-option-${memberStartIndex + i}`}
                        aria-selected={active}
                        onMouseDown={(e) => { e.preventDefault(); selectMention(m.character_name) }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center space-x-2 ${active ? 'bg-indigo-50 dark:bg-indigo-950' : 'hover:bg-indigo-50 dark:hover:bg-indigo-950'}`}
                      >
                        {m.character_avatar_url && (
                          <Avatar className="h-5 w-5 rounded-full flex-shrink-0" src={m.character_avatar_url} alt="" referrerPolicy="no-referrer" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-gray-100">{m.character_name}</span>
                        {m.profile?.display_name && <span className="text-xs text-gray-400 dark:text-gray-400">({m.profile.display_name})</span>}
                      </button>
                    )
                  })}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleChange}
                maxLength={MAX_MESSAGE_LENGTH}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-autocomplete={mentionOpen ? 'list' : undefined}
                aria-expanded={mentionOpen}
                aria-controls={mentionOpen ? listboxId : undefined}
                aria-activedescendant={mentionOpen ? `${listboxId}-option-${Math.min(activeMentionIndex, mentionOptions.length - 1)}` : undefined}
                aria-label="Message"
                className={`block w-full text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600 rounded-2xl shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm resize-none py-3 px-4 max-h-[150px] ${isScene || isNpc ? 'bg-parchment dark:bg-parchment-dark font-serif' : whisperTo ? 'bg-purple-50 dark:bg-purple-950' : 'bg-white dark:bg-gray-800'}`}
                rows={1}
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="mb-1 p-3 flex-shrink-0 inline-flex items-center justify-center border border-transparent text-sm font-medium rounded-full shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
              aria-label="Send"
              title={`Send (${isMac ? '⌘' : 'Ctrl'} + Enter)`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  )
})
