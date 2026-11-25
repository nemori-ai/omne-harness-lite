import { gapTable, renderBody, renderGap, type GoalRecord } from '@omne-harness/goal-contract'
import type { Reached } from './port.ts'
import type { ArgumentsOf } from './protocol.ts'
import { answered, type Answer } from './results.ts'

const NO_GOAL = 'This session has no goal. If the person wants one, draft it and call propose.'
const BASIS = { kind: 'basis-unavailable' } as const
const UNKNOWN = { kind: 'unknown' } as const

function standing(record: GoalRecord): string {
  const { state } = record
  const used = `revision ${String(state.revision)}, ${String(state.rounds)} rounds used`
  if (state.status === 'paused') return `paused by ${state.pause.by} (${used})`
  return state.status === 'settled'
    ? `settled: ${state.outcome.kind} (${used})`
    : `in progress (${used})`
}

/** The goal as the agent reads it: where it stands, the body, the gap of each entry, and its own list. */
export function shown(record: GoalRecord | null): string {
  if (record === null) return NO_GOAL
  const gap = renderGap(gapTable(record.body, record.readings, record.state.rounds))
  return [
    `Goal: ${standing(record)}`,
    renderBody(record.body).trimEnd(),
    `## Gap\n${gap}`,
    `## Your progress list\n${JSON.stringify(record.progress)}`,
  ].join('\n\n')
}

export async function show(reached: Reached): Promise<Answer> {
  const read = await reached.goals.read(reached.caller, reached.session).catch(() => BASIS)
  return answered('show', read, shown)
}

export async function track(reached: Reached, args: ArgumentsOf<'track'>): Promise<Answer> {
  const input = { session: reached.session, patch: args.params }
  const written = await reached.goals.track(reached.caller, input).catch(() => UNKNOWN)
  return answered('track', written, record => JSON.stringify(record.progress))
}
