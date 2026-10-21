import { useRef, useState } from 'react'
import type { Database } from '../../types/database'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { useCharacter } from './useCharacter'
import { useCharacterAvatar } from './useCharacterAvatar'
import { getSystemAttributes, clampModifier, isValidModifierInput, getModifierLimits, getModifierSectionCopy, sanitizeModifierValue } from '../../game-systems'
import { ModifierInput } from '../../components/ModifierInput'
import { BottomSheet } from '../../components/BottomSheet'
import { Avatar } from '../../components/Avatar'
import { MAX_URL_LENGTH } from '../../constants'

type ChannelMember = Database['public']['Tables']['channel_members']['Row'] & {
  profile?: { display_name: string | null; avatar_url: string | null } | null
}

interface EditCharacterModalProps {
  member: ChannelMember
  gameSystem: string
  onClose: () => void
  onUpdate: () => void
  // Refreshes the roster after a portrait write. Separate from onUpdate: the
  // full refetch swaps the view for a skeleton and would unmount this dialog
  // and drop the player's unsaved character edits.
  onPortraitUpdate?: () => void
  // Render as a mobile bottom sheet (composer avatar entry point) instead of
  // a centered dialog.
  asSheet?: boolean
}

export function EditCharacterModal({ member, gameSystem, onClose, onUpdate, onPortraitUpdate, asSheet = false }: EditCharacterModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)
  const { updateCharacter } = useCharacter()
  const { uploadEnabled, settingsLoading, uploading, uploadPortrait, removePortrait } =
    useCharacterAvatar(member.channel_id, member.id, onPortraitUpdate)
  const [characterName, setCharacterName] = useState(member.character_name)
  const [characterSheetUrl, setCharacterSheetUrl] = useState(member.character_sheet_url || '')
  const [characterNotes, setCharacterNotes] = useState(member.character_notes || '')
  // Portrait state lives here: the upload persists immediately (the roster
  // and the messages follow on their own), so the preview is local until the
  // parent's member row catches up.
  const [portrait, setPortrait] = useState<string | null>(member.character_avatar_url || null)
  const [portraitError, setPortraitError] = useState<string | null>(null)
  const [removingPortrait, setRemovingPortrait] = useState(false)
  const systemAttributes = getSystemAttributes(gameSystem)
  const modifierLimits = getModifierLimits(gameSystem)
  const sectionCopy = getModifierSectionCopy(gameSystem)
  const [attributeInputs, setAttributeInputs] = useState<Record<string, string>>(() => {
    const attrs = (member.attributes || {}) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const attr of systemAttributes) {
      out[attr] = sanitizeModifierValue(gameSystem, attrs[attr])
    }
    return out
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Out-of-range input blocks save and flags the field/subtitle in red.
  const isOutOfRange = (value: string) => {
    if (!/^-?\d+$/.test(value)) return false
    const num = parseInt(value, 10)
    return num < modifierLimits.min || num > modifierLimits.max
  }
  const hasInvalidInput = systemAttributes.some(attr => isOutOfRange(attributeInputs[attr] ?? ''))

  // Portrait → account picture → initial.
  const portraitSrc = portrait || member.profile?.avatar_url || ''

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // Belt-and-braces match of the DB scheme rule: an explicit scheme must be
    // http(s). Scheme-less relative paths stay allowed (legacy storage paths).
    const sheet = characterSheetUrl.trim()
    if (sheet && /^[a-z][a-z0-9+.-]*:/i.test(sheet) && !/^https?:\/\//i.test(sheet)) {
      setError('Sheet link must start with http:// or https://.')
      setIsSubmitting(false)
      return
    }

    // Persist only integers within the system's modifier bounds. Unknown
    // attribute keys are kept as-is.
    const attributes: Record<string, number> = { ...((member.attributes as Record<string, number>) || {}) }
    for (const attr of systemAttributes) {
      const raw = attributeInputs[attr]
      const num = /^-?\d+$/.test(raw) ? parseInt(raw, 10) : 0
      attributes[attr] = clampModifier(gameSystem, num)
    }

    try {
      const updateError = await updateCharacter(member.id, {
        character_name: characterName,
        character_sheet_url: characterSheetUrl || null,
        character_notes: characterNotes.trim() || null,
        attributes
      })

      if (updateError) throw updateError
      
      onUpdate()
      onClose()
    } catch (err) {
      console.error('Error updating character:', err)
      setError('Failed to update character.')
      setIsSubmitting(false)
    }
  }

  const handleAttributeChange = (attr: string, value: string) => {
    if (!isValidModifierInput(value)) return
    setAttributeInputs(prev => ({ ...prev, [attr]: value }))
  }

  const handlePortraitChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Clear the input so picking the same file again still fires a change.
    e.target.value = ''
    if (!file) return
    setPortraitError(null)
    try {
      const path = await uploadPortrait(file)
      if (path) setPortrait(path)
    } catch (err) {
      console.error('Error uploading character portrait:', err)
      setPortraitError(err instanceof Error ? err.message : 'Image upload failed. Please try again.')
    }
  }

  const handlePortraitRemove = async () => {
    setPortraitError(null)
    setRemovingPortrait(true)
    try {
      await removePortrait()
      setPortrait(null)
    } catch (err) {
      console.error('Error removing character portrait:', err)
      setPortraitError(err instanceof Error ? err.message : 'Failed to remove the portrait.')
    } finally {
      setRemovingPortrait(false)
    }
  }

  const form = (
    <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="characterPortrait" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Character Portrait</label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Shown instead of your account picture in this game.</p>
                <div className="mt-2 flex items-center space-x-4">
                  <div className="flex-shrink-0">
                    {portraitSrc ? (
                      <Avatar
                        className="h-20 w-20 rounded-full object-cover"
                        src={portraitSrc}
                        alt={`${characterName || 'Character'} portrait`}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-500 dark:text-primary-400 text-2xl font-medium">
                        {(characterName[0] || '?').toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <input
                      ref={fileInputRef}
                      type="file"
                      id="characterPortrait"
                      accept="image/*"
                      className="sr-only"
                      aria-label="Character portrait"
                      onChange={handlePortraitChange}
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || removingPortrait || isSubmitting || !uploadEnabled || settingsLoading}
                        aria-busy={uploading}
                        className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                      >
                        {uploading ? 'Uploading...' : 'Change'}
                      </button>
                      {portrait && (
                        <button
                          type="button"
                          onClick={handlePortraitRemove}
                          disabled={uploading || removingPortrait || isSubmitting}
                          className="inline-flex items-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-3 py-1.5 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                        >
                          {removingPortrait ? 'Removing...' : 'Remove'}
                        </button>
                      )}
                    </div>
                    {settingsLoading && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Checking upload availability.</p>
                    )}
                    {!uploadEnabled && !settingsLoading && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Image uploads are disabled by the server admin.</p>
                    )}
                    {portraitError && (
                      <p className="text-xs text-red-600 dark:text-red-400 mt-1" role="alert">{portraitError}</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="charName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Character Name</label>
                <input
                  type="text"
                  id="charName"
                  required
                  maxLength={20}
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className="bg-white dark:bg-gray-800 mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                />
              </div>

              <div>
                <label htmlFor="charUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Sheet URL</label>
                <input
                  type="url"
                  id="charUrl"
                  maxLength={MAX_URL_LENGTH}
                  value={characterSheetUrl}
                  onChange={(e) => setCharacterSheetUrl(e.target.value)}
                  className="bg-white dark:bg-gray-800 mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label htmlFor="charNotes" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Notes</label>
                <textarea
                  id="charNotes"
                  rows={3}
                  maxLength={500}
                  value={characterNotes}
                  onChange={(e) => setCharacterNotes(e.target.value)}
                  className="bg-white dark:bg-gray-800 mt-1 block w-full border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="Backstory, personality, reminders... (plain text)"
                />
              </div>

              {systemAttributes.length > 0 && (
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{sectionCopy.title ?? 'Attributes (Modifiers)'}</h4>
                  <p className={`text-xs mb-3 ${hasInvalidInput ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>{sectionCopy.subTitle}</p>
                  <div className="grid grid-cols-3 gap-4">
                    {systemAttributes.map(attr => (
                      <div key={attr}>
                        <label htmlFor={attr} className="block text-xs font-medium text-gray-700 dark:text-gray-300">{attr}</label>
                        <ModifierInput
                          attr={attr}
                          value={attributeInputs[attr]}
                          onChange={(value) => handleAttributeChange(attr, value)}
                          min={modifierLimits.min}
                          max={modifierLimits.max}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div className="mt-5 sm:mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 shadow-sm px-4 py-2 bg-white dark:bg-gray-800 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !characterName.trim() || hasInvalidInput}
                  className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm disabled:opacity-50 transition-colors"
                >
                  {isSubmitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
  )

  if (asSheet) {
    return (
      <BottomSheet title="Edit Character" onClose={onClose}>
        {form}
      </BottomSheet>
    )
  }

  return (
    <div ref={dialogRef} className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div data-testid="edit-character-panel" className="relative inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4" id="modal-title">
              Edit Character
            </h3>
            {form}
          </div>
        </div>
      </div>
    </div>
  )
}
