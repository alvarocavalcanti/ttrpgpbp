import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/BottomSheet'
import { Avatar } from '../../components/Avatar'
import { TextPromptSheet } from '../../components/TextPromptSheet'
import { MAX_ADMIN_SUSPEND_REASON_LENGTH } from '../../constants'
import type { AdminUser, AdminAuditEntry } from './useAdminData'

interface UserDetailModalProps {
  user: AdminUser
  onClose: () => void
  // Resolves to true on success; shows a toast and updates the list in place.
  onSuspend: (targetUser: AdminUser, reason: string) => Promise<boolean>
  getUserHistory: (userId: string) => Promise<AdminAuditEntry[] | string>
}

function formatDate(value: string | null): string {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

// Detail view for a single user opened from the admin Users table (issue
// #460): surfaces email + verification, provider, role/status flags, login &
// activity, channel memberships, moderation history, and the suspend action.
export function UserDetailModal({ user, onClose, onSuspend, getUserHistory }: UserDetailModalProps) {
  const [history, setHistory] = useState<AdminAuditEntry[]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showSuspendSheet, setShowSuspendSheet] = useState(false)

  useEffect(() => {
    let mounted = true
    // Reset stale state when a different user opens while this modal is still
    // mounted, so the previous user's history/error never flashes.
    setHistory([])
    setHistoryError(null)
    setHistoryLoading(true)
    getUserHistory(user.id)
      .then(result => {
        if (!mounted) return
        if (typeof result === 'string') {
          setHistoryError(result)
        } else {
          setHistory(result)
        }
        setHistoryLoading(false)
      })
      .catch(() => {
        if (!mounted) return
        setHistoryError('Failed to load audit history.')
        setHistoryLoading(false)
      })
    return () => { mounted = false }
  }, [user.id, getUserHistory])

  const blockedChannelCount = user.channels.filter(c => c.is_blocked).length
  const name = user.display_name?.trim() || user.email?.trim() || 'Unknown user'

  const handleConfirmSuspend = async (reason: string) => {
    const ok = await onSuspend(user, reason)
    if (ok) setShowSuspendSheet(false)
  }

  return (
    <BottomSheet title={name} onClose={onClose}>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar
            src={user.avatar_url ?? undefined}
            alt={name}
            className="h-12 w-12 rounded-full"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">{name}</p>
            <p className="text-xs text-surface-500 dark:text-surface-400">
              {user.email ?? 'No email on file'}
              {user.email_verified ? ' · verified' : ' · unverified'}
              {user.provider ? ` · ${user.provider}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.is_suspended && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">Suspended</span>
          )}
          {user.server_admin && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 dark:bg-primary-900 text-primary-800 dark:text-primary-200">Admin</span>
          )}
          {blockedChannelCount > 0 && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
              Blocked from {blockedChannelCount} channel{blockedChannelCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-surface-500 dark:text-surface-400">Last login</dt>
            <dd className="text-sm text-surface-900 dark:text-surface-100">{formatDate(user.last_login_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-surface-500 dark:text-surface-400">Last activity</dt>
            <dd className="text-sm text-surface-900 dark:text-surface-100">{formatDate(user.last_message_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-surface-500 dark:text-surface-400">Joined</dt>
            <dd className="text-sm text-surface-900 dark:text-surface-100">{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs text-surface-500 dark:text-surface-400">Messages sent</dt>
            <dd className="text-sm text-surface-900 dark:text-surface-100">{user.message_count}</dd>
          </div>
        </dl>

        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">Channels ({user.channels.length})</h4>
          {user.channels.length === 0 ? (
            <p className="text-sm text-surface-500 dark:text-surface-400">Not in any channels.</p>
          ) : (
            <ul className="space-y-1">
              {user.channels.map(c => (
                <li key={`${c.name}-${c.character_name}`} className="text-sm text-surface-900 dark:text-surface-100 flex items-center gap-2">
                  <span className="truncate">
                    {c.name}
                    {c.character_name ? ` — ${c.character_name}` : ''}
                  </span>
                  {c.is_blocked && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200 shrink-0">Blocked</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-surface-500 dark:text-surface-400 mb-2">History</h4>
          {historyLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600 dark:border-primary-500"></div>
            </div>
          ) : historyError ? (
            <p className="text-sm text-red-600 dark:text-red-400">{historyError}</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-surface-500 dark:text-surface-400">No moderation history.</p>
          ) : (
            <ul className="space-y-2">
              {history.map(h => (
                <li key={h.id} className="text-sm">
                  <span className="text-surface-900 dark:text-surface-100">
                    {h.action === 'suspend_user' ? 'Suspended' : 'Unsuspended'}
                  </span>
                  {h.admin_name ? <span className="text-surface-500 dark:text-surface-400"> by {h.admin_name}</span> : null}
                  <span className="text-surface-500 dark:text-surface-400"> · {formatDate(h.created_at)}</span>
                  {h.reason ? <span className="block text-surface-500 dark:text-surface-400">{h.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowSuspendSheet(true)}
            className={`px-4 py-2 border rounded-md text-sm font-medium ${
              user.is_suspended
                ? 'border-surface-300 text-surface-700 bg-white hover:bg-surface-50 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-600 dark:hover:bg-surface-700'
                : 'border-transparent text-white bg-red-600 hover:bg-red-700 focus:ring-red-500'
            } focus:outline-none focus:ring-2 focus:ring-offset-2`}
          >
            {user.is_suspended ? 'Unsuspend' : 'Suspend'}
          </button>
        </div>
      </div>

      {showSuspendSheet && (
        <TextPromptSheet
          title={`${user.is_suspended ? 'Unsuspend' : 'Suspend'} ${name}?`}
          label="Reason"
          placeholder="Reason (optional)"
          maxLength={MAX_ADMIN_SUSPEND_REASON_LENGTH}
          confirmLabel={user.is_suspended ? 'Unsuspend' : 'Suspend'}
          onConfirm={(reason) => { void handleConfirmSuspend(reason) }}
          onClose={() => setShowSuspendSheet(false)}
        />
      )}
    </BottomSheet>
  )
}
