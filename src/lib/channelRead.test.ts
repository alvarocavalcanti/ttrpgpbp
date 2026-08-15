import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notifyChannelRead } from './channelRead'
import { supabase } from './supabase'
import { updateAppBadge } from './appBadge'

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn() },
}))

vi.mock('./appBadge', () => ({
  updateAppBadge: vi.fn(),
}))

describe('notifyChannelRead', () => {
  const postMessage = vi.fn()
  const getRegistration = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    postMessage.mockReset()
    getRegistration.mockReset()
    getRegistration.mockResolvedValue({ active: { postMessage } })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration },
    })
  })

  it('asks the service worker to close the channel notifications', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    await notifyChannelRead('c1', 'u1', true)

    expect(getRegistration).toHaveBeenCalled()
    expect(postMessage).toHaveBeenCalledWith({ type: 'CLOSE_CHANNEL_NOTIFICATIONS', channelId: 'c1' })
  })

  it('sets the badge to the remaining unread total', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: [{ channel_id: 'c2', unread_count: 3 }, { channel_id: 'c3', unread_count: 2 }],
      error: null,
    } as any)
    await notifyChannelRead('c1', 'u1', true)

    expect(supabase.rpc).toHaveBeenCalledWith('get_user_channels_unread', { p_user_id: 'u1' })
    expect(updateAppBadge).toHaveBeenCalledWith(5, true)
  })

  it('clears the badge when nothing is left unread', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    await notifyChannelRead('c1', 'u1', true)
    expect(updateAppBadge).toHaveBeenCalledWith(0, true)
  })

  it('honors the badge_enabled preference', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: [], error: null } as any)
    await notifyChannelRead('c1', 'u1', false)
    expect(updateAppBadge).toHaveBeenCalledWith(0, false)
  })

  it('still posts the close message when the unread fetch fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: new Error('down') } as any)
    await notifyChannelRead('c1', 'u1', true)
    expect(postMessage).toHaveBeenCalled()
    expect(updateAppBadge).toHaveBeenCalledWith(0, true)
  })
})
