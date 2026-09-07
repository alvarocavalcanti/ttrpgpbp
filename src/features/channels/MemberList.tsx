import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Database } from '../../types/database'
import { MAX_AWAY_MESSAGE_LENGTH } from '../../constants'

import { EditCharacterModal } from './EditCharacterModal'
import { SignedImg } from '../../components/SignedImg'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { TextPromptSheet } from '../../components/TextPromptSheet'
import { useMemberModeration } from './useMemberModeration'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'

type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}

interface MemberListProps {
  members: ChannelMember[]
  isGM: boolean
  gmId: string | null
  myUserId?: string
  gameSystem?: string
  channelId: string
  onUpdate: () => void
  // Editing state is owned by ChannelView so other views (e.g. the check
  // sheet in chat) can deep-link straight into Edit Character.
  editingMemberId: string | null
  onEditMember: (memberId: string | null) => void
}

export function MemberList({ members, isGM, gmId, myUserId, gameSystem = 'none', channelId, onUpdate, editingMemberId, onEditMember }: MemberListProps) {
  const navigate = useNavigate()
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<{ action: 'block' | 'kick' | 'leave'; memberId: string } | null>(null)
  const [awayPromptMemberId, setAwayPromptMemberId] = useState<string | null>(null)
  
  // Close menu on click outside
  useEffect(() => {
    const handleClick = () => setOpenMenuId(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Escape closes the open menu. Registered only while a menu is open: this
  // component is always mounted, so an always-on handler would sit on top of
  // the shared Escape stack and swallow Escape meant for the mobile drawer
  // or modals below.
  useEscapeToClose(() => {
    setOpenMenuId(null)
  }, openMenuId !== null)
  
  const { moderateMember, setAway } = useMemberModeration()

  const startEditing = (member: ChannelMember) => {
    onEditMember(member.id)
  }

  // Guard-then-confirm: the GM checks run when the menu item is tapped, the
  // in-app confirmation dialog owns the irreversible step.
  const requestModeration = (action: 'block' | 'kick' | 'leave', member: ChannelMember) => {
    if (action !== 'leave' && member.user_id === gmId) {
      setError(action === 'block' ? 'Cannot block the GM.' : 'Cannot kick the GM.')
      return
    }
    setPendingAction({ action, memberId: member.id })
  }

  const runModeration = async (action: 'block' | 'kick' | 'leave', memberId: string) => {
    setPendingAction(null)
    setError(null)
    if (action === 'leave') {
      try {
        const error = await moderateMember(channelId, memberId, 'leave')
        if (error) throw error
        navigate('/', { replace: true })
      } catch (err) {
        console.error('Error leaving channel:', err)
        setError('Failed to leave channel.')
      }
      return
    }
    try {
      const error = await moderateMember(channelId, memberId, action)
      if (error) throw error
      onUpdate()
    } catch (err) {
      console.error(`Error ${action === 'block' ? 'blocking' : 'kicking'} member:`, err)
      setError(action === 'block' ? 'Failed to block member.' : 'Failed to kick member.')
    }
  }

  const handleToggleAway = (memberId: string) => {
    setError(null)
    const targetMember = members.find(m => m.id === memberId)
    if (!targetMember) return
    // Going back needs no input; going away opens the in-app message sheet
    // (prefilled with any previous message) so Cancel aborts with no change.
    if (targetMember.is_away) {
      void setAwayStatus(memberId, false, null)
    } else {
      setAwayPromptMemberId(memberId)
    }
  }

  const setAwayStatus = async (memberId: string, isAway: boolean, awayMessage: string | null) => {
    try {
      const error = await setAway(memberId, isAway, awayMessage)
      if (error) throw error
      onUpdate()
    } catch (err) {
      console.error('Error toggling away status:', err)
      setError('Failed to update away status.')
    }
  }

  const handleUnblockMember = async (memberId: string) => {
    setError(null)
    try {
      const error = await moderateMember(channelId, memberId, 'unblock')
      if (error) throw error
      onUpdate()
    } catch (err) {
      console.error('Error unblocking member:', err)
      setError('Failed to unblock member.')
    }
  }

  const activeMembers = members.filter(m => !m.is_blocked)
  const blockedMembers = members.filter(m => m.is_blocked)

  return (
    <div className="py-4">
      {error && (
        <div className="px-4 mb-4">
          <div className="p-2 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-800">
            {error}
          </div>
        </div>
      )}
      <div className="px-4 mb-4">
        <h3 className="text-xs font-semibold text-surface-500 dark:text-surface-400 uppercase tracking-wider">
          Players — {activeMembers.length}
        </h3>
      </div>

      <ul className="space-y-4 px-2">
        {activeMembers.map(member => {
          const isMe = member.user_id === myUserId
          

          return (
            <li key={member.id} className="group p-2 rounded-md hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors">
              <div className={`flex items-center space-x-3 ${member.is_away ? 'opacity-60' : ''}`}>
                <div className="flex-shrink-0 relative">
                  {member.character_avatar_url || member.profile?.avatar_url ? (
                    <SignedImg 
                      className={`h-10 w-10 rounded-full object-cover ${member.is_away ? 'grayscale' : ''}`} 
                      src={member.character_avatar_url || member.profile?.avatar_url || ''} 
                      alt="" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={`h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-500 dark:text-primary-400 ${member.is_away ? 'grayscale' : ''}`}>
                      {member.character_name[0].toUpperCase()}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                    <>
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                          {member.character_name}
                        </p>
                        {member.is_away && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400 uppercase">
                            AFK
                          </span>
                        )}
                        {member.is_active_player && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200 uppercase">
                            Active
                          </span>
                        )}
                        {member.user_id === gmId && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                            GM
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                        {member.profile?.display_name}
                      </p>
                      {member.character_notes && (
                        <p className="text-xs text-surface-400 dark:text-surface-400 truncate">{member.character_notes}</p>
                      )}
                      {member.is_away && member.away_message && (
                        <p className="text-xs text-surface-400 dark:text-surface-400 italic truncate">
                          {member.away_message}
                        </p>
                      )}
                      {member.character_sheet_url && /^https?:\/\//i.test(member.character_sheet_url) && (
                        <a 
                          href={member.character_sheet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary-600 dark:text-primary-400 hover:underline inline-block mt-1"
                        >
                          Sheet
                        </a>
                      )}
                    </>
                </div>

                {(isMe || isGM) && (
                  <div className="relative">
                    <button
                      type="button"
                      data-testid={`menu-btn-${member.id}`}
                      aria-label={`Member options for ${member.character_name}`}
                      aria-haspopup="menu"
                      aria-expanded={openMenuId === member.id}
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === member.id ? null : member.id) }}
                      className="p-3 rounded-full text-surface-400 dark:text-surface-400 hover:text-surface-600 dark:hover:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    
                    {openMenuId === member.id && (
                      <div role="menu" aria-label={`Member options for ${member.character_name}`} className="absolute right-0 mt-1 w-36 rounded-md shadow-lg bg-white dark:bg-surface-800 ring-1 ring-black ring-opacity-5 z-50">
                        <div className="py-1">
                          {isMe && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setOpenMenuId(null); startEditing(member); }}
                              className="w-full text-left px-4 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"
                            >
                              Edit Character
                            </button>
                          )}
                          {isMe && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setOpenMenuId(null); handleToggleAway(member.id); }}
                              className="w-full text-left px-4 py-2 text-sm text-surface-700 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700"
                            >
                              {member.is_away ? 'Mark Back (Available)' : 'Mark Away (AFK)'}
                            </button>
                          )}
                          {isGM && !isMe && member.user_id !== gmId && (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); requestModeration('kick', member); }}
                                className="w-full text-left px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-surface-100 dark:hover:bg-surface-700"
                              >
                                Kick Player
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setOpenMenuId(null); requestModeration('block', member); }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700"
                              >
                                Block Player
                              </button>
                            </>
                          )}
                          {isMe && member.user_id !== gmId && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => { setOpenMenuId(null); requestModeration('leave', member); }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-surface-100 dark:hover:bg-surface-700"
                            >
                              Leave Channel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {isGM && blockedMembers.length > 0 && (
        <div className="mt-8">
          <div className="px-4 mb-4">
            <h3 className="text-xs font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider">
              Blocked — {blockedMembers.length}
            </h3>
          </div>
          <ul className="space-y-2 px-2">
            {blockedMembers.map(member => (
              <li key={member.id} className="p-2 flex items-center justify-between">
                <div className="flex items-center space-x-3 opacity-50">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-red-100 dark:bg-red-900 flex items-center justify-center text-red-500 dark:text-red-400">
                      {member.character_name[0].toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate line-through">
                      {member.character_name}
                    </p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 truncate">
                      {member.profile?.display_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblockMember(member.id)}
                  className="ml-3 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200 font-medium shrink-0"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editingMemberId && (
        <EditCharacterModal
          member={members.find(m => m.id === editingMemberId)!}
          gameSystem={gameSystem}
          onClose={() => onEditMember(null)}
          onUpdate={onUpdate}
        />
      )}

      {pendingAction && pendingAction.action !== 'leave' && (
        <ConfirmDialog
          title={pendingAction.action === 'block' ? 'Block this player?' : 'Kick this player?'}
          description={pendingAction.action === 'block'
            ? 'They will lose access to this channel immediately.'
            : 'They will be removed from the channel and can rejoin with the invite link.'}
          confirmLabel={pendingAction.action === 'block' ? 'Block' : 'Kick'}
          onConfirm={() => runModeration(pendingAction.action, pendingAction.memberId)}
          onClose={() => setPendingAction(null)}
        />
      )}

      {pendingAction?.action === 'leave' && (
        <ConfirmDialog
          title="Leave this channel?"
          description="You will no longer see or receive notifications for this channel. You can rejoin with the invite link."
          confirmLabel="Leave"
          onConfirm={() => runModeration('leave', pendingAction.memberId)}
          onClose={() => setPendingAction(null)}
        />
      )}

      {awayPromptMemberId && (() => {
        const targetMember = members.find(m => m.id === awayPromptMemberId)
        if (!targetMember) return null
        return (
          <TextPromptSheet
            title="Mark Away (AFK)"
            label="Away message (optional)"
            initialValue={targetMember.away_message ?? ''}
            placeholder='e.g. "Away until Monday"'
            maxLength={MAX_AWAY_MESSAGE_LENGTH}
            confirmLabel="Mark Away"
            onConfirm={(message) => {
              setAwayPromptMemberId(null)
              void setAwayStatus(targetMember.id, true, message || null)
            }}
            onClose={() => setAwayPromptMemberId(null)}
          />
        )
      })()}
    </div>
  )
}
