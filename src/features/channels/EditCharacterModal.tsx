import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Database } from '../../types/database'
import { getSystemAttributes, clampModifier } from '../../game-systems'

type ChannelMember = Database['public']['Tables']['channel_members']['Row']

interface EditCharacterModalProps {
  member: ChannelMember
  gameSystem: string
  onClose: () => void
  onUpdate: () => void
}

export function EditCharacterModal({ member, gameSystem, onClose, onUpdate }: EditCharacterModalProps) {
  const [characterName, setCharacterName] = useState(member.character_name)
  const [characterSheetUrl, setCharacterSheetUrl] = useState(member.character_sheet_url || '')
  const [attributes, setAttributes] = useState<any>(member.attributes || {})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const { error: updateError } = await supabase
        .from('channel_members')
        .update({
          character_name: characterName,
          character_sheet_url: characterSheetUrl || null,
          attributes
        })
        .eq('id', member.id)

      if (updateError) throw updateError
      
      onUpdate()
      onClose()
    } catch (err: any) {
      console.error('Error updating character:', err)
      setError('Failed to update character.')
      setIsSubmitting(false)
    }
  }

  const handleAttributeChange = (attr: string, value: string) => {
    const num = parseInt(value, 10)
    const clamped = clampModifier(gameSystem, isNaN(num) ? 0 : num)
    setAttributes((prev: any) => ({
      ...prev,
      [attr]: clamped
    }))
  }

  const systemAttributes = getSystemAttributes(gameSystem)

  return (
    <div className="fixed z-50 inset-0 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div>
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4" id="modal-title">
              Edit Character
            </h3>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="charName" className="block text-sm font-medium text-gray-700">Character Name</label>
                <input
                  type="text"
                  id="charName"
                  required
                  maxLength={20}
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                />
              </div>

              <div>
                <label htmlFor="charUrl" className="block text-sm font-medium text-gray-700">Sheet URL</label>
                <input
                  type="url"
                  id="charUrl"
                  value={characterSheetUrl}
                  onChange={(e) => setCharacterSheetUrl(e.target.value)}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border"
                  placeholder="https://..."
                />
              </div>

              {systemAttributes.length > 0 && (
                <div className="pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-900 mb-3">Attributes (Modifiers)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    {systemAttributes.map(attr => (
                      <div key={attr}>
                        <label htmlFor={attr} className="block text-xs font-medium text-gray-700">{attr}</label>
                        <input
                          type="number"
                          id={attr}
                          value={attributes[attr] ?? 0}
                          onChange={(e) => handleAttributeChange(attr, e.target.value)}
                          className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm px-3 py-2 border text-center"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Enter your modifiers (e.g. -2, 0, 3), not your base scores.</p>
                </div>
              )}

              {error && (
                <div className="text-sm text-red-600">
                  {error}
                </div>
              )}

              <div className="mt-5 sm:mt-6 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !characterName.trim()}
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
