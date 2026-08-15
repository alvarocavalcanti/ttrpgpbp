import { useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useImageUpload } from '../../hooks/useImageUpload'

export interface ChannelAvatarApi {
  uploadEnabled: boolean
  settingsLoading: boolean
  uploading: boolean
  uploadAvatar: (file: File) => Promise<string | null>
}

// Uploads a channel avatar into the 'images' bucket, then persists the public
// URL on the channel row. Upload mechanics (resize, admin toggle, size cap)
// live in useImageUpload.
export function useChannelAvatar(channelId: string | undefined, onUpdated?: () => void): ChannelAvatarApi {
  const { uploadEnabled, settingsLoading, uploading, uploadImage } = useImageUpload(channelId)

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!channelId) return null
    const publicUrl = await uploadImage(file, 'avatar')
    if (!publicUrl) return null

    const { error: updateError } = await supabase
      .from('channels')
      .update({ avatar_url: publicUrl })
      .eq('id', channelId)
    if (updateError) throw updateError

    onUpdated?.()
    return publicUrl
  }, [channelId, uploadImage, onUpdated])

  return { uploadEnabled, settingsLoading, uploading, uploadAvatar }
}
