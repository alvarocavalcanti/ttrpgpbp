import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useImageUpload } from '../../hooks/useImageUpload'

export interface ChannelAvatarApi {
  uploadEnabled: boolean
  settingsLoading: boolean
  uploading: boolean
  uploadAvatar: (file: File) => Promise<string | null>
}

// Uploads a channel avatar into the private 'images' bucket, then persists the
// bare object path on the channel row (signed at render time). Upload mechanics
// (resize, admin toggle, size cap) live in useImageUpload.
export function useChannelAvatar(channelId: string | undefined, onUpdated?: () => void): ChannelAvatarApi {
  const { uploadEnabled, settingsLoading, uploading, uploadImage } = useImageUpload(channelId)

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!channelId) return null
    const path = await uploadImage(file, 'avatar')
    if (!path) return null

    const { error: updateError } = await supabase
      .from('channels')
      .update({ avatar_url: path })
      .eq('id', channelId)
    if (updateError) throw updateError

    onUpdated?.()
    return path
  }, [channelId, uploadImage, onUpdated])

  return { uploadEnabled, settingsLoading, uploading, uploadAvatar }
}
