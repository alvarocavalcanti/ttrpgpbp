import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useCharacter } from './useCharacter'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

const fields = {
  character_name: 'Aria',
  character_sheet_url: null,
  character_notes: 'Scarred',
  attributes: { str: 3 }
}

describe('useCharacter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates the channel_members row fields', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useCharacter().updateCharacter('m1', fields)).resolves.toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('channel_members')
    expect(update).toHaveBeenCalledWith(fields)
    expect(eq).toHaveBeenCalledWith('id', 'm1')
  })

  it('passes the fields object straight through untouched', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await useCharacter().updateCharacter('m1', fields)
    expect(update).toHaveBeenCalledWith({
      character_name: 'Aria',
      character_sheet_url: null,
      character_notes: 'Scarred',
      attributes: { str: 3 }
    })
  })

  it('returns the update error so the caller keeps its throw flow', async () => {
    const updateError = new Error('update failed')
    const eq = vi.fn().mockResolvedValue({ error: updateError })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useCharacter().updateCharacter('m1', fields)).resolves.toBe(updateError)
  })

  it('writes the portrait on its own row without touching the other character fields', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useCharacter().updateCharacterAvatar('m1', 'chan/character/a.jpg')).resolves.toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('channel_members')
    expect(update).toHaveBeenCalledWith({ character_avatar_url: 'chan/character/a.jpg' })
    expect(eq).toHaveBeenCalledWith('id', 'm1')
  })

  it('clears the portrait when the url is null', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await useCharacter().updateCharacterAvatar('m1', null)
    expect(update).toHaveBeenCalledWith({ character_avatar_url: null })
  })

  it('returns the avatar update error so the caller keeps its throw flow', async () => {
    const updateError = new Error('update failed')
    const eq = vi.fn().mockResolvedValue({ error: updateError })
    const update = vi.fn().mockReturnValue({ eq })
    vi.mocked(supabase.from).mockReturnValue({ update } as any)

    await expect(useCharacter().updateCharacterAvatar('m1', 'chan/character/a.jpg')).resolves.toBe(updateError)
  })
})
