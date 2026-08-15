import { useCallback, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resizeImageFile } from '../lib/imageResize'
import { useAppSetting } from './useAppSetting'

const DEFAULT_MAX_SIZE_MB = 5

export interface ImageUploadApi {
  uploadEnabled: boolean
  settingsLoading: boolean
  uploading: boolean
  uploadImage: (file: File, folder: string, maxDimension?: number) => Promise<string | null>
}

// Uploads an image into a folder of the channel's public 'images' bucket:
// client-side resize, then return the public URL. Gated by the admin's
// image_uploading_enabled setting (off by default) and image_max_size_mb;
// storage RLS still enforces GM-only writes on the object path's first
// segment (the channel id).
export function useImageUpload(channelId: string | undefined): ImageUploadApi {
  const { value: uploadEnabled, loading: settingsLoading } = useAppSetting<boolean>('image_uploading_enabled', false)
  const { value: maxSizeMb } = useAppSetting<number>('image_max_size_mb', DEFAULT_MAX_SIZE_MB)
  const [uploading, setUploading] = useState(false)

  const uploadImage = useCallback(async (file: File, folder: string, maxDimension?: number): Promise<string | null> => {
    if (!channelId) return null
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
      const resized = await resizeImageFile(file, maxDimension)
      const path = `${channelId}/${folder}/${crypto.randomUUID()}.jpg`
      const { error: uploadError } = await supabase.storage.from('images').upload(path, resized, {
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(path)
      return publicUrl
    } finally {
      setUploading(false)
    }
  }, [channelId, uploadEnabled, maxSizeMb])

  return { uploadEnabled, settingsLoading, uploading, uploadImage }
}
