import { useEffect, useState } from 'react'
import { chipBase, chipIdle } from '../chat/composerChip'
import { BottomSheet } from '../../components/BottomSheet'
import { supabase } from '../../lib/supabase'

interface DiceRollerProps {
  onRoll: (notation: string) => void
  // Renders the roller panel as a BottomSheet instead of an anchored popup,
  // so it can't clip inside the composer's scrollable options sheet.
  popup?: boolean
  // When set, the last notations rolled in this channel become tappable chips.
  channelId?: string
}

export function buildNotation(diceType: string, quantity: number, modifier: number, advDis: 'none' | 'adv' | 'dis') {
  let notation = ''
  if (diceType === 'd20' && advDis !== 'none') {
    // Advantage / Disadvantage uses 2d20kh1 / 2d20kl1
    const suffix = advDis === 'adv' ? 'kh1' : 'kl1'
    notation = `2d20${suffix}`
  } else {
    notation = `${quantity}${diceType}`
  }

  if (modifier !== 0) {
    notation += modifier > 0 ? `+${modifier}` : modifier
  }
  return notation
}

export function DiceRoller({ onRoll, popup = false, channelId }: DiceRollerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [diceType, setDiceType] = useState('d20')
  const [quantity, setQuantity] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [advDis, setAdvDis] = useState<'none' | 'adv' | 'dis'>('none')
  const [recent, setRecent] = useState<string[]>([])

  useEffect(() => {
    if (!isOpen || !channelId) return
    let cancelled = false
    void supabase
      .rpc('get_channel_roll_history', { p_channel_id: channelId })
      .then(({ data }) => {
        if (cancelled || !data) return
        const notations: string[] = []
        for (const r of [...data].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
          if (!notations.includes(r.notation)) notations.push(r.notation)
          if (notations.length >= 3) break
        }
        setRecent(notations)
      })
    return () => { cancelled = true }
  }, [isOpen, channelId])

  const roll = (notation: string) => {
    setRecent(prev => [notation, ...prev.filter(n => n !== notation)].slice(0, 3))
    onRoll(notation)
    setIsOpen(false)
  }

  const handleRoll = () => {
    roll(buildNotation(diceType, quantity, modifier, advDis))
  }

  const panel = (
    <div className="space-y-3">
      <div className="flex items-center space-x-2">
        <label htmlFor="dice-quantity" className="sr-only">Number of dice</label>
        <input
          id="dice-quantity"
          type="number"
          inputMode="numeric"
          min="1"
          max="100"
          value={quantity}
          onChange={(e) => setQuantity(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))}
          className="bg-white dark:bg-gray-800 w-16 border-gray-300 dark:border-gray-600 rounded text-sm py-2"
          disabled={diceType === 'd20' && advDis !== 'none'}
        />
        <label htmlFor="dice-type" className="sr-only">Dice type</label>
        <select
          id="dice-type"
          value={diceType}
          onChange={(e) => {
            setDiceType(e.target.value)
            if (e.target.value !== 'd20') setAdvDis('none')
          }}
          className="bg-white dark:bg-gray-800 flex-1 border-gray-300 dark:border-gray-600 rounded text-sm py-2 pl-2 pr-8"
        >
          <option value="d4">d4</option>
          <option value="d6">d6</option>
          <option value="d8">d8</option>
          <option value="d10">d10</option>
          <option value="d12">d12</option>
          <option value="d20">d20</option>
          <option value="d100">d100</option>
        </select>
      </div>

      <div className="flex items-center space-x-2">
        {/* Explicit +/- steppers: numeric keyboards on phones often omit the
            minus key, so the modifier can't be typed directly. */}
        <button
          type="button"
          onClick={() => setModifier(m => Math.max(-999, m - 1))}
          aria-label="Decrease modifier"
          className="w-9 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          −
        </button>
        <label htmlFor="dice-modifier" className="sr-only">Modifier</label>
        <input
          id="dice-modifier"
          type="number"
          inputMode="numeric"
          value={modifier}
          onChange={(e) => setModifier(Math.min(999, Math.max(-999, parseInt(e.target.value) || 0)))}
          className="bg-white dark:bg-gray-800 w-16 border-gray-300 dark:border-gray-600 rounded text-sm py-2 text-center"
        />
        <button
          type="button"
          onClick={() => setModifier(m => Math.min(999, m + 1))}
          aria-label="Increase modifier"
          className="w-9 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          +
        </button>
      </div>

      {diceType === 'd20' && (
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-md">
          <button
            type="button"
            onClick={() => setAdvDis('none')}
            className={`flex-1 text-sm py-2 rounded transition-colors ${advDis === 'none' ? 'bg-white dark:bg-gray-800 shadow-sm font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => setAdvDis('adv')}
            className={`flex-1 text-sm py-2 rounded transition-colors ${advDis === 'adv' ? 'bg-green-100 dark:bg-green-900 shadow-sm font-medium text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            Adv
          </button>
          <button
            type="button"
            onClick={() => setAdvDis('dis')}
            className={`flex-1 text-sm py-2 rounded transition-colors ${advDis === 'dis' ? 'bg-red-100 dark:bg-red-900 shadow-sm font-medium text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
          >
            Dis
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={handleRoll}
        className="w-full flex justify-center py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
      >
        Roll
      </button>
    </div>
  )

  const recentChips = recent.length > 0 && (
    <div className="flex flex-wrap gap-2 pb-3 mb-1 border-b border-gray-200 dark:border-gray-700">
      {recent.map(n => (
        <button
          key={n}
          type="button"
          onClick={() => roll(n)}
          aria-label={`Quick roll ${n}`}
          className="font-mono text-sm text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border border-indigo-200 dark:border-indigo-800 rounded-full px-3 py-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900"
        >
          {n}
        </button>
      ))}
    </div>
  )

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${chipBase} ${chipIdle}`}
      >
        <svg className="w-5 h-5 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect x="4" y="4" width="16" height="16" rx="3" strokeWidth={2} />
          <circle cx="8" cy="8" r="2" fill="currentColor" />
          <circle cx="16" cy="8" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="8" cy="16" r="2" fill="currentColor" />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
        </svg>
        Roll Dice
      </button>

      {isOpen && popup && (
        <BottomSheet title="Dice Roller" onClose={() => setIsOpen(false)}>
          {recentChips}
          {panel}
        </BottomSheet>
      )}
      {isOpen && !popup && (
        <div className="absolute bottom-full mb-2 left-0 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dice Roller</h3>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close dice roller" className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {recentChips}
          {panel}
        </div>
      )}
    </div>
  )
}