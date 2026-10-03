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

// 32-bit unsigned sample from the platform CSPRNG. Overridable so tests can
// seed it.
const cryptoUint32 = (): number => crypto.getRandomValues(new Uint32Array(1))[0]

// Uniform face in [1, sides]. Rejection sampling discards the tail values above
// the largest multiple of `sides`, so the modulo is applied to a uniform range
// and every face is equally likely (CWE-327). See CodeQL
// js/biased-cryptographic-random.
function faceRoll(sides: number, rng: () => number): number {
  const range = 0x1_0000_0000
  const limit = Math.floor(range / sides) * sides
  let value = rng()
  while (value >= limit) value = rng()
  return (value % sides) + 1
}

// Mirrors the server's keep/drop rules: `kh`/`kl` keep the highest/lowest N,
// `dh`/`dl` drop the highest/lowest N, the amount defaults to 1 and is capped
// at the rolled count. Returns a kept flag per die in the original order.
function applyKeepDrop(values: number[], keepDrop: string): boolean[] {
  const kept = values.map(() => true)
  if (!keepDrop) return kept
  const type = keepDrop.slice(0, 2)
  const parsedAmount = keepDrop.length > 2 ? Number(keepDrop.slice(2)) : 1
  // `kh0`/`dh0` are valid in the shared grammar: zero means keep/drop none.
  const amount = Math.min(values.length, Math.max(0, parsedAmount))
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
  rng: () => number = cryptoUint32,
): DiceRollResult | null {
  const parsed = parseDiceNotation(notation)
  if (!parsed) return null

  const { groups, mode, target, modifier, sorted } = parsed
  // The grammar allows `0d6` / `1d0` / counts past the page limit; enforce the
  // same numeric bounds the server does before rolling.
  const totalDice = groups.reduce((sum, group) => sum + group.count, 0)
  if (totalDice < 1 || totalDice > 100) return null
  if (groups.some((group) => group.count < 1 || group.sides < 1)) return null

  // Pools are a single group; sums may chain several dice types.
  const dice: RolledDie[] = []
  for (const group of groups) {
    const values = Array.from({ length: group.count }, () => faceRoll(group.sides, rng))
    const keptFlags = applyKeepDrop(values, group.keepDrop)
    values.forEach((value, index) => dice.push({ sides: group.sides, value, kept: keptFlags[index] }))
  }

  if (mode === 'sum') {
    const keptValues = dice.filter((die) => die.kept).map((die) => die.value)
    const total = keptValues.reduce((sum, value) => sum + value, 0) + modifier
    return { notation, mode, dice, total, successes: null, target: null, modifier }
  }

  const ordered = sorted ? [...dice].sort((a, b) => b.value - a.value) : dice
  const keptValues = ordered.filter((die) => die.kept).map((die) => die.value)
  const successes =
    mode === 'successes' && target !== null
      ? keptValues.filter((value) => value >= target).length
      : null

  return { notation, mode, dice: ordered, total: null, successes, target, modifier }
}
