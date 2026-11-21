import type { Message } from '@omne-harness/message'
import type { SessionId } from './identity.ts'

/** A moment of the model view of a session: an epoch, the rows up to `upper`, and the log position then. */
export type ForkPoint = Readonly<{ epoch: string; upper: string; position: string }>

export type SessionFork = Readonly<{ source: SessionId; point: ForkPoint }>

/** What the source shows at a point: `rows` and `next` of its epoch (null: no such epoch, no next row). */
export type ForkFacts = Readonly<{
  rows: string | null
  next: Message['role'] | null
  current: boolean
  running: boolean
  /** No entry of the rows up to `upper` lies above this position. */
  floor: string
  tail: string
}>

export type ForkPointJudgment = 'boundary' | 'unknown-epoch' | 'out-of-bounds' | 'not-a-boundary'

const COUNT = /^[1-9][0-9]*$/u

/** A point is legal on a request boundary: before an assistant message, or the whole view of an idle source. */
export function judgeForkPoint(point: ForkPoint, facts: ForkFacts): ForkPointJudgment {
  if (facts.rows === null) return 'unknown-epoch'
  if (!COUNT.test(point.upper) || !COUNT.test(point.position)) return 'out-of-bounds'
  const upper = BigInt(point.upper)
  const position = BigInt(point.position)
  if (upper > BigInt(facts.rows)) return 'out-of-bounds'
  if (position < BigInt(facts.floor) || position > BigInt(facts.tail)) return 'out-of-bounds'
  if (facts.next === 'assistant') return 'boundary'
  const whole = facts.next === null && upper === BigInt(facts.rows)
  return whole && facts.current && !facts.running ? 'boundary' : 'not-a-boundary'
}

/** The position of the next entry a session writes: after its own last, or after the point it forked at. */
export function ownPositionAfter(last: string | null, point: ForkPoint | null): bigint {
  if (last !== null) return BigInt(last) + 1n
  return point === null ? 1n : BigInt(point.position) + 1n
}

/** The point before the latest assistant message among the newest rows a session wrote: the input of that request. */
export function forkPointAfterRows(
  epoch: string,
  newest: readonly Readonly<{ seq: string; role: string }>[],
  tail: string,
): ForkPoint | null {
  const asked = newest.findLast(row => row.role === 'assistant')
  if (asked === undefined || BigInt(asked.seq) < 2n) return null
  return { epoch, upper: String(BigInt(asked.seq) - 1n), position: tail }
}

export function forkPointText(point: ForkPoint): string {
  return JSON.stringify([point.epoch, point.upper, point.position])
}

export function parseForkPoint(text: string): ForkPoint | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(value) || value.length !== 3) return null
  const [epoch, upper, position] = value as unknown[]
  return typeof epoch === 'string' && typeof upper === 'string' && typeof position === 'string'
    ? { epoch, upper, position }
    : null
}
