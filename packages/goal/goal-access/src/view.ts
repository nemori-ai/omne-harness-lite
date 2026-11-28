import { gapTable, renderBody, type GapRow, type GoalRecord } from '@omne-harness/goal-contract'
import type { GoalView } from '@omne-harness/goal-protocol'
import { readJsonText, type JsonLimits, type JsonValue } from '@omne-harness/json-text'

const LIMITS: JsonLimits = Object.freeze({
  maxBytes: 1_000_000,
  maxDepth: 32,
  maxItems: 10_000,
  maxMembers: 1_000,
  maxStringLength: 100_000,
  maxNumberLength: 64,
})

function treeOf(value: unknown): JsonValue | undefined {
  const read = readJsonText(JSON.stringify(value), LIMITS)
  return read.kind === 'ok' ? read.value : undefined
}

function stateOf({ state }: GoalRecord): GoalView['state'] {
  const { status, attendance, generation, revision, rounds } = state
  const standing = { status, attendance, generation, revision, rounds }
  if (state.status === 'settled') return { ...standing, pause: null, outcome: state.outcome }
  return { ...standing, pause: state.status === 'paused' ? state.pause : null, outcome: null }
}

/** A row as goal/v1 carries it. `source` keeps the values of its first revision: a reading of the examining side is told in `reader` alone. */
function rowOf(row: GapRow): GoalView['gap'][number] {
  const { verification, source, value, ...rest } = row
  return {
    ...rest,
    source: source === 'examiner' ? null : source,
    ...(verification === null ? {} : { verification }),
    ...(source === null ? {} : { reader: source }),
    ...(value === null ? {} : { value }),
  }
}

/** A kept goal as the panel reads it, or nothing when its own data cannot be carried: never a goal with a part left out. */
export function viewOf(record: GoalRecord): GoalView | undefined {
  const body = treeOf(record.body)
  const progress = treeOf(record.progress)
  if (body === undefined || progress === undefined) return undefined
  const { examiner } = record.examination
  return {
    ...(examiner === null ? {} : { examiner }),
    state: stateOf(record),
    rendered: renderBody(record.body),
    body,
    gap: gapTable(record.body, record.readings, record.state.rounds).map(rowOf),
    progress,
    history: record.history.map(
      ({ revision, via, words, draftedBy, confirmedBy, operation, at }) => ({
        revision,
        via,
        words,
        draftedBy,
        confirmedBy,
        operation,
        at,
      }),
    ),
  }
}
