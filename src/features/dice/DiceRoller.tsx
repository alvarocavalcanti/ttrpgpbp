import { useState } from 'react'
import { chipBase, chipIdle } from '../chat/composerChip'
import { BottomSheet } from '../../components/BottomSheet'
import { NumericInput } from '../../components/NumericInput'
import { useRecentRolls, mergeChips } from './useRecentRolls'
import { useDiceFavorites } from './useDiceFavorites'
import { parseDiceNotation } from './parser'
import { DIE_SIDES, DiceIconPicker, DieGlyph } from './DiceIconPicker'
import type { DiceSelection } from './DiceIconPicker'

interface DiceRollerProps {
  onRoll: (notation: string) => void
  // Renders the roller panel as a BottomSheet instead of an anchored popup,
  // so it can't clip inside the composer's scrollable options sheet.
  popup?: boolean
  // When set, the last notations rolled in this channel become tappable
  // chips, with pinned favorites first.
  channelId?: string
  // Round floating trigger (#629) used by the bottom-left control in the
  // channel, instead of the labelled composer chip.
  fab?: boolean
  // Which edge the anchored panel grows from, so a dragged FAB near the right
  // edge doesn't push its panel off-screen.
  align?: 'left' | 'right'
  // Open the anchored panel below the trigger (when there isn't room above).
  panelBelow?: boolean
  // Opens the channel roll history from inside the panel.
  onOpenHistory?: () => void
}

export type PoolMode = 'sum' | 'pool' | 'successes'

// Default success target for a fresh pool form: the common TN 4, capped at
// the die size so small dice (d4) never open with an unreachable target.
export function defaultTarget(sides: number) {
  return Math.min(4, Math.max(1, sides))
}

// The dice types the roller form can render. Derived from the picker's icon
// set so the two can never drift. Anything else the server accepts (d30,
// d1000, …) can't be shown.
export const DICE_TYPES: readonly string[] = DIE_SIDES.map((sides) => `d${sides}`)

export interface RollerValues {
  selection: DiceSelection[]
  modifier: number
  advDis: 'none' | 'adv' | 'dis'
  poolMode: PoolMode
  target: number
  sorted: boolean
}

// Builds the notation for a bag of dice. Sums chain every selected die type
// (`2d6+1d8+3`); pools and success pools use the single selected group.
export function buildNotation(
  selection: DiceSelection[],
  modifier: number,
  advDis: 'none' | 'adv' | 'dis',
  poolMode: PoolMode = 'sum',
  target = 0,
  sorted = false,
) {
  if (selection.length === 0) return ''
  if (poolMode !== 'sum') {
    // Pools carry no keep/drop and no modifier: faces are read, not summed.
    // The `s` suffix lists the faces highest-first (applies to both modes).
    const { count, sides } = selection[0]
    const base = `${count}d${sides}`
    return poolMode === 'successes'
      ? `${base}>=${target}${sorted ? 's' : ''}`
      : `${base}p${sorted ? 's' : ''}`
  }

  const singleD20 = selection.length === 1 && selection[0].sides === 20 && selection[0].count === 1
  let notation: string
  if (advDis !== 'none' && singleD20) {
    // Advantage / Disadvantage rolls 2d20 keeping high/low.
    notation = advDis === 'adv' ? '2d20kh1' : '2d20kl1'
  } else {
    notation = selection.map((die) => `${die.count}d${die.sides}`).join('+')
  }

  if (modifier !== 0) {
    notation += modifier > 0 ? `+${modifier}` : modifier
  }
  return notation
}

// Inverse of buildNotation: maps a channel-history notation back onto the
// roller form so a chip tap loads the values instead of rolling. Returns
// null for notations the form can't represent (drop-highest/lowest, keep/drop
// counts other than 1, die sizes outside DICE_TYPES, or counts / modifiers
// outside the form bounds) — those chips keep the old one-click roll so the
// user never confirms a roll different from the one shown.
export function parseRollerNotation(notation: string): RollerValues | null {
  const parsed = parseDiceNotation(notation)
  if (!parsed) return null

  const { groups, keepDrop, mode, target, modifier, sorted } = parsed
  // The form shows one badge per die size and keep/drop only as single-d20
  // adv/dis, so it can't rebuild a chain with a repeated die size or with any
  // per-group keep/drop — those chips keep the one-click roll.
  if (new Set(groups.map((group) => group.sides)).size !== groups.length) return null
  if (groups.length > 1 && groups.some((group) => group.keepDrop)) return null
  for (const group of groups) {
    if (!DICE_TYPES.includes(`d${group.sides}`)) return null
    if (group.count < 1 || group.count > 100) return null
  }
  // The form bounds (±999 modifier) match the modifier input's keystroke clamp;
  // out-of-range history notations fall back to one-click roll.
  if (modifier < -999 || modifier > 999) return null

  if (keepDrop) {
    // The form only does d20 advantage/disadvantage (2d20 keep-high/low 1).
    const kind = keepDrop.startsWith('kh') ? 'adv' : keepDrop.startsWith('kl') ? 'dis' : null
    const keepDropAmount = keepDrop.slice(2) ? Number(keepDrop.slice(2)) : 1
    if (kind && keepDropAmount === 1 && groups.length === 1 && groups[0].count === 2 && groups[0].sides === 20 && mode === 'sum') {
      return { selection: [{ sides: 20, count: 1 }], modifier, advDis: kind, poolMode: 'sum', target: defaultTarget(20), sorted }
    }
    return null
  }

  if (mode !== 'sum') {
    const group = groups[0]
    return {
      selection: [{ sides: group.sides, count: group.count }],
      modifier: 0,
      advDis: 'none',
      poolMode: mode,
      target: target ?? defaultTarget(group.sides),
      sorted,
    }
  }

  return {
    selection: groups.map((group) => ({ sides: group.sides, count: group.count })),
    modifier,
    advDis: 'none',
    poolMode: 'sum',
    target: defaultTarget(groups[0].sides),
    sorted,
  }
}

