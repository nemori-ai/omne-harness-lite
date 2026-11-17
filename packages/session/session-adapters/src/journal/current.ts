import type { AgentCheckpoint, AgentExecutionId } from '@omne-harness/agent-contract'
import type { ExecutionView } from './view.ts'
import { emptyExecutionView } from './view.ts'
import { canonical } from '../testing/canonical.ts'
import {
  CURRENT_ARRAYS as ARRAYS,
  currentArrayKey,
  type CurrentArray,
} from './current-array-key.ts'

export type CurrentRow = Readonly<{ key: string; value: string | null }>
export type CurrentChange = CurrentRow & Readonly<{ active: boolean }>

const MAPS = [
  'intents',
  'handoffs',
  'batches',
  'passages',
  'controls',
  'materials',
  'excluded',
  'rejections',
] as const
const RESULT_MEMBERS = ['consumption', 'result', 'received', 'pub'] as const
const RESULT_STAGES = ['custody', 'recorded', 'processed', 'released'] as const
const OBJECTS = ['cursor', 'cursorMoved', 'summary'] as const
const SCALARS = [
  'execution',
  'revision',
  'head',
  'gen',
  'opened',
  'adopted',
  'waits',
  'acknowledged',
  'acknowledgedAt',
  'acknowledgedPublication',
  'emitted',
] as const

export type CurrentExecution = Omit<ExecutionView, 'events' | 'ops' | 'reached'>

export function currentExecution(view: ExecutionView): CurrentExecution {
  const { events: _events, ops: _ops, reached: _reached, ...members } = view
  return members
}

export function selectCurrentExecution(
  view: ExecutionView,
  checkpoint?: AgentCheckpoint,
): CurrentExecution {
  const current = currentExecution(view)
  if (checkpoint === undefined) return current
  const roots = new Set(checkpoint?.calls.map(call => call.consumption))
  if (checkpoint?.compaction !== null && checkpoint?.compaction !== undefined)
    roots.add(checkpoint.compaction.consumption)
  for (const intent of view.intents.values())
    if (intent.step === view.cursor.step) roots.add(intent.pending.consumption)
  const results = new Map(
    [...current.results].filter(
      ([consumption, result]) =>
        roots.has(consumption) ||
        result.stages.processed === undefined ||
        (result.result.producer === 'compaction' && result.stages.released === undefined),
    ),
  )
  const intents = new Map(
    [...current.intents].filter(
      ([, intent]) =>
        roots.has(intent.pending.consumption) ||
        results.has(intent.pending.consumption) ||
        (intent.settlement === null &&
          view.results.get(intent.pending.consumption)?.stages.processed === undefined),
    ),
  )
  return { ...current, results, intents }
}

export function currentRows(view: CurrentExecution): ReadonlyMap<string, string> {
  const rows = new Map<string, string>()
  const put = (path: readonly (string | number)[], value: unknown) =>
    rows.set(JSON.stringify(path), canonical(value))
  for (const member of SCALARS) put([member], view[member])
  for (const member of ARRAYS)
    view[member].forEach((value, index) =>
      put([member, currentArrayKey(member, value)], { index, value }),
    )
  for (const member of MAPS) for (const [key, value] of view[member]) put([member, key], value)
  for (const [key, result] of view.results) {
    for (const member of RESULT_MEMBERS) put(['results', key, member], result[member])
    for (const [stage, evidence] of Object.entries(result.stages))
      put(['results', key, 'stages', stage], evidence)
  }
  for (const member of OBJECTS)
    for (const [key, value] of Object.entries(view[member])) put([member, key], value)
  for (const member of ['current', 'ended'] as const) put(['finish', member], view.finish[member])
  view.finish.candidates.forEach((value, index) =>
    put(['finish', 'candidates', value.candidate], { index, value }),
  )
  for (const member of ['lists', 'obligations'] as const)
    for (const [key, value] of view.finish[member]) put(['finish', member, key], value)
  return rows
}

export function currentChanges(
  before: ExecutionView | undefined,
  after: ExecutionView,
  selected: CurrentExecution = currentExecution(after),
): readonly CurrentChange[] {
  const previous =
    before === undefined ? new Map<string, string>() : currentRows(currentExecution(before))
  const next = currentRows(currentExecution(after))
  const active = currentRows(selected)
  const changes: CurrentChange[] = []
  for (const [key, final] of next) {
    const value = active.get(key) ?? final
    if (previous.get(key) !== value || !active.has(key))
      changes.push({ key, value, active: active.has(key) })
  }
  for (const key of previous.keys())
    if (!next.has(key)) changes.push({ key, value: null, active: false })
  return changes
}

