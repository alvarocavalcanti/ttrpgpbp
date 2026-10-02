import { parseDiceNotation } from './parser'
import type { DiceRollMode } from './parser'

// Client-side dice evaluator for the PUBLIC tool page only (issue #645). The
// in-app roller stays server-authoritative: it sends the notation to the
// `roll_dice` RPC, which persists the result and drives history/realtime. This
// module is a display-only clone of the same rules for the signed-out tool —
// never import it into the app's roll path.

export interface RolledDie {
  sides: number
  value: number
  kept: boolean
}

export interface DiceRollResult {
  notation: string
  mode: DiceRollMode
  dice: RolledDie[]
  /** Sum (kept dice + modifier) for sum rolls; null for pools. */
  total: number | null
  /** Faces at or above the target for success rolls; null otherwise. */
  successes: number | null
  target: number | null
  modifier: number
}

// Unbiased face from the platform CSPRNG. Overridable so tests can seed it.
const cryptoUnit = (): number => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32

function faceRoll(sides: number, rng: () => number): number {
  // Clamp so a misbehaving injected rng can still never leave the face range.
  return Math.min(sides, Math.max(1, 1 + Math.floor(rng() * sides)))
}

// Mirrors the server's keep/drop rules: `kh`/`kl` keep the highest/lowest N,
// `dh`/`dl` drop the highest/lowest N, the amount defaults to 1 and is capped
// at the rolled count. Returns a kept flag per die in the original order.
function applyKeepDrop(values: number[], keepDrop: string): boolean[] {
  const kept = values.map(() => true)
  if (!keepDrop) return kept
  const type = keepDrop.slice(0, 2)
  const parsedAmount = keepDrop.length > 2 ? Number(keepDrop.slice(2)) : 1
  const amount = Math.min(values.length, Math.max(1, parsedAmount))
  const byValue = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index)
  const dropped = new Set<number>()
  if (type === 'kh') byValue.slice(0, values.length - amount).forEach((d) => dropped.add(d.index))
  else if (type === 'kl') byValue.slice(amount).forEach((d) => dropped.add(d.index))
  else if (type === 'dh') byValue.slice(values.length - amount).forEach((d) => dropped.add(d.index))
  else if (type === 'dl') byValue.slice(0, amount).forEach((d) => dropped.add(d.index))
  for (const index of dropped) kept[index] = false
  return kept
}

export function rollDice(
  notation: string,
  rng: () => number = cryptoUnit,
): DiceRollResult | null {
  const parsed = parseDiceNotation(notation)
  if (!parsed) return null

  const { count, sides, keepDrop, mode, target, modifier, sorted } = parsed
  const values = Array.from({ length: count }, () => faceRoll(sides, rng))
  const keptFlags = applyKeepDrop(values, keepDrop)

  let dice: RolledDie[] = values.map((value, index) => ({
    sides,
    value,
    kept: keptFlags[index],
  }))
  if (sorted) dice = [...dice].sort((a, b) => b.value - a.value)

  const keptValues = dice.filter((die) => die.kept).map((die) => die.value)
  const total = mode === 'sum' ? keptValues.reduce((sum, value) => sum + value, 0) + modifier : null
  const successes =
    mode === 'successes' && target !== null
      ? keptValues.filter((value) => value >= target).length
      : null

  return { notation, mode, dice, total, successes, target, modifier }
}
