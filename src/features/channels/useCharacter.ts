import { supabase } from '../../lib/supabase'

// Data layer for a member's character (ARCH-1): the channel_members update
// lives here; EditCharacterModal keeps the form UX and error copy.
export function useCharacter() {
  const updateCharacter = async (memberId: string, fields: {
    character_name: string
    character_sheet_url: string | null
    character_notes: string | null
    attributes: Record<string, number>
  }) => {
    const { error } = await supabase
      .from('channel_members')
      .update(fields)
      .eq('id', memberId)
    return error
  }

  /**
   * Portrait writes are separate from the character form save: the form never
   * carries the avatar, so a save with a stale preview cannot clobber a
   * freshly uploaded portrait. A null url clears it.
   */
  const updateCharacterAvatar = async (memberId: string, avatarUrl: string | null) => {
    const { error } = await supabase
      .from('channel_members')
      .update({ character_avatar_url: avatarUrl })
      .eq('id', memberId)
    return error
  }

  return { updateCharacter, updateCharacterAvatar }
}
