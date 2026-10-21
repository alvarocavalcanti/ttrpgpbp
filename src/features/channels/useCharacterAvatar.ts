import { useCallback } from 'react'
import { useImageUpload } from '../../hooks/useImageUpload'
import { useCharacter } from './useCharacter'

const PORTRAIT_DIMENSION = 512

export interface CharacterAvatarApi {
  uploadEnabled: boolean
  settingsLoading: boolean
  uploading: boolean
  uploadPortrait: (file: File) => Promise<string | null>
  removePortrait: () => Promise<void>
}

/**
 * Per-channel character portrait (#743): the image goes into the channel's
 * private 'images' bucket under `{channelId}/character/`, then the bare
 * object path is stored on the member's own channel_members row. The admin
 * switch, the size cap, the image-type check and the client-side resize come
 * from useImageUpload; the server re-checks them and only accepts the upload
 * from a member of that channel.
 *
 * The write is immediate (not staged behind the character form save), so the
 * roster and the messages show the new portrait without a reload. Removing
 * the portrait clears the column; the old storage object is left behind, the
 * same accepted debt as profile pictures.
 */
export function useCharacterAvatar(
  channelId: string | undefined,
  memberId: string | undefined,
  onUpdated?: () => void
): CharacterAvatarApi {
  const { uploadEnabled, settingsLoading, uploading, uploadImage } = useImageUpload(channelId)
  const { updateCharacterAvatar } = useCharacter()

  /**
   * Uploads one portrait and stores its path on the member's row. Throws the
   * client-side validation message (wrong type, too large, uploads off) as
   * it is; a failed write is reported with a generic message, never with the
   * database error (that would leak table and policy internals to a player).
   */
  const uploadPortrait = useCallback(async (file: File): Promise<string | null> => {
    if (!channelId || !memberId) return null
    const path = await uploadImage(file, 'character', PORTRAIT_DIMENSION)
    if (!path) throw new Error('Image upload failed. Please try again.')
    const error = await updateCharacterAvatar(memberId, path)
    if (error) {
      console.error('Failed to save the character portrait:', error)
      throw new Error('Could not save the portrait. Please try again.')
    }
    onUpdated?.()
    return path
  }, [channelId, memberId, onUpdated, updateCharacterAvatar, uploadImage])

  /** Clears the portrait from the member's row. */
  const removePortrait = useCallback(async (): Promise<void> => {
    if (!memberId) return
    const error = await updateCharacterAvatar(memberId, null)
    if (error) {
      console.error('Failed to remove the character portrait:', error)
      throw new Error('Could not remove the portrait. Please try again.')
    }
    onUpdated?.()
  }, [memberId, onUpdated, updateCharacterAvatar])

  return { uploadEnabled, settingsLoading, uploading, uploadPortrait, removePortrait }
}
