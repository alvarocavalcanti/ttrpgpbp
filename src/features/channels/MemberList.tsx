import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

import { EditCharacterModal } from './EditCharacterModal'

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
}

export function MemberList({ members, isGM, gmId, myUserId, gameSystem = 'none', channelId, onUpdate }: MemberListProps) {
  const navigate = useNavigate()
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Close menu on click outside
  useEffect(() => {
    const handleClick = () => setOpenMenuId(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])
  
  const insertSystemMessage = async (content: string): Promise<boolean> => {
    const { error } = await supabase
      .from('messages')
      .insert({ channel_id: channelId, sender_id: myUserId, type: 'system', content })
    if (error) {
      console.error('Failed to insert system message:', error)
      return false
    }
    return true
  }
  
  const startEditing = (member: ChannelMember) => {
    setEditingMemberId(member.id)
  }

  const handleBlockMember = async (memberId: string) => {
    setError(null)
    const targetMember = members.find(m => m.id === memberId)
    if (targetMember?.user_id === gmId) {
      setError('Cannot block the GM.')
      return
    }
    if (!confirm('Are you sure you want to block this player?')) return
    
    try {
      const { error } = await supabase
        .from('channel_members')
        .update({ is_blocked: true })
        .eq('id', memberId)

      if (error) throw error
      const posted = await insertSystemMessage(`${targetMember?.character_name} was blocked by the GM`)
      if (!posted) setError('Player blocked, but failed to post the system message.')
      onUpdate()
    } catch (err) {
      console.error('Error blocking member:', err)
      setError('Failed to block member.')
    }
  }

  const handleKickMember = async (memberId: string) => {
    setError(null)
    const targetMember = members.find(m => m.id === memberId)
    if (targetMember?.user_id === gmId) {
      setError('Cannot kick the GM.')
      return
    }
    if (!confirm('Are you sure you want to kick this player?')) return
    
    try {
      // Post the system message before the delete: after the delete, the kicked
      // player is gone, and the messages RLS policy can block the insert.
      const posted = await insertSystemMessage(`${targetMember?.character_name} was kicked from the channel`)
      const { error } = await supabase
        .from('channel_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error
      if (!posted) setError('Player kicked, but failed to post the system message.')
      onUpdate()
    } catch (err) {
      console.error('Error kicking member:', err)
      setError('Failed to kick member.')
    }
  }

  const handleLeaveChannel = async (memberId: string) => {
    setError(null)
    const targetMember = members.find(m => m.id === memberId)
    if (!confirm('Are you sure you want to leave this channel?')) return
    
    try {
      // Post the system message before the delete: after leaving, the user is no
      // longer a channel member, so the messages RLS policy would reject the insert.
      const posted = await insertSystemMessage(`${targetMember?.character_name} left the channel`)
      const { error } = await supabase
        .from('channel_members')
        .delete()
        .eq('id', memberId)

      if (error) throw error
      if (!posted) setError('Left the channel, but failed to post the system message.')
      navigate('/')
    } catch (err) {
      console.error('Error leaving channel:', err)
      setError('Failed to leave channel.')
    }
  }

  const handleToggleAway = async (memberId: string) => {
    setError(null)
    const targetMember = members.find(m => m.id === memberId)
    if (!targetMember) return
    try {
      let awayMessage: string | null = null
      if (!targetMember.is_away) {
        const entered = window.prompt('Optional away message (e.g. "Away until Monday"). Leave blank for none.')
        if (entered === null) return
        awayMessage = entered.trim() || null
      }
      const { error } = await supabase
        .from('channel_members')
        .update({ is_away: !targetMember.is_away, away_message: awayMessage })
        .eq('id', memberId)

      if (error) throw error
      onUpdate()
    } catch (err) {
      console.error('Error toggling away status:', err)
      setError('Failed to update away status.')
    }
  }

  const handleUnblockMember = async (memberId: string) => {
    setError(null)
    const targetMember = members.find(m => m.id === memberId)
    try {
      const { error } = await supabase
        .from('channel_members')
        .update({ is_blocked: false })
        .eq('id', memberId)

      if (error) throw error
      const posted = await insertSystemMessage(`${targetMember?.character_name} was unblocked by the GM`)
      if (!posted) setError('Player unblocked, but failed to post the system message.')
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
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          Players — {activeMembers.length}
        </h3>
      </div>

      <ul className="space-y-4 px-2">
        {activeMembers.map(member => {
          const isMe = member.user_id === myUserId
          

          return (
            <li key={member.id} className="group p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <div className={`flex items-center space-x-3 ${member.is_away ? 'opacity-60' : ''}`}>
                <div className="flex-shrink-0 relative">
                  {member.character_avatar_url || member.profile?.avatar_url ? (
                    <img 
                      className={`h-10 w-10 rounded-full object-cover ${member.is_away ? 'grayscale' : ''}`} 
                      src={member.character_avatar_url || member.profile?.avatar_url || ''} 
                      alt="" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={`h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400 ${member.is_away ? 'grayscale' : ''}`}>
                      {member.character_name[0].toUpperCase()}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                    <>
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {member.character_name}
                        </p>
                        {member.is_away && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 uppercase">
                            AFK
                          </span>
                        )}
                        {member.is_active_player && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 uppercase">
                            Active
                          </span>
                        )}
                        {member.user_id === gmId && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300">
                            GM
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {member.profile?.display_name}
                      </p>
                      {member.character_notes && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{member.character_notes}</p>
                      )}
                      {member.is_away && member.away_message && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 italic truncate">
                          {member.away_message}
                        </p>
                      )}
                      {member.character_sheet_url && (
                        <a 
                          href={member.character_sheet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-block mt-1"
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
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === member.id ? null : member.id) }}
                      className="p-1 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    
                    {openMenuId === member.id && (
                      <div className="absolute right-0 mt-1 w-36 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-50">
                        <div className="py-1">
                          {isMe && (
                            <button
                              type="button"
                              onClick={() => { setOpenMenuId(null); startEditing(member); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              Edit Character
                            </button>
                          )}
                          {isMe && (
                            <button
                              type="button"
                              onClick={() => { setOpenMenuId(null); handleToggleAway(member.id); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              {member.is_away ? 'Mark Back (Available)' : 'Mark Away (AFK)'}
                            </button>
                          )}
                          {isGM && !isMe && member.user_id !== gmId && (
                            <>
                              <button
                                type="button"
                                onClick={() => { setOpenMenuId(null); handleKickMember(member.id); }}
                                className="w-full text-left px-4 py-2 text-sm text-orange-600 dark:text-orange-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Kick Player
                              </button>
                              <button
                                type="button"
                                onClick={() => { setOpenMenuId(null); handleBlockMember(member.id); }}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                              >
                                Block Player
                              </button>
                            </>
                          )}
                          {isMe && member.user_id !== gmId && (
                            <button
                              type="button"
                              onClick={() => { setOpenMenuId(null); handleLeaveChannel(member.id); }}
                              className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
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
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate line-through">
                      {member.character_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {member.profile?.display_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleUnblockMember(member.id)}
                  className="ml-3 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium shrink-0"
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
          onClose={() => setEditingMemberId(null)}
          onUpdate={onUpdate}
        />
      )}
    </div>
  )
}

