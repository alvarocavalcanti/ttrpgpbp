import { useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { useEscapeToClose } from '../../hooks/useEscapeToClose'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { getSystemAttributes, clampModifier, isValidModifierInput, getModifierLimits, getModifierSectionCopy, sanitizeModifierValue } from '../../game-systems'
import { ModifierInput } from '../../components/ModifierInput'
import { MAX_URL_LENGTH } from '../../constants'

type ChannelMember = Database['public']['Tables']['channel_members']['Row']

interface EditCharacterModalProps {
  member: ChannelMember
  gameSystem: string
  onClose: () => void
  onUpdate: () => void
}

export function EditCharacterModal({ member, gameSystem, onClose, onUpdate }: EditCharacterModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEscapeToClose(onClose)
  useFocusTrap(dialogRef)
  const [characterName, setCharacterName] = useState(member.character_name)
  const [characterSheetUrl, setCharacterSheetUrl] = useState(member.character_sheet_url || '')
  const [characterNotes, setCharacterNotes] = useState(member.character_notes || '')
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    // Persist only integers within the system's modifier bounds. Unknown
    // attribute keys are kept as-is.
    const attributes: Record<string, number> = { ...((member.attributes as Record<string, number>) || {}) }
    for (const attr of systemAttributes) {
      const raw = attributeInputs[attr]
      const num = /^-?\d+$/.test(raw) ? parseInt(raw, 10) : 0
      attributes[attr] = clampModifier(gameSystem, num)
    }

    try {
      const { error: updateError } = await supabase
        .from('channel_members')
        .update({
          character_name: characterName,
          character_sheet_url: characterSheetUrl || null,
          character_notes: characterNotes.trim() || null,
          attributes
        })
        .eq('id', member.id)

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

  return (
    <div ref={dialogRef} className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-80 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100 mb-4" id="modal-title">
              Edit Character
            </h3>
            
            <form onSubmit={handleSave} className="space-y-4">
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
          </div>
        </div>
      </div>
    </div>
  )
}
