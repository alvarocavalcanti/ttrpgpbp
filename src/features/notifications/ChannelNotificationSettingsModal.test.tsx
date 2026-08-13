import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChannelNotificationSettingsModal } from './ChannelNotificationSettingsModal'
import { useChannelNotificationPrefs } from './useChannelNotificationPrefs'
import { usePushNotifications } from '../auth/usePushNotifications'

vi.mock('./useChannelNotificationPrefs', () => ({
  useChannelNotificationPrefs: vi.fn()
}))

vi.mock('../auth/usePushNotifications', () => ({
  usePushNotifications: vi.fn()
}))

describe('ChannelNotificationSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useChannelNotificationPrefs).mockReturnValue({
      prefs: { notify_all_messages: true, notify_gm_messages: true, notify_turn: true },
      loading: false,
      saving: false,
      updatePrefs: vi.fn().mockResolvedValue(undefined)
    } as any)
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: true, needsInstall: false
    } as any)
  })

  it('renders toggles', () => {
    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={vi.fn()} />)

    expect(screen.getByLabelText('All new messages')).toBeInTheDocument()
    expect(screen.getByLabelText('GM messages')).toBeInTheDocument()
    expect(screen.getByLabelText("It's my turn")).toBeInTheDocument()
  })

  it('shows loading state', () => {
    vi.mocked(useChannelNotificationPrefs).mockReturnValue({
      prefs: { notify_all_messages: true, notify_gm_messages: true, notify_turn: true },
      loading: true,
      saving: false,
      updatePrefs: vi.fn()
    } as any)

    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={vi.fn()} />)
    expect(screen.queryByLabelText('All new messages')).not.toBeInTheDocument()
  })

  it('shows an error instead of toggles when prefs fail to load', () => {
    vi.mocked(useChannelNotificationPrefs).mockReturnValue({
      prefs: { notify_all_messages: true, notify_gm_messages: true, notify_turn: true },
      loading: false,
      saving: false,
      error: new Error('DB down'),
      updatePrefs: vi.fn()
    } as any)

    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Failed to load notification settings/)
    expect(screen.queryByLabelText('All new messages')).not.toBeInTheDocument()
  })

  it('saves pref changes on toggle', () => {
    const updatePrefs = vi.fn().mockResolvedValue(undefined)
    vi.mocked(useChannelNotificationPrefs).mockReturnValue({
      prefs: { notify_all_messages: true, notify_gm_messages: true, notify_turn: true },
      loading: false,
      saving: false,
      updatePrefs
    } as any)

    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('All new messages'))

    expect(updatePrefs).toHaveBeenCalledWith({ notify_all_messages: false })
  })

  it('closes on backdrop click', () => {
    const onClose = vi.fn()
    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.previousElementSibling!)
    expect(onClose).toHaveBeenCalled()
  })

  it('closes on close button', () => {
    const onClose = vi.fn()
    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('Close notification settings'))
    expect(onClose).toHaveBeenCalled()
  })

  it('disables toggles and shows notice when push is unavailable', () => {
    vi.mocked(usePushNotifications).mockReturnValue({
      isConfigured: true, isSupported: false, needsInstall: true
    } as any)

    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent(/not available on this device/)
    expect(screen.getByLabelText('All new messages')).toBeDisabled()
    expect(screen.getByLabelText('GM messages')).toBeDisabled()
    expect(screen.getByLabelText("It's my turn")).toBeDisabled()
  })

  it('keeps toggles enabled when push is supported', () => {
    render(<ChannelNotificationSettingsModal channelId="c1" myMemberId="m1" onClose={vi.fn()} />)

    expect(screen.getByLabelText('All new messages')).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
