import { useState } from 'react'
import { Seo } from '../../components/Seo'
import { NumericInput } from '../../components/NumericInput'
import { ROUTES } from '../../lib/publicRoutes'
import { useAuth } from '../auth/useAuth'
import { MarketingHeader } from '../marketing/MarketingHeader'
import { SiteFooter } from '../marketing/SiteFooter'
import { buildNotation } from '../dice/DiceRoller'
import type { PoolMode } from '../dice/DiceRoller'
import { rollDice } from '../dice/rollDice'
import type { DiceRollResult } from '../dice/rollDice'
import { DiceIconPicker } from '../dice/DiceIconPicker'
import type { DiceSelection } from '../dice/DiceIconPicker'

// Public, signed-out dice roller (issue #645). Client-side only: results are
// computed in the browser and never sent anywhere or saved. The in-app roller
// is unaffected and stays server-authoritative.
export function DiceRollerPage() {
  const { user } = useAuth()
  const [selection, setSelection] = useState<DiceSelection[]>([])
  const [modifier, setModifier] = useState(0)
  const [advDis, setAdvDis] = useState<'none' | 'adv' | 'dis'>('none')
  const [poolMode, setPoolMode] = useState<PoolMode>('sum')
  const [target, setTarget] = useState(4)
  const [sorted, setSorted] = useState(false)
  const [result, setResult] = useState<DiceRollResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const multiType = selection.length > 1
  const singleD20 = selection.length === 1 && selection[0].sides === 20 && selection[0].count === 1
  const dieSides = selection[0]?.sides ?? 20
  const canRoll = selection.length > 0

  const handleRoll = () => {
    const notation = buildNotation(selection, modifier, advDis, poolMode, target, sorted)
    const rolled = notation ? rollDice(notation) : null
    if (!rolled) {
      setError(notation ? `Could not roll “${notation}”. Check the dice and try again.` : 'Pick at least one die to roll.')
      setResult(null)
      return
    }
    setError(null)
    setResult(rolled)
  }

  const handleSelectionChange = (next: DiceSelection[]) => {
    setSelection(next)
    const distinct = new Set(next.map((die) => die.sides)).size
    if (distinct > 1) {
      setPoolMode('sum')
      setAdvDis('none')
      return
    }
    if (next.length === 1) {
      setTarget((current) => Math.min(next[0].sides, Math.max(1, current)))
      if (next[0].sides !== 20 || next[0].count > 1) setAdvDis('none')
      return
    }
    setAdvDis('none')
  }

  const modeButton = (mode: PoolMode, label: string) => (
    <button
      type="button"
      aria-pressed={poolMode === mode}
      onClick={() => {
        setPoolMode(mode)
        if (mode !== 'sum') setAdvDis('none')
      }}
      disabled={multiType && mode !== 'sum'}
      title={multiType && mode !== 'sum' ? 'Pools use a single die type' : undefined}
      className={`flex-1 rounded px-3 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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
          pools, and success checks. Tap dice to add them and mix different types in one roll. Rolls
          happen in your browser; nothing is saved and no account is needed.
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

          <div className="mt-4">
            <DiceIconPicker selection={selection} onChange={handleSelectionChange} />
          </div>

          {poolMode === 'successes' && (
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="tool-dice-target" className="text-sm text-surface-700 dark:text-surface-300">
                Target
              </label>
              <NumericInput
                id="tool-dice-target"
                min={1}
                max={dieSides}
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

          {poolMode === 'sum' && singleD20 && (
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
            disabled={!canRoll}
            className="mt-4 min-h-11 w-full rounded-md bg-primary-600 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Roll
          </button>

          {!canRoll && (
            <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">Pick at least one die to roll.</p>
          )}

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
            Tap the dice you want to roll, then press Roll. You can mix die types in a single roll
            (like 2d6 + 1d8 + 3), add a modifier if your game uses one, and switch to Pool or
            Successes for games that read every die on its own. For a single d20 you can roll with
            advantage or disadvantage.
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

        <p className="mt-10 text-xs text-surface-400 dark:text-surface-500">
          Dice icons by{' '}
          <a href="https://game-icons.net/tags/dice.html" target="_blank" rel="noreferrer" className="underline">
            skoll &amp; Delapouite
          </a>{' '}
          (game-icons.net), licensed CC BY 3.0.
        </p>
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
