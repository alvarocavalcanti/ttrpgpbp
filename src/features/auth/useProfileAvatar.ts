import { useCallback, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { resizeImageFile } from '../../lib/imageResize'
import { useAppSetting } from '../../hooks/useAppSetting'
import { updateAvatarUrl } from './authApi'

const DEFAULT_MAX_SIZE_MB = 5
const AVATAR_DIMENSION = 512

export interface ProfileAvatarApi {
  uploadEnabled: boolean
  settingsLoading: boolean
  uploading: boolean
  uploadAvatar: (file: File) => Promise<string | null>
}

// Uploads one profile picture into a self-owned `profile` object path:
// client-side resize, then the upload-image edge function with
// scope='profile', then persist the bare object path on profiles.avatar_url.
// Global to the account, gated by the admin's image_uploading_enabled and
// image_max_size_mb settings; the server enforces both again.
// ponytail: the gate/size checks mirror useImageUpload; extract shared upload
// plumbing only when a third image-upload caller appears.
export function useProfileAvatar(userId: string | undefined, onUpdated?: () => void): ProfileAvatarApi {
  const { value: uploadEnabled, loading: settingsLoading } = useAppSetting<boolean>('image_uploading_enabled', false)
  const { value: maxSizeMb } = useAppSetting<number>('image_max_size_mb', DEFAULT_MAX_SIZE_MB)
  const [uploading, setUploading] = useState(false)

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!userId) return null
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose an image file.')
    }
    if (!uploadEnabled) {
      throw new Error('Image uploads are disabled by the server admin')
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      throw new Error(`Image is too large (max ${maxSizeMb} MB)`)
    }

    setUploading(true)
    try {
      const { file: resized, width, height } = await resizeImageFile(file, AVATAR_DIMENSION)
      const path = `${userId}/profile/${crypto.randomUUID()}.jpg`

      const form = new FormData()
      form.append('path', path)
      form.append('scope', 'profile')
      form.append('file', resized)
      form.append('width', String(width))
      form.append('height', String(height))

      const { data, error: fnError } = await supabase.functions.invoke('upload-image', { body: form })
      if (fnError) throw new Error('Image upload failed. Please try again.')
      if (data?.status !== 'stored') throw new Error('Image upload failed. Please try again.')

      const { error: updateError } = await updateAvatarUrl(userId, path)
      if (updateError) throw updateError

      onUpdated?.()
      return path
    } finally {
      setUploading(false)
    }
  }, [maxSizeMb, onUpdated, uploadEnabled, userId])

  return { uploadEnabled, settingsLoading, uploading, uploadAvatar }
}
