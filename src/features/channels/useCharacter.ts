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

  return { updateCharacter }
}
