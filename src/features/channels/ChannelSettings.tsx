import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { hashPassword } from '../../lib/crypto'
import { GAME_SYSTEM_OPTIONS } from '../../game-systems'
import { useToast } from '../../contexts/ToastContext'
import { useSafetyTools } from './useSafetyTools'
import { useChannelAvatar } from './useChannelAvatar'
import { useImageUpload } from '../../hooks/useImageUpload'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'

type Channel = Database['public']['Tables']['channels']['Row']

interface ChannelSettingsProps {
  channel: Channel
  gmOnlyResourcesUrl?: string | null
  onClose: () => void
  onUpdate: () => void
}

export function ChannelSettings({ channel, gmOnlyResourcesUrl: gmOnlyResourcesUrlProp = null, onClose, onUpdate }: ChannelSettingsProps) {
  useEscapeToClose(onClose)
  const navigate = useNavigate()
  const { addToast } = useToast()
  const [name, setName] = useState(channel.name)
  const [gameSystem, setGameSystem] = useState(channel.game_system || 'none')
  const [mapUrl, setMapUrl] = useState(channel.map_url || '')
  const [resourcesUrl, setResourcesUrl] = useState(channel.resources_url || '')
  const [gmOnlyResourcesUrl, setGmOnlyResourcesUrl] = useState(gmOnlyResourcesUrlProp || '')
  const [safetyToolsUrl, setSafetyToolsUrl] = useState(channel.safety_tools_url || '')
  const [showSafetyTools, setShowSafetyTools] = useState(false)
  const { safetyTools, saveSafetyTools } = useSafetyTools(channel.id, showSafetyTools)
  const [safetyLines, setSafetyLines] = useState('')
  const [safetyVeils, setSafetyVeils] = useState('')

  useEffect(() => {
    if (safetyTools) {
      setSafetyLines(safetyTools.lines)
      setSafetyVeils(safetyTools.veils)
    }
  }, [safetyTools])
  
  // Changing password logic
  const [changePassword, setChangePassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [warning, setWarning] = useState<string | null>(null)

  const { uploadEnabled, settingsLoading, uploading, uploadAvatar } = useChannelAvatar(channel.id, () => {
    addToast('Channel avatar updated', 'success')
  })
  const [avatarUrl, setAvatarUrl] = useState(channel.avatar_url || '')
  const [avatarError, setAvatarError] = useState<string | null>(null)

  const { uploading: mapUploading, uploadImage } = useImageUpload(channel.id)
  const [mapError, setMapError] = useState<string | null>(null)
  const [resourcesError, setResourcesError] = useState<string | null>(null)

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setAvatarError('Please choose an image file.')
      return
    }
    setAvatarError(null)
    try {
      const publicUrl = await uploadAvatar(file)
      if (publicUrl) setAvatarUrl(publicUrl)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload avatar.')
    }
  }

  const handleMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMapError(null)
    try {
      const publicUrl = await uploadImage(file, 'map')
      if (publicUrl) setMapUrl(publicUrl)
    } catch (err) {
      setMapError(err instanceof Error ? err.message : 'Failed to upload map.')
    }
  }

  const handleResourcesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setResourcesError(null)
    try {
      const publicUrl = await uploadImage(file, 'resources')
      if (publicUrl) setResourcesUrl(publicUrl)
    } catch (err) {
      setResourcesError(err instanceof Error ? err.message : 'Failed to upload resources.')
    }
  }

  const inviteLink = `${window.location.origin}/join/${channel.id}?code=${channel.invite_code}`

  const handleCopy = async () => {
    let textArea: HTMLTextAreaElement | null = null
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteLink)
      } else {
        textArea = document.createElement("textarea")
        textArea.value = inviteLink
        textArea.style.position = "absolute"
        textArea.style.left = "-999999px"
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        // ponytail: legacy fallback for non-secure contexts, navigator.clipboard covers all modern browsers
        const success = document.execCommand('copy')
        if (!success) {
          throw new Error('execCommand returned false')
        }
      }
      addToast('Invite link copied!', 'success')
    } catch (err) {
      console.error('Failed to copy', err)
      addToast('Failed to copy invite link', 'error')
    } finally {
      if (textArea?.isConnected) {
        document.body.removeChild(textArea)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
        const updates: any = {
          name,
          game_system: gameSystem,
          map_url: mapUrl || null,
          resources_url: resourcesUrl || null,
          safety_tools_url: safetyToolsUrl || null
        }

        const { error: updateError } = await supabase
          .from('channels')
          .update(updates)
          .eq('id', channel.id)

        if (updateError) throw updateError

        // GM-only resources URL lives in channel_secrets (GM-only RLS), not on
        // the member-visible channel row. Upsert the row in case the channel
        // has no secret yet (no password set).
        const { data: secretRow, error: gmUrlUpdateError } = await supabase
          .from('channel_secrets')
          .update({ gm_only_resources_url: gmOnlyResourcesUrl || null })
          .eq('channel_id', channel.id)
          .select()

        if (gmUrlUpdateError) throw gmUrlUpdateError
        if (!secretRow || secretRow.length === 0) {
          const { error: gmUrlInsertError } = await supabase
            .from('channel_secrets')
            .insert({ channel_id: channel.id, gm_only_resources_url: gmOnlyResourcesUrl || null })
          if (gmUrlInsertError) throw gmUrlInsertError
        }

        if (showSafetyTools) {
          const saved = await saveSafetyTools(safetyLines, safetyVeils)
          if (!saved) throw new Error('Failed to save safety tools')
        }


      if (changePassword) {
        const hashedPassword = newPassword ? await hashPassword(newPassword) : null
        
        // Try to update first
        const { data: updateData, error: secretUpdateError } = await supabase
          .from('channel_secrets')
          .update({ password_hash: hashedPassword?.hash ?? null, password_salt: hashedPassword?.salt ?? null })
          .eq('channel_id', channel.id)
          .select()

        // If no row existed, we need to insert it
        if (!updateData || updateData.length === 0) {
          const { error: insertError } = await supabase
            .from('channel_secrets')
            .insert({ channel_id: channel.id, password_hash: hashedPassword?.hash ?? null, password_salt: hashedPassword?.salt ?? null })
            
          if (insertError) throw insertError
        } else if (secretUpdateError) {
           throw secretUpdateError
        }
      }
      
      addToast('Channel settings saved successfully', 'success')
      onUpdate()
      onClose()
    } catch (err: any) {
      console.error('Error updating channel:', err)
      addToast('Failed to update channel settings.', 'error')
      setIsSubmitting(false)
    }
  }

  const handleExport = async () => {
    try {
      setIsSubmitting(true)
      setWarning(null)
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*, sender:profiles!messages_sender_id_fkey(display_name)')
        .eq('channel_id', channel.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(5000)

      if (messagesError) throw messagesError

      if (messages.length === 5000) {
        setWarning('This channel has more than 5000 messages. Export may be incomplete. Batch export coming soon.')
      }

      let markdown = `# Chat Log for ${channel.name}\n\n`
      for (const msg of messages) {
        const date = new Date(msg.created_at).toLocaleString()
        const sender = msg.npc_name || (msg.sender as any)?.display_name || 'System/Unknown'
        markdown += `**[${date}] ${sender}:**\n${msg.content}\n\n`
      }

      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${channel.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_export.md`
      a.click()
      window.URL.revokeObjectURL(url)
      addToast('Chat exported successfully', 'success')
    } catch (err) {
      console.error('Failed to export:', err)
      addToast('Failed to export channel.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleArchive = async () => {
    if (!window.confirm('Are you sure you want to archive this channel? Remember to export the chat history first!')) {
      return
    }
    
    try {
      setIsSubmitting(true)
      const { error: archiveError } = await supabase
        .from('channels')
        .update({ is_archived: true })
        .eq('id', channel.id)

      if (archiveError) throw archiveError
      
      onClose()
      navigate('/')
    } catch (err) {
      console.error('Failed to archive:', err)
      addToast('Failed to archive channel.', 'error')
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed z-20 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
              Channel Settings
            </h3>
            
            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Invite Link</label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md sm:text-sm border-gray-300 bg-gray-50 text-gray-500 border"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="inline-flex items-center px-3 py-2 border border-l-0 border-gray-300 rounded-r-md bg-gray-50 text-gray-500 sm:text-sm hover:bg-gray-100"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Channel avatar"
                      referrerPolicy="no-referrer"
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-500 text-lg font-medium">
                      {(name[0] || '#').toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <label htmlFor="channelAvatar" className="block text-sm font-medium text-gray-700">Channel Avatar</label>
                  <p className="text-xs text-gray-400 mt-0.5 mb-1">Shown in the channel list and header.</p>
                  <input
                    type="file"
                    id="channelAvatar"
                    accept="image/*"
                    disabled={uploading || !uploadEnabled || settingsLoading}
                    onChange={handleAvatarChange}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 disabled:opacity-50"
                  />
                  {uploading && <p className="text-xs text-gray-500 mt-1">Uploading...</p>}
                  {!uploadEnabled && !settingsLoading && (
                    <p className="text-xs text-amber-600 mt-1">Image uploads are disabled by the server admin.</p>
                  )}
                  {avatarError && <p className="text-xs text-red-600 mt-1">{avatarError}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">Channel Name</label>
                <input
                  type="text"
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                />
              </div>

              <div>
                <label htmlFor="gameSystem" className="block text-sm font-medium text-gray-700">Game System</label>
                <select
                  id="gameSystem"
                  value={gameSystem}
                  onChange={(e) => setGameSystem(e.target.value)}
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                >
                  {GAME_SYSTEM_OPTIONS.map(sys => (
                    <option key={sys.id} value={sys.id}>{sys.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                    Channel Password
                  </label>
                  {!changePassword && (
                    <button
                      type="button"
                      onClick={() => setChangePassword(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      Change Password
                    </button>
                  )}
                </div>
                {changePassword ? (
                  <div className="relative mt-1">
                    <input
                      type={showPassword ? "text" : "password"}
                      id="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border pr-10"
                      placeholder="Leave blank to remove password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-gray-500 italic">
                    {channel.has_password ? 'Password is set (hidden)' : 'No password currently set'}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="mapUrl" className="block text-sm font-medium text-gray-700">Map URL</label>
                  <label className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer font-medium disabled:opacity-50">
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Upload map image"
                      disabled={mapUploading || !uploadEnabled || settingsLoading}
                      onChange={handleMapUpload}
                      className="hidden"
                    />
                    {mapUploading ? 'Uploading...' : 'Upload image'}
                  </label>
                </div>
                <input
                  type="url"
                  id="mapUrl"
                  value={mapUrl}
                  onChange={(e) => setMapUrl(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="https://owlbear.rodeo/..."
                />
                {mapError && <p className="text-xs text-red-600 mt-1">{mapError}</p>}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="resourcesUrl" className="block text-sm font-medium text-gray-700">Resources URL</label>
                  <label className="text-xs text-indigo-600 hover:text-indigo-800 cursor-pointer font-medium disabled:opacity-50">
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Upload resources image"
                      disabled={mapUploading || !uploadEnabled || settingsLoading}
                      onChange={handleResourcesUpload}
                      className="hidden"
                    />
                    {mapUploading ? 'Uploading...' : 'Upload image'}
                  </label>
                </div>
                <input
                  type="url"
                  id="resourcesUrl"
                  value={resourcesUrl}
                  onChange={(e) => setResourcesUrl(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="https://drive.google.com/..."
                />
                {resourcesError && <p className="text-xs text-red-600 mt-1">{resourcesError}</p>}
              </div>

                <div>
                  <label htmlFor="gmOnlyResourcesUrl" className="block text-sm font-medium text-gray-700">GM-Only Resources URL</label>
                  <input
                    type="url"
                    id="gmOnlyResourcesUrl"
                    value={gmOnlyResourcesUrl}
                    onChange={(e) => setGmOnlyResourcesUrl(e.target.value)}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                    placeholder="https://lorekeeper.app/..."
                  />
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowSafetyTools(!showSafetyTools)}
                    className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors"
                    aria-expanded={showSafetyTools}
                  >
                    Safety Tools (Lines &amp; Veils)
                    <svg
                      className={`w-4 h-4 transform transition-transform ${showSafetyTools ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showSafetyTools && (
                    <div className="mt-3 space-y-4">
                      <div>
                        <label htmlFor="safetyLines" className="block text-sm font-medium text-gray-700">Lines</label>
                        <textarea
                          id="safetyLines"
                          value={safetyLines}
                          onChange={(e) => setSafetyLines(e.target.value)}
                          rows={3}
                          placeholder="Hard limits the group agrees never to cross (one per line)."
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                        />
                      </div>
                      <div>
                        <label htmlFor="safetyVeils" className="block text-sm font-medium text-gray-700">Veils</label>
                        <textarea
                          id="safetyVeils"
                          value={safetyVeils}
                          onChange={(e) => setSafetyVeils(e.target.value)}
                          rows={3}
                          placeholder="Topics that happen off-screen when they come up (one per line)."
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                        />
                      </div>
                      <div>
                        <label htmlFor="safetyToolsUrl" className="block text-sm font-medium text-gray-700">Safety Tools URL</label>
                        <input
                          type="url"
                          id="safetyToolsUrl"
                          value={safetyToolsUrl}
                          onChange={(e) => setSafetyToolsUrl(e.target.value)}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                          placeholder="https://docs.google.com/document/d/..."
                        />
                        <p className="mt-1 text-xs text-gray-400">
                          Shown as a menu item for all players in the sidebar, like the other URL fields.
                        </p>
                      </div>
                    </div>
                  )}
                </div>


              {warning && (
                <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                  {warning}
                </div>
              )}

              <div className="mt-5 sm:mt-6 sm:grid sm:grid-cols-2 sm:gap-3 sm:grid-flow-row-dense">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim()}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:col-start-2 sm:text-sm disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:col-start-1 sm:text-sm transition-colors"
                >
                  Cancel
                </button>
              </div>
              
              <div className="mt-8 pt-6 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-900 mb-4">Advanced Actions</h4>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={isSubmitting}
                    className="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 transition-colors"
                  >
                    Export Chat to Markdown
                  </button>
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={isSubmitting}
                    className="w-full inline-flex justify-center rounded-md border border-red-300 shadow-sm px-4 py-2 bg-red-50 text-base font-medium text-red-700 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:text-sm disabled:opacity-50 transition-colors"
                  >
                    Archive Channel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
