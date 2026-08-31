import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/useAuth'
import { hashPasswordWithSalt, hashPasswordLegacy } from '../../lib/crypto'
import { toError } from '../../lib/errors'
import { getSystemAttributes, clampModifier, isValidModifierInput, getModifierLimits, getModifierSectionCopy } from '../../game-systems'
import { ModifierInput } from '../../components/ModifierInput'

interface JoinChannelPreview {
  id: string
  name: string
  game_system: string
  has_password: boolean
}

export function JoinChannel() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const inviteCode = searchParams.get('code')
  
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  
  const [channel, setChannel] = useState<JoinChannelPreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const [characterName, setCharacterName] = useState(profile?.display_name || '')
  const [attributes, setAttributes] = useState<Record<string, string>>({})
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    async function fetchChannel() {
      if (!id) return
      try {
        const { data, error } = await supabase.rpc('get_join_channel_preview', { p_channel_id: id })
        if (error) throw error
        const preview = Array.isArray(data) && data.length > 0 ? data[0] : null
        setChannel(preview)
      } catch (err) {
        console.error('Error fetching channel to join:', err)
        if (!inviteCode) {
          setError('Channel not found.')
        }
      } finally {
        setLoading(false)
      }
    }
    fetchChannel()
  }, [id])

  const derivePasswordHash = async (password: string, channelId: string): Promise<string> => {
    const { data: salt, error: saltError } = await supabase.rpc('get_channel_salt', { p_channel_id: channelId })
    if (saltError) throw saltError
    if (typeof salt === 'string' && salt) return hashPasswordWithSalt(password, salt)
    // Legacy pre-salt channel (stored SHA-256 hash): keep verifying via SHA-256.
    return hashPasswordLegacy(password)
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!id || !user) return
    
    setIsSubmitting(true)
    setError(null)
    
    try {
      const passwordHash = password ? await derivePasswordHash(password, id) : undefined

      // Character attributes ride in the join itself: the member row,
      // attributes (clamped to the game system's bounds), and the join system
      // message all commit atomically.
      const numericAttributes: Record<string, number> = {}
      for (const attr of systemAttributes) {
        const raw = attributes[attr] ?? '0'
        const num = /^-?\d+$/.test(raw) ? parseInt(raw, 10) : 0
        // ponytail: silent clamp kept as backstop only — UI blocks save on out-of-range
        numericAttributes[attr] = clampModifier(channel?.game_system, num)
      }

      const { data, error: rpcError } = await supabase.rpc('join_channel', {
        p_channel_id: id,
        p_character_name: characterName,
        p_password_hash: passwordHash,
        p_invite_code: inviteCode || undefined,
        p_character_attributes: numericAttributes
      })

      if (rpcError) throw rpcError

      const result = data as { success: boolean; error?: string } | null;
      if (result && !result.success) {
        throw new Error(result.error || 'Failed to join channel.')
      }

      navigate(`/channel/${id}`)
    } catch (err) {
      console.error('Error joining channel:', err)
      setError(toError(err).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAttributeChange = (attr: string, value: string) => {
    if (!isValidModifierInput(value)) return
    setAttributes((prev: Record<string, string>) => ({
      ...prev,
      [attr]: value
    }))
  }

  const systemAttributes = getSystemAttributes(channel?.game_system)
  const modifierLimits = getModifierLimits(channel?.game_system)
  const sectionCopy = getModifierSectionCopy(channel?.game_system)

  // Out-of-range input blocks join and flags the field/subtitle in red.
  const isOutOfRange = (value: string) => {
    if (!/^-?\d+$/.test(value)) return false
    const num = parseInt(value, 10)
    return num < modifierLimits.min || num > modifierLimits.max
  }
  const hasInvalidInput = systemAttributes.some(attr => isOutOfRange(attributes[attr] ?? '0'))

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-500"></div>
      </div>
    )
  }

  if (!channel && !inviteCode) {
    return (
      <div className="max-w-md mx-auto mt-12 p-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm text-center">
        <h2 className="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">Channel Not Found</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 font-medium"
        >
          Return to Lobby
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto mt-12 px-4 sm:px-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Join Channel</h2>
          {channel?.name && (
            <p className="text-indigo-600 dark:text-indigo-400 font-medium mt-2 text-lg">{channel.name}</p>
          )}
        </div>
        
        <form onSubmit={handleJoin} className="space-y-6">
          <div>
            <label htmlFor="characterName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Character Name
            </label>
            <input
              type="text"
              id="characterName"
              required
              maxLength={20}
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              className="bg-white dark:bg-gray-800 mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
              placeholder="Who will you play as?"
            />
          </div>

          {systemAttributes.length > 0 && (
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{sectionCopy.title ?? 'Attributes (Modifiers) - Optional'}</h4>
              <p className={`text-xs mb-3 ${hasInvalidInput ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{sectionCopy.subTitle}</p>
              <div className="grid grid-cols-3 gap-4">
                {systemAttributes.map(attr => (
                  <div key={attr}>
                    <label htmlFor={attr} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{attr}</label>
                    <ModifierInput
                      attr={attr}
                      value={attributes[attr] ?? '0'}
                      onChange={(value) => handleAttributeChange(attr, value)}
                      min={modifierLimits.min}
                      max={modifierLimits.max}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {channel?.has_password && !inviteCode && (
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Channel Password
              </label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-white dark:bg-gray-800 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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
            </div>
          )}
          
          {inviteCode && (
            <div className="bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300 p-3 rounded-md text-sm text-center">
              You are joining with a valid invite link.
            </div>
          )}

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 p-3 rounded-md">
              {error}
            </div>
          )}

          <div className="flex flex-col space-y-3 pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !characterName.trim() || hasInvalidInput || (!!channel?.has_password && !inviteCode && !password)}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Joining...' : 'Join Campaign'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
