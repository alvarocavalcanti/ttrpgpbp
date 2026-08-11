import { useChannelNotificationPrefs } from './useChannelNotificationPrefs'
import { usePushNotifications } from '../auth/usePushNotifications'

interface ChannelNotificationSettingsModalProps {
  channelId: string
  myMemberId: string | undefined
  onClose: () => void
}

const TOGGLES = [
  { key: 'notify_all_messages', label: 'All new messages', description: 'Notify me for every new message in this channel.' },
  { key: 'notify_gm_messages', label: 'GM messages', description: 'Notify me for messages sent by the Game Master.' },
  { key: 'notify_turn', label: "It's my turn", description: 'Notify me when I become the active player.' }
] as const

export function ChannelNotificationSettingsModal({ channelId, myMemberId, onClose }: ChannelNotificationSettingsModalProps) {
  const { prefs, loading, saving, error, updatePrefs } = useChannelNotificationPrefs(channelId, myMemberId)
  const { isSupported, isConfigured, needsInstall } = usePushNotifications()
  const pushUnavailable = !isConfigured || !isSupported || needsInstall

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-75" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Channel notification settings"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Close notification settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {error ? (
          <div className="py-4" role="alert">
            <p className="text-sm text-red-700">Failed to load notification settings. Close and reopen to try again.</p>
          </div>
        ) : loading ? (
          <div className="animate-pulse space-y-4 py-1">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {pushUnavailable && (
              <p className="text-sm text-amber-700" role="status">
                Push notifications are not available on this device. These settings require push to be enabled.
              </p>
            )}
            {TOGGLES.map(({ key, label, description }) => (
              <div key={key} className="flex items-start">
                <div className="flex h-5 items-center">
                  <input
                    id={key}
                    type="checkbox"
                    checked={prefs[key]}
                    disabled={saving || pushUnavailable}
                    onChange={(e) => updatePrefs({ [key]: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor={key} className={`font-medium ${pushUnavailable ? 'text-gray-400' : 'text-gray-700'}`}>{label}</label>
                  <p className={`${pushUnavailable ? 'text-gray-400' : 'text-gray-500'}`}>{description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
