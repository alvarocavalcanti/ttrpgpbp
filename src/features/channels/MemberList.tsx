import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'

type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null }
}

interface MemberListProps {
  members: ChannelMember[]
  isGM: boolean
  channelId: string
  myUserId?: string
}

export function MemberList({ members, isGM, myUserId }: MemberListProps) {
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  
  // Local state for editing my own member info
  const [characterName, setCharacterName] = useState('')
  const [characterSheetUrl, setCharacterSheetUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const startEditing = (member: ChannelMember) => {
    setEditingMemberId(member.id)
    setCharacterName(member.character_name)
    setCharacterSheetUrl(member.character_sheet_url || '')
  }

  const handleSaveMember = async (memberId: string) => {
    setIsSubmitting(true)
    try {
      const { error } = await supabase
        .from('channel_members')
        .update({
          character_name: characterName,
          character_sheet_url: characterSheetUrl || null
        })
        .eq('id', memberId)

      if (error) throw error
      window.location.reload()
    } catch (err) {
      console.error('Error updating member:', err)
      setIsSubmitting(false)
    }
  }

  const handleBlockMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to block this player?')) return
    
    try {
      const { error } = await supabase
        .from('channel_members')
        .update({ is_blocked: true })
        .eq('id', memberId)

      if (error) throw error
      window.location.reload()
    } catch (err) {
      console.error('Error blocking member:', err)
    }
  }

  const activeMembers = members.filter(m => !m.is_blocked)
  const blockedMembers = members.filter(m => m.is_blocked)

  return (
    <div className="py-4">
      <div className="px-4 mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Players — {activeMembers.length}
        </h3>
      </div>

      <ul className="space-y-4 px-2">
        {activeMembers.map(member => {
          const isMe = member.user_id === myUserId
          const isEditing = editingMemberId === member.id

          return (
            <li key={member.id} className="group p-2 rounded-md hover:bg-gray-50 transition-colors">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  {member.character_avatar_url || member.profile?.avatar_url ? (
                    <img 
                      className="h-10 w-10 rounded-full object-cover" 
                      src={member.character_avatar_url || member.profile?.avatar_url || ''} 
                      alt="" 
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500">
                      {member.character_name[0].toUpperCase()}
                    </div>
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={characterName}
                        onChange={(e) => setCharacterName(e.target.value)}
                        className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Character Name"
                      />
                      <input
                        type="url"
                        value={characterSheetUrl}
                        onChange={(e) => setCharacterSheetUrl(e.target.value)}
                        className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="Sheet URL"
                      />
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSaveMember(member.id)}
                          disabled={isSubmitting || !characterName.trim()}
                          className="text-xs text-white bg-indigo-600 hover:bg-indigo-700 px-2 py-1 rounded disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingMemberId(null)}
                          disabled={isSubmitting}
                          className="text-xs text-gray-700 bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {member.character_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {member.profile?.display_name}
                      </p>
                      {member.character_sheet_url && (
                        <a 
                          href={member.character_sheet_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-indigo-600 hover:underline inline-block mt-1"
                        >
                          Sheet
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>

              {!isEditing && (isMe || (isGM && !isMe)) && (
                <div className="mt-2 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity pl-13">
                  {isMe && (
                    <button
                      onClick={() => startEditing(member)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      Edit Character
                    </button>
                  )}
                  {isGM && !isMe && (
                    <button
                      onClick={() => handleBlockMember(member.id)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Block Player
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {isGM && blockedMembers.length > 0 && (
        <div className="mt-8">
          <div className="px-4 mb-4">
            <h3 className="text-xs font-semibold text-red-500 uppercase tracking-wider">
              Blocked — {blockedMembers.length}
            </h3>
          </div>
          <ul className="space-y-2 px-2">
            {blockedMembers.map(member => (
              <li key={member.id} className="p-2">
                <div className="flex items-center space-x-3 opacity-50">
                  <div className="flex-shrink-0">
                    <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                      {member.character_name[0].toUpperCase()}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate line-through">
                      {member.character_name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {member.profile?.display_name}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
