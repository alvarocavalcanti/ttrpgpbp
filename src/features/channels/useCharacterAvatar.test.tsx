import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCharacterAvatar } from './useCharacterAvatar'
import { useImageUpload } from '../../hooks/useImageUpload'
import { useCharacter } from './useCharacter'

vi.mock('../../hooks/useImageUpload', () => ({
  useImageUpload: vi.fn(),
}))

vi.mock('./useCharacter', () => ({
  useCharacter: vi.fn(),
}))

const CHANNEL = '11111111-2222-3333-4444-555555555555'
const MEMBER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const makeFile = (type = 'image/png') => new File([new Uint8Array(10)], 'portrait.png', { type })

describe('useCharacterAvatar', () => {
  const uploadImage = vi.fn()
  const updateCharacter = vi.fn()
  const updateCharacterAvatar = vi.fn()
  const onUpdated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    uploadImage.mockResolvedValue(`${CHANNEL}/character/a.jpg`)
    updateCharacterAvatar.mockResolvedValue(null)
    vi.mocked(useImageUpload).mockReturnValue({
      uploadEnabled: true,
      settingsLoading: false,
      uploading: false,
      uploadImage,
    } as any)
    vi.mocked(useCharacter).mockReturnValue({ updateCharacter, updateCharacterAvatar } as any)
  })

  it('uploads into the character folder and stores the path on the member row', async () => {
    const { result } = renderHook(() => useCharacterAvatar(CHANNEL, MEMBER, onUpdated))
    const file = makeFile()

    const path = await result.current.uploadPortrait(file)

    expect(uploadImage).toHaveBeenCalledWith(file, 'character', 512)
    expect(updateCharacterAvatar).toHaveBeenCalledWith(MEMBER, path)
    expect(onUpdated).toHaveBeenCalled()
  })

  it('clears the portrait on the member row', async () => {
    const { result } = renderHook(() => useCharacterAvatar(CHANNEL, MEMBER, onUpdated))

    await result.current.removePortrait()

    expect(updateCharacterAvatar).toHaveBeenCalledWith(MEMBER, null)
    expect(uploadImage).not.toHaveBeenCalled()
    expect(onUpdated).toHaveBeenCalled()
  })

  it('does nothing without a channel or a member', async () => {
    const { result } = renderHook(() => useCharacterAvatar(undefined, MEMBER))
    await expect(result.current.uploadPortrait(makeFile())).resolves.toBeNull()
    expect(uploadImage).not.toHaveBeenCalled()

    const { result: noMember } = renderHook(() => useCharacterAvatar(CHANNEL, undefined))
    await expect(noMember.current.uploadPortrait(makeFile())).resolves.toBeNull()
    await expect(noMember.current.removePortrait()).resolves.toBeUndefined()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(updateCharacterAvatar).not.toHaveBeenCalled()
  })

  it('throws when the upload returns no path', async () => {
    uploadImage.mockResolvedValue(null)
    const { result } = renderHook(() => useCharacterAvatar(CHANNEL, MEMBER, onUpdated))

    await expect(result.current.uploadPortrait(makeFile())).rejects.toThrow('Image upload failed. Please try again.')
    expect(updateCharacterAvatar).not.toHaveBeenCalled()
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('reports a failed write with a player-safe message, never the database error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    updateCharacterAvatar.mockResolvedValue(new Error('Database down'))
    const { result } = renderHook(() => useCharacterAvatar(CHANNEL, MEMBER, onUpdated))

    await expect(result.current.uploadPortrait(makeFile())).rejects.toThrow('Could not save the portrait. Please try again.')
    // The raw error must never reach the player-facing copy.
    await expect(result.current.uploadPortrait(makeFile())).rejects.not.toThrow('Database down')
    expect(onUpdated).not.toHaveBeenCalled()
  })

  it('propagates a removal failure with a player-safe message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    updateCharacterAvatar.mockResolvedValue(new Error('Database down'))
    const { result } = renderHook(() => useCharacterAvatar(CHANNEL, MEMBER, onUpdated))

    await expect(result.current.removePortrait()).rejects.toThrow('Could not remove the portrait. Please try again.')
    expect(onUpdated).not.toHaveBeenCalled()
  })
})
