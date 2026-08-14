import { useCallback, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { resizeImageFile } from '../../lib/imageResize'
import { useAppSetting } from '../../hooks/useAppSetting'

const DEFAULT_MAX_SIZE_MB = 5

export interface ChannelAvatarApi {
  uploadEnabled: boolean
  settingsLoading: boolean
  uploading: boolean
  uploadAvatar: (file: File) => Promise<string | null>
}

// Uploads a channel avatar: client-side resize, storage upload, then persist the
// public URL on the channel row. Gated by the admin's image_uploading_enabled
// setting (off by default) and image_max_size_mb.
export function useChannelAvatar(channelId: string | undefined, onUpdated?: () => void): ChannelAvatarApi {
  const { value: uploadEnabled, loading: settingsLoading } = useAppSetting<boolean>('image_uploading_enabled', false)
  const { value: maxSizeMb } = useAppSetting<number>('image_max_size_mb', DEFAULT_MAX_SIZE_MB)
  const [uploading, setUploading] = useState(false)

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!channelId) return null
    if (!uploadEnabled) {
      throw new Error('Image uploads are disabled by the server admin')
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      throw new Error(`Image is too large (max ${maxSizeMb} MB)`)
    }

    setUploading(true)
    try {
      const resized = await resizeImageFile(file)
      const path = `${channelId}/avatar/${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await supabase.storage.from('images').upload(path, resized, {
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path)
      const { error: updateError } = await supabase
        .from('channels')
        .update({ avatar_url: publicUrl })
        .eq('id', channelId)
      if (updateError) throw updateError

      onUpdated?.()
      return publicUrl
    } finally {
      setUploading(false)
    }
  }, [channelId, uploadEnabled, maxSizeMb, onUpdated])

  return { uploadEnabled, settingsLoading, uploading, uploadAvatar }
}