export function executionFromRows(
  execution: AgentExecutionId,
  rows: readonly CurrentRow[],
): CurrentExecution {
  const base = currentExecution(emptyExecutionView(execution))
  const draft = { ...base, finish: { ...base.finish } } as Record<string, unknown>
  const arrays = new Set<string>(ARRAYS),
    maps = new Set<string>(MAPS),
    objects = new Set<string>(OBJECTS)
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.value === null || seen.has(row.key)) throw new Error('invalid current projection row')
    seen.add(row.key)
    const path: unknown = JSON.parse(row.key)
    const value: unknown = JSON.parse(row.value)
    if (!Array.isArray(path) || path.length < 1 || path.length > 4 || typeof path[0] !== 'string')
      throw new Error('invalid current projection key')
    const [member, key, nested, stage] = path as [string, unknown?, unknown?, unknown?]
    if (path.length === 1 && (SCALARS as readonly string[]).includes(member)) draft[member] = value
    else if (path.length === 2 && arrays.has(member) && typeof key === 'string') {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('index' in value) ||
        !('value' in value) ||
        !Number.isSafeInteger(value.index) ||
        Number(value.index) < 0 ||
        Number(value.index) >= rows.length ||
        currentArrayKey(
          member as CurrentArray,
          value.value as ExecutionView[CurrentArray][number],
        ) !== key
      )
        throw new Error('invalid current array member')
      const items = draft[member] as unknown[]
      if (items[Number(value.index)] !== undefined)
        throw new Error('duplicate current array position')
      items[Number(value.index)] = value.value
    } else if (
      path.length === 2 &&
      maps.has(member) &&
      (typeof key === 'string' || typeof key === 'number')
    )
      (draft[member] as Map<unknown, unknown>).set(key, value)
    else if (
      path.length === 2 &&
      objects.has(member) &&
      typeof key === 'string' &&
      key !== '__proto__'
    )
      (draft[member] as Record<string, unknown>)[key] = value
    else if (member === 'results' && typeof key === 'string') {
      const results = draft['results'] as Map<string, Record<string, unknown>>
      const result = results.get(key) ?? { stages: {} }
      if (
        path.length === 3 &&
        typeof nested === 'string' &&
        (RESULT_MEMBERS as readonly string[]).includes(nested)
      )
        result[nested] = value
      else if (
        path.length === 4 &&
        nested === 'stages' &&
        typeof stage === 'string' &&
        (RESULT_STAGES as readonly string[]).includes(stage)
      )
        (result['stages'] as Record<string, unknown>)[stage] = value
      else throw new Error('invalid current result key')
      results.set(key, result)
    } else if (member === 'finish') {
      const finish = draft['finish'] as Record<string, unknown>
      if (path.length === 2 && (key === 'current' || key === 'ended')) finish[key] = value
      else if (path.length === 3 && key === 'candidates' && typeof nested === 'string') {
        if (
          typeof value !== 'object' ||
          value === null ||
          !('index' in value) ||
          !('value' in value) ||
          !Number.isSafeInteger(value.index) ||
          Number(value.index) < 0 ||
          Number(value.index) >= rows.length ||
          typeof value.value !== 'object' ||
          value.value === null ||
          !('candidate' in value.value) ||
          value.value.candidate !== nested
        )
          throw new Error('invalid current candidate member')
        const candidates = finish['candidates'] as unknown[]
        if (candidates[Number(value.index)] !== undefined)
          throw new Error('duplicate current candidate position')
        candidates[Number(value.index)] = value.value
      } else if (
        path.length === 3 &&
        (key === 'lists' || key === 'obligations') &&
        typeof nested === 'string'
      )
        (finish[key] as Map<string, unknown>).set(nested, value)
      else throw new Error('invalid finish projection key')
    } else throw new Error('unknown current projection member')
  }
  for (const member of SCALARS)
    if (!seen.has(JSON.stringify([member]))) throw new Error(`missing current projection ${member}`)
  for (const member of Object.keys(base.summary))
    if (!seen.has(JSON.stringify(['summary', member])))
      throw new Error(`missing current summary ${member}`)
  const summary = draft['summary'] as Record<string, unknown>
  for (const member of ['inputs', 'requests', 'sequence', 'totalDenials', 'consecutiveDenials'])
    if (!Number.isSafeInteger(summary[member]) || Number(summary[member]) < 0)
      throw new Error(`invalid current summary ${member}`)
  if (draft['execution'] !== execution) throw new Error('current projection execution mismatch')
  for (const member of ['revision', 'head', 'emitted', 'acknowledged', 'acknowledgedAt'])
    if (!Number.isSafeInteger(draft[member]) || Number(draft[member]) < 0)
      throw new Error(`invalid current projection ${member}`)
  for (const member of ARRAYS)
    if (Array.from(draft[member] as unknown[]).some(item => item === undefined))
      throw new Error(`current projection has an array gap in ${member}`)
  if (
    Array.from((draft['finish'] as { candidates: unknown[] }).candidates).some(
      item => item === undefined,
    )
  )
    throw new Error('current projection has an array gap in candidates')
  return draft as unknown as CurrentExecution
}
