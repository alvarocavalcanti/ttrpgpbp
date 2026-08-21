import { Avatar } from '../../components/Avatar';
import { useState } from 'react'
import type { Database } from '../../types/database'
import { useChannelNpcs } from './useChannelNpcs'
import { IconPicker } from '../chat/IconPicker'
import { randomNpcIconUrl } from '../chat/npcIcons'
import { useImageUpload } from '../../hooks/useImageUpload'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useToast } from '../../contexts/ToastContext'
import { MAX_NPC_NAME_LENGTH } from '../../constants'

type Npc = Database['public']['Tables']['channel_npcs']['Row']

interface NpcManagementModalProps {
  channelId: string
  onClose: () => void
  onUpdate: () => void
}

// GM-only roster management: rename, re-picture, delete, or add NPCs.
// RLS already restricts channel_npcs writes to the channel GM.
export function NpcManagementModal({ channelId, onClose, onUpdate }: NpcManagementModalProps) {
  useEscapeToClose(onClose)
  const { addToast } = useToast()
  const { npcs, loading, createNpc, renameNpc, repictureNpc, deleteNpc } = useChannelNpcs(channelId)
  const { uploadEnabled, settingsLoading, uploading, uploadImage } = useImageUpload(channelId)

  const [newName, setNewName] = useState('')
  const [newAvatar, setNewAvatar] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [pickingForId, setPickingForId] = useState<string | 'new' | null>(null)

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) {
      addToast('Enter a name for the NPC.', 'error')
      return
    }
    const ok = await createNpc(name, newAvatar || randomNpcIconUrl())
    if (ok) {
      addToast(`NPC ${name} created.`, 'success')
      setNewName('')
      setNewAvatar(null)
      onUpdate()
    } else {
      addToast('Failed to create NPC.', 'error')
    }
  }

  const handleRename = async () => {
    if (!editingId) return
    const name = editName.trim()
    if (!name) {
      addToast('Enter a name for the NPC.', 'error')
      return
    }
    const ok = await renameNpc(editingId, name)
    if (ok) {
      addToast(`NPC renamed to ${name}.`, 'success')
      onUpdate()
    } else {
      addToast('Failed to rename NPC.', 'error')
    }
    setEditingId(null)
  }

  const handleDelete = async (npc: Npc) => {
    if (!confirm(`Delete NPC "${npc.name}"? Past messages keep their name/portrait.`)) return
    const ok = await deleteNpc(npc.id)
    if (ok) {
      addToast(`NPC ${npc.name} deleted.`, 'success')
      onUpdate()
    } else {
      addToast('Failed to delete NPC.', 'error')
    }
  }

  const handleRepicture = async (id: string, avatarUrl: string) => {
    const ok = await repictureNpc(id, avatarUrl)
    if (ok) onUpdate()
    else addToast('Failed to update portrait.', 'error')
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, id: string | 'new') => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const publicUrl = await uploadImage(file, 'npc')
      if (!publicUrl) return
      if (id === 'new') {
        setNewAvatar(publicUrl)
      } else {
        await handleRepicture(id, publicUrl)
      }
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to upload image.', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-600 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80">
      <div className="fixed inset-0" aria-hidden="true" onClick={onClose}></div>
      <div
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-label="Manage NPCs"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">NPCs</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 p-1"
            aria-label="Close NPC management"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="animate-pulse space-y-4 py-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        ) : (
          <>
            {npcs.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                No NPCs yet. Create one below, or speak as a new NPC from the composer.
              </p>
            ) : (
              <ul className="space-y-2 mb-4">
                {npcs.map(npc => (
                  <li key={npc.id} className="flex items-center space-x-3 p-2 rounded-md bg-gray-50 dark:bg-gray-900">
                    {npc.avatar_url ? (
                      <Avatar className="h-10 w-10 rounded-full flex-shrink-0" src={npc.avatar_url} alt="" referrerPolicy="no-referrer" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-[#e6d0a4] dark:bg-[#4a4238] flex items-center justify-center text-[#5c4a3d] dark:text-[#d8cfc0] font-serif flex-shrink-0">
                        {npc.name[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                    {editingId === npc.id ? (
                      <div className="flex-1 min-w-0 flex items-center space-x-2">
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={MAX_NPC_NAME_LENGTH}
                          aria-label="NPC name"
                          className="flex-1 min-w-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded-md text-sm py-1.5 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                          autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingId(null) }}
                        />
                        <button type="button" onClick={handleRename} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium shrink-0">
                          Save
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{npc.name}</p>
                      </div>
                    )}
                    <div className="flex items-center space-x-1 flex-shrink-0">
                      {editingId === npc.id ? (
                        <button type="button" onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400" aria-label="Cancel rename">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setEditingId(npc.id); setEditName(npc.name) }}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                          aria-label={`Rename ${npc.name}`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPickingForId(npc.id)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                        aria-label={`Choose portrait for ${npc.name}`}
                        title="Choose portrait"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRepicture(npc.id, randomNpcIconUrl())}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                        aria-label={`Randomize portrait for ${npc.name}`}
                        title="Random portrait"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      </button>
                      <label className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer disabled:opacity-50" title="Upload portrait">
                        <input
                          type="file"
                          accept="image/*"
                          aria-label={`Upload portrait for ${npc.name}`}
                          disabled={uploading || !uploadEnabled || settingsLoading}
                          onChange={(e) => handleUpload(e, npc.id)}
                          className="hidden"
                        />
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleDelete(npc)}
                        className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                        aria-label={`Delete ${npc.name}`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider mb-2">Add NPC</h4>
              <div className="flex items-center gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="NPC name"
                  aria-label="New NPC name"
                  maxLength={MAX_NPC_NAME_LENGTH}
                  className="flex-1 min-w-0 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 rounded-md text-sm py-1.5 px-3 focus:ring-indigo-500 focus:border-indigo-500"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAdd() }}
                />
                {newAvatar ? (
                  <Avatar className="h-8 w-8 rounded-full flex-shrink-0" src={newAvatar} alt="New NPC portrait preview" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 flex-shrink-0">
                    <span className="text-xs font-medium">?</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPickingForId('new')}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                  aria-label="Choose portrait for new NPC"
                  title="Choose portrait"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => setNewAvatar(randomNpcIconUrl())}
                  className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                  aria-label="Randomize new NPC portrait"
                  title="Random portrait"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                </button>
                <label className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer disabled:opacity-50" title="Upload portrait">
                  <input
                    type="file"
                    accept="image/*"
                    aria-label="Upload new NPC portrait"
                    disabled={uploading || !uploadEnabled || settingsLoading}
                    onChange={(e) => handleUpload(e, 'new')}
                    className="hidden"
                  />
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </label>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="shrink-0 inline-flex items-center justify-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                >
                  Add
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {pickingForId && (
        <IconPicker
          onPick={(url) => {
            if (pickingForId === 'new') {
              setNewAvatar(url)
            } else {
              void handleRepicture(pickingForId, url)
            }
            setPickingForId(null)
          }}
          onClose={() => setPickingForId(null)}
        />
      )}
    </div>
  )
}
