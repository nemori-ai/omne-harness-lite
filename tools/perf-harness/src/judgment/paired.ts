import { median } from './growth.ts'

export type Side = 'base' | 'self' | 'candidate'

const ORDERS: readonly (readonly Side[])[] = [
  ['base', 'self', 'candidate'],
  ['self', 'candidate', 'base'],
  ['candidate', 'base', 'self'],
  ['base', 'candidate', 'self'],
  ['candidate', 'self', 'base'],
  ['self', 'base', 'candidate'],
]

export const orderOf = (round: number): readonly Side[] =>
  ORDERS[round % ORDERS.length] ?? ORDERS[0]!

export type Round = Readonly<Record<Side, number>>

export const MIN_ROUNDS = 10
export const MAX_ROUNDS = 30
export const MINIMUM_CHANGE = 0.05

export type Band = Readonly<{ low: number; high: number }>

export type PairedVerdict = Readonly<{
  state: 'faster' | 'slower' | 'unchanged' | 'insufficient'
  rounds: number
  noise: Band | null
  change: Band | null
  median: number | null
  least: Readonly<Record<Side, number>> | null
  reason: string
}>

function quartiles(values: readonly number[]): Band {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (share: number): number => {
    const position = (sorted.length - 1) * share
    const below = Math.floor(position)
    const lower = sorted[below] ?? 0
    return lower + ((sorted[below + 1] ?? lower) - lower) * (position - below)
  }
  return { low: at(0.25), high: at(0.75) }
}

const within = (band: Band, change: number): boolean => band.low >= -change && band.high <= change

export function judgePaired(
  rounds: readonly Round[],
  minimumChange: number = MINIMUM_CHANGE,
): PairedVerdict {
  const usable = rounds.every(round =>
    [round.base, round.self, round.candidate].every(value => Number.isFinite(value) && value > 0),
  )
  const none = { noise: null, change: null, median: null, least: null }
  if (!usable)
    return {
      state: 'insufficient',
      rounds: rounds.length,
      ...none,
      reason: 'a round has no positive time',
    }
  if (rounds.length < MIN_ROUNDS)
    return {
      state: 'insufficient',
      rounds: rounds.length,
      ...none,
      reason: `fewer than ${String(MIN_ROUNDS)} rounds`,
    }
  const noise = quartiles(rounds.map(round => round.self / round.base - 1))
  const changes = rounds.map(round => round.candidate / round.base - 1)
  const change = quartiles(changes)
  const middle = median(changes)
  const least = {
    base: Math.min(...rounds.map(round => round.base)),
    self: Math.min(...rounds.map(round => round.self)),
    candidate: Math.min(...rounds.map(round => round.candidate)),
  }
  const read = { rounds: rounds.length, noise, change, median: middle, least }
  if (change.low > noise.high && middle >= minimumChange)
    return { state: 'slower', ...read, reason: 'outside the noise and above the minimum change' }
  if (change.high < noise.low && middle <= -minimumChange)
    return { state: 'faster', ...read, reason: 'outside the noise and above the minimum change' }
  if (within(noise, minimumChange) && within(change, minimumChange))
    return { state: 'unchanged', ...read, reason: 'both bands lie inside the minimum change' }
  return {
    state: 'insufficient',
    ...read,
    reason: 'the bands neither separate nor lie inside the minimum change',
  }
}

export const wantsMore = (verdict: PairedVerdict, limit: number = MAX_ROUNDS): boolean =>
  verdict.state === 'insufficient' && verdict.rounds < limit
