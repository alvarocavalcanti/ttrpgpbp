import { useState } from 'react'
import { Seo } from '../../components/Seo'
import { NumericInput } from '../../components/NumericInput'
import { ROUTES } from '../../lib/publicRoutes'
import { useAuth } from '../auth/useAuth'
import { MarketingHeader } from '../marketing/MarketingHeader'
import { SiteFooter } from '../marketing/SiteFooter'
import { buildNotation, DICE_TYPES } from '../dice/DiceRoller'
import type { PoolMode } from '../dice/DiceRoller'
import { rollDice } from '../dice/rollDice'
import type { DiceRollResult } from '../dice/rollDice'

const sidesOf = (diceType: string) => Number(diceType.slice(1))

// Public, signed-out dice roller (issue #645). Client-side only: results are
// computed in the browser and never sent anywhere or saved. The in-app roller
// is unaffected and stays server-authoritative.
export function DiceRollerPage() {
  const { user } = useAuth()
  const [diceType, setDiceType] = useState('d20')
  const [quantity, setQuantity] = useState(1)
  const [modifier, setModifier] = useState(0)
  const [advDis, setAdvDis] = useState<'none' | 'adv' | 'dis'>('none')
  const [poolMode, setPoolMode] = useState<PoolMode>('sum')
  const [target, setTarget] = useState(4)
  const [sorted, setSorted] = useState(false)
  const [result, setResult] = useState<DiceRollResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sides = sidesOf(diceType)

  const handleRoll = () => {
    const notation = buildNotation(diceType, quantity, modifier, advDis, poolMode, target, sorted)
    const rolled = rollDice(notation)
    if (!rolled) {
      setError(`Could not roll “${notation}”. Check the dice and try again.`)
      setResult(null)
      return
    }
    setError(null)
    setResult(rolled)
  }

  const changeDiceType = (value: string) => {
    setDiceType(value)
    const nextSides = sidesOf(value)
    setTarget((current) => Math.min(nextSides, Math.max(1, current)))
    if (value !== 'd20') setAdvDis('none')
  }

  const modeButton = (mode: PoolMode, label: string) => (
    <button
      type="button"
      aria-pressed={poolMode === mode}
      onClick={() => {
        setPoolMode(mode)
        if (mode !== 'sum') setAdvDis('none')
      }}
      className={`flex-1 rounded px-3 py-2 text-sm transition-colors ${
        poolMode === mode
          ? 'bg-white font-medium text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
          : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex flex-col">
      <Seo path={ROUTES.diceRoller} />
      {!user && <MarketingHeader />}

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pb-16">
        <h1 className="pt-8 text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-surface-100">
          Dice Roller
        </h1>
        <p className="mt-3 text-surface-600 dark:text-surface-400">
          Roll dice for any tabletop RPG — d4 to d100, modifiers, advantage and disadvantage, dice
          pools, and success checks. Rolls happen in your browser; nothing is saved and no account
          is needed.
        </p>

        <section
          aria-label="Dice roller"
          className="mt-6 rounded-lg border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-700 dark:bg-surface-800"
        >
          <div className="flex items-center rounded-md bg-surface-100 p-1 dark:bg-surface-900">
            {modeButton('sum', 'Sum')}
            {modeButton('pool', 'Pool')}
            {modeButton('successes', 'Successes')}
          </div>

          <div className="mt-4 flex items-end gap-3">
            <div className="flex flex-col">
              <label
                htmlFor="tool-dice-quantity"
                className="mb-1 text-xs font-medium text-surface-500 dark:text-surface-400"
              >
                Number
              </label>
              <NumericInput
                id="tool-dice-quantity"
                min={1}
                max={100}
                value={quantity}
                disabled={diceType === 'd20' && advDis !== 'none'}
                onChange={setQuantity}
                className="w-16 min-h-11 rounded border-surface-300 bg-white text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
              />
            </div>
            <div className="flex flex-1 flex-col">
              <label
                htmlFor="tool-dice-type"
                className="mb-1 text-xs font-medium text-surface-500 dark:text-surface-400"
              >
                Die
              </label>
              <select
                id="tool-dice-type"
                value={diceType}
                onChange={(e) => changeDiceType(e.target.value)}
                className="min-h-11 w-full rounded border-surface-300 bg-white py-2 pl-2 pr-8 text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
              >
                {DICE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {poolMode === 'successes' && (
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="tool-dice-target" className="text-sm text-surface-700 dark:text-surface-300">
                Target
              </label>
              <NumericInput
                id="tool-dice-target"
                min={1}
                max={sides}
                value={target}
                onChange={setTarget}
                className="w-16 min-h-11 rounded border-surface-300 bg-white text-center text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
              />
              <span className="text-sm text-surface-500 dark:text-surface-400">
                or higher counts as a success
              </span>
            </div>
          )}

          {poolMode !== 'sum' && (
            <label
              htmlFor="tool-dice-sorted"
              className="mt-4 flex items-center gap-2 text-sm text-surface-700 dark:text-surface-300"
            >
              <input
                id="tool-dice-sorted"
                type="checkbox"
                checked={sorted}
                onChange={(e) => setSorted(e.target.checked)}
                className="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:border-surface-600"
              />
              Sort highest first
            </label>
          )}

          {poolMode === 'sum' && (
            <div className="mt-4">
              <label
                htmlFor="tool-dice-modifier"
                className="mb-1 block text-xs font-medium text-surface-500 dark:text-surface-400"
              >
                Modifier
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModifier((m) => Math.max(-999, m - 1))}
                  aria-label="Decrease modifier"
                  className="min-h-11 min-w-11 rounded border border-surface-300 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-700"
                >
                  −
                </button>
                <NumericInput
                  id="tool-dice-modifier"
                  min={-999}
                  max={999}
                  value={modifier}
                  onChange={setModifier}
                  className="w-16 min-h-11 rounded border-surface-300 bg-white text-center text-sm text-surface-900 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-100"
                />
                <button
                  type="button"
                  onClick={() => setModifier((m) => Math.min(999, m + 1))}
                  aria-label="Increase modifier"
                  className="min-h-11 min-w-11 rounded border border-surface-300 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 dark:border-surface-600 dark:text-surface-300 dark:hover:bg-surface-700"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {diceType === 'd20' && poolMode === 'sum' && (
            <div className="mt-4 flex items-center rounded-md bg-surface-100 p-1 dark:bg-surface-900">
              {(['none', 'adv', 'dis'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={advDis === value}
                  onClick={() => setAdvDis(value)}
                  className={`flex-1 rounded px-3 py-2 text-sm transition-colors ${
                    advDis === value
                      ? 'bg-white font-medium text-surface-900 shadow-sm dark:bg-surface-700 dark:text-surface-100'
                      : 'text-surface-500 hover:text-surface-700 dark:text-surface-400 dark:hover:text-surface-200'
                  }`}
                >
                  {value === 'none' ? 'Normal' : value === 'adv' ? 'Advantage' : 'Disadvantage'}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleRoll}
            className="mt-4 min-h-11 w-full rounded-md bg-primary-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            Roll
          </button>

          {error && (
            <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          {result && <RollResultCard result={result} />}
        </section>

        <section className="prose prose-sm sm:prose-base mt-10 max-w-none dark:prose-invert">
          <h2>How to use the dice roller</h2>
          <p>
            Choose a die and how many to roll, add a modifier if your game uses one, then press
            Roll. For a d20 you can roll with advantage or disadvantage; for games that read every
            die on its own, switch to Pool or Successes.
          </p>
          <h2>Dice the roller supports</h2>
          <p>
            Every common tabletop die is here: d4, d6, d8, d10, d12, d20, and d100, up to 100 dice
            at once. Pools list each face without adding them up, and success rolls count how many
            dice meet or beat your target number.
          </p>
          <h2>Are the rolls saved?</h2>
          <p>
            No. The public roller is a quick tool for anyone; results stay in your browser and are
            never stored. Inside a Role by Post campaign, rolls are saved to the channel so your
            whole table can see them.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

function RollResultCard({ result }: { result: DiceRollResult }) {
  const label =
    result.mode === 'sum'
      ? `Total ${result.total ?? 0}`
      : result.mode === 'successes'
        ? `${result.successes ?? 0} ${result.successes === 1 ? 'success' : 'successes'}`
        : `${result.dice.length} dice`

  return (
    <div className="mt-4 rounded-md border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-900">
      <p className="text-sm text-surface-500 dark:text-surface-400">
        <span className="font-mono">{result.notation}</span>
      </p>
      <p className="mt-1 text-2xl font-bold text-surface-900 dark:text-surface-100">{label}</p>

      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Dice results">
        {result.dice.map((die, index) => {
          const hit = result.mode === 'successes' && die.value >= (result.target ?? Infinity)
          return (
            <li
              key={index}
              className={`inline-flex h-9 min-w-9 items-center justify-center rounded border px-2 font-mono text-sm ${
                !die.kept
                  ? 'border-surface-200 text-surface-400 line-through dark:border-surface-700 dark:text-surface-500'
                  : hit
                    ? 'border-green-500 bg-green-50 font-semibold text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'border-surface-300 text-surface-800 dark:border-surface-600 dark:text-surface-200'
              }`}
            >
              {die.value}
            </li>
          )
        })}
        {result.mode === 'sum' && result.modifier !== 0 && (
          <li className="inline-flex h-9 items-center rounded border border-surface-300 px-2 font-mono text-sm text-surface-800 dark:border-surface-600 dark:text-surface-200">
            {result.modifier > 0 ? `+${result.modifier}` : result.modifier}
          </li>
        )}
      </ul>
    </div>
  )
}