export function DiceRoller({ onRoll, popup = false, channelId, fab = false, align = 'left', panelBelow = false, onOpenHistory }: DiceRollerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [selection, setSelection] = useState<DiceSelection[]>([])
  const [modifier, setModifier] = useState(0)
  const [advDis, setAdvDis] = useState<'none' | 'adv' | 'dis'>('none')
  // Pool modes read faces instead of summing: `pool` lists every face,
  // `successes` counts faces at or above the target.
  const [poolMode, setPoolMode] = useState<PoolMode>('sum')
  const [target, setTarget] = useState(4)
  // Sorted pools list the faces highest-first (`ps` / `>=Ts`).
  const [sorted, setSorted] = useState(false)
  const { recent, recordRoll } = useRecentRolls(channelId, isOpen)
  const { favorites, isFavorite, canFavorite, toggleFavorite } = useDiceFavorites(channelId, isOpen)
  const chips = mergeChips(favorites, recent)

  const multiType = selection.length > 1
  const singleD20 = selection.length === 1 && selection[0].sides === 20 && selection[0].count === 1
  const dieSides = selection[0]?.sides ?? 20
  const canRoll = selection.length > 0

  const roll = (notation: string) => {
    recordRoll(notation)
    onRoll(notation)
    // Start the next roll from a clean bag so the previous dice don't linger.
    setIsOpen(false)
    setSelection([])
    setAdvDis('none')
  }

  const handleRoll = () => {
    roll(buildNotation(selection, modifier, advDis, poolMode, target, sorted))
  }

  // Editing the dice bag keeps the rest of the form coherent: a multi-type bag
  // can only sum, and the target/adv-dis controls track the selected die.
  const handleSelectionChange = (next: DiceSelection[]) => {
    setSelection(next)
    const distinct = new Set(next.map((die) => die.sides)).size
    if (distinct > 1) {
      setPoolMode('sum')
      setAdvDis('none')
      return
    }
    if (next.length === 1) {
      setTarget((t) => Math.min(next[0].sides, Math.max(1, t)))
      if (next[0].sides !== 20 || next[0].count > 1) setAdvDis('none')
      return
    }
    setAdvDis('none')
  }

  // A chip tap loads the notation's values into the form for review instead
  // of rolling at once. Notations the form can't represent keep the old
  // one-click roll so the user never confirms a different roll.
  const applyNotation = (notation: string) => {
    const parsed = parseRollerNotation(notation)
    if (!parsed) {
      roll(notation)
      return
    }
    setSelection(parsed.selection)
    setModifier(parsed.modifier)
    setAdvDis(parsed.advDis)
    setPoolMode(parsed.poolMode)
    setTarget(parsed.target)
    setSorted(parsed.sorted)
  }

  const panel = (
    <div className="space-y-3">
      <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-md">
        <button
          type="button"
          onClick={() => setPoolMode('sum')}
          className={`flex-1 text-sm py-2 rounded transition-colors ${poolMode === 'sum' ? 'bg-white dark:bg-gray-800 shadow-sm font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          Sum
        </button>
        <button
          type="button"
          onClick={() => { setPoolMode('pool'); setAdvDis('none') }}
          disabled={multiType}
          title={multiType ? 'Pools use a single die type' : undefined}
          className={`flex-1 text-sm py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${poolMode === 'pool' ? 'bg-white dark:bg-gray-800 shadow-sm font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          Pool
        </button>
        <button
          type="button"
          onClick={() => { setPoolMode('successes'); setAdvDis('none') }}
          disabled={multiType}
          title={multiType ? 'Pools use a single die type' : undefined}
          className={`flex-1 text-sm py-2 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${poolMode === 'successes' ? 'bg-white dark:bg-gray-800 shadow-sm font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          Successes
        </button>
      </div>

      <DiceIconPicker selection={selection} onChange={handleSelectionChange} />

      {poolMode === 'successes' && (
        <div className="flex items-center space-x-2">
          <label htmlFor="dice-target" className="text-sm text-gray-700 dark:text-gray-300">Target</label>
          <NumericInput
            id="dice-target"
            min={1}
            max={dieSides}
            value={target}
            onChange={setTarget}
            className="bg-white dark:bg-gray-800 w-16 min-h-11 border-gray-300 dark:border-gray-600 rounded text-sm py-2 text-center"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">or higher counts as a success</span>
        </div>
      )}

      {poolMode !== 'sum' && (
        <label htmlFor="dice-sorted" className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
          <input
            id="dice-sorted"
            type="checkbox"
            checked={sorted}
            onChange={(e) => setSorted(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
          />
          Sort highest first
        </label>
      )}

      {/* One row holds the Sum modifier controls and the Clear button. Clear is
          always present — disabled until a die is picked — so toggling a
          selection never shifts the form vertically (#697). Pool/Successes
          modes keep the row (Clear only) so a pool selection can still reset. */}
      <div className="flex items-center gap-2">
        {poolMode === 'sum' && (
          <>
            {/* Explicit +/- steppers: numeric keyboards on phones often omit the
                minus key, so the modifier can't be typed directly. */}
            <button
              type="button"
              onClick={() => setModifier(m => Math.max(-999, m - 1))}
              aria-label="Decrease modifier"
              className="min-h-11 min-w-11 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              −
            </button>
            <label htmlFor="dice-modifier" className="sr-only">Modifier</label>
            <NumericInput
              id="dice-modifier"
              min={-999}
              max={999}
              value={modifier}
              onChange={setModifier}
              className="bg-white dark:bg-gray-800 w-16 min-h-11 border-gray-300 dark:border-gray-600 rounded text-sm py-2 text-center"
            />
            <button
              type="button"
              onClick={() => setModifier(m => Math.min(999, m + 1))}
              aria-label="Increase modifier"
              className="min-h-11 min-w-11 py-2 border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              +
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => handleSelectionChange([])}
          disabled={!canRoll}
          aria-label="Clear dice"
          className="ml-auto min-h-11 py-2 px-3 text-sm font-medium text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear
        </button>
      </div>

      {poolMode === 'sum' && singleD20 && (
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
        disabled={!canRoll}
        className="w-full flex justify-center min-h-11 py-2.5 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Roll
      </button>
      {!canRoll && (
        <p className="text-xs text-gray-500 dark:text-gray-400">Pick at least one die to roll.</p>
      )}
    </div>
  )

  // Favorites pin to the front; a star checkbox on each chip pins or
  // unpins it (pinned chips are amber with a thicker border). The toggle
  // disables once three favorites exist, except on pinned chips so they can
  // still be unpinned.
  const recentChips = chips.length > 0 && (
    <div className="flex flex-wrap gap-2 pb-3 mb-1 border-b border-gray-200 dark:border-gray-700">
      {chips.map(n => {
        const favorite = isFavorite(n)
        const quick = parseRollerNotation(n) === null
        return (
          <span
            key={n}
            className={`inline-flex items-center gap-1 rounded-full pl-3 pr-1 py-1 font-mono text-sm border-2 ${favorite ? 'text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950 border-amber-400 dark:border-amber-600' : 'text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800'}`}
          >
            <button
              type="button"
              onClick={() => applyNotation(n)}
              aria-label={quick ? `Quick roll ${n}` : `Use ${n}`}
              className="hover:underline"
            >
              {n}
            </button>
            <label className="inline-flex items-center p-1 cursor-pointer">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={favorite}
                disabled={!favorite && !canFavorite}
                onChange={() => void toggleFavorite(n)}
                aria-label={favorite ? `Unfavorite ${n}` : `Favorite ${n}`}
              />
              <svg className={`w-5 h-5 ${favorite ? 'fill-amber-400 text-amber-500 dark:text-amber-400' : 'fill-none stroke-current'} peer-focus-visible:ring-2 peer-focus-visible:ring-amber-500 peer-disabled:opacity-40 rounded`} viewBox="0 0 24 24" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </label>
          </span>
        )
      })}
    </div>
  )

  const historyButton = onOpenHistory && (
    <button
      type="button"
      onClick={() => { setIsOpen(false); onOpenHistory() }}
      className="w-full mb-3 inline-flex justify-center min-h-11 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
    >
      Roll History
    </button>
  )

  return (
    <div className="relative">
      {fab ? (
        <button
          type="button"
          data-dice-fab
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Open dice roller"
          aria-expanded={isOpen}
          className="inline-flex items-center justify-center p-4 border border-transparent rounded-full shadow-lg text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
        >
          <DieGlyph className="h-6 w-6" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`${chipBase} ${chipIdle}`}
        >
          <DieGlyph className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
          Roll Dice
        </button>
      )}

      {isOpen && popup && (
        <BottomSheet title="Dice Roller" onClose={() => setIsOpen(false)}>
          {historyButton}
          {recentChips}
          {panel}
        </BottomSheet>
      )}
      {isOpen && !popup && (
        <div className={`absolute ${panelBelow ? 'top-full mt-2' : 'bottom-full mb-2'} ${align === 'right' ? 'right-0' : 'left-0'} w-80 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50`}>
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Dice Roller</h3>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close dice roller" className="text-gray-400 dark:text-gray-400 hover:text-gray-500 dark:hover:text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          {historyButton}
          {recentChips}
          {panel}
        </div>
      )}
    </div>
  )
}
