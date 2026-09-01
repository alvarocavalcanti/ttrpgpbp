import { Avatar } from '../../components/Avatar'
import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface SelectableMember {
  id: string
  user_id: string
  character_name: string
  character_avatar_url?: string | null
  profile?: { display_name: string | null; avatar_url: string | null }
}

interface ActivePlayerModalProps {
  channelId: string
  members: SelectableMember[]
  currentActiveIds: string[]
  onClose: () => void
  onSaved: () => void
}

// GM-only standalone control: set which player(s) are active without sending a
// message. Multi-select to match the data model (is_active_player supports
// several players at once). The parent passes members already filtered to
// non-GM, non-blocked rows.
export function ActivePlayerModal({ channelId, members, currentActiveIds, onClose, onSaved }: ActivePlayerModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)
  const [selected, setSelected] = useState<string[]>(currentActiveIds)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (userId: string) => {
    setSelected(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId])
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const { error: rpcError } = await supabase.rpc('set_active_players', {
        p_channel_id: channelId,
        p_active_player_ids: selected,
      })
      if (rpcError) throw rpcError
      onSaved()
      onClose()
    } catch (err) {
      console.error('Failed to set active players:', err)
      setError('Failed to save active players.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        ref={dialogRef}
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-label="Active Player"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Active Player</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 p-1"
            aria-label="Close active player"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Choose who is up next. Active players get an &quot;It&apos;s your turn&quot; notification.
        </p>

        {members.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No other players in this channel yet.</p>
        ) : (
          <ul className="space-y-2 mb-4">
            {members.map(m => {
              const checked = selected.includes(m.user_id)
              return (
                <li key={m.id}>
                  <label className="flex items-center space-x-3 p-2 rounded-md bg-gray-50 dark:bg-gray-900 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(m.user_id)}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 rounded"
                    />
                    {m.character_avatar_url ? (
                      <Avatar className="h-8 w-8 rounded-full flex-shrink-0" src={m.character_avatar_url} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-500 dark:text-indigo-400 flex-shrink-0">
                        {(m.character_name[0] || '?').toUpperCase()}
                      </div>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{m.character_name}</span>
                      {m.profile?.display_name && (
                        <span className="block text-xs text-gray-400 dark:text-gray-500 truncate">{m.profile.display_name}</span>
                      )}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {error && (
          <div className="mb-2 p-2 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-800 flex items-center justify-between" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={handleSave}
              className="text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-200 font-medium text-xs ml-3 shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
