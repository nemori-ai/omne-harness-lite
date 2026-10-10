import { copyJsonValue, type JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  addInteger,
  checkAppendInput,
  compareInteger,
  type LogEntry,
  type OwnedLogEntry,
} from '@omne-harness-lite/session-log'
import { StorageUnavailable, type StorageUnit } from '@omne-harness-lite/storage'
import {
  inspectToolJournalEntry,
  prepareToolJournalEntry,
  projectToolJournal,
  toolJournalCallKey,
  type ToolExecutionJob,
  type ToolExecutionRecords,
  type ToolJournalPayload,
  type ToolOriginalIssueIdentity,
  type ToolOriginalIssueSupport,
} from '@omne-harness-lite/tool-execution-runtime'
import { sameJson } from './json-values.ts'

type Transition = Parameters<ToolExecutionRecords['stageTransitionIn']>[2][number]
type Result = Awaited<ReturnType<ToolExecutionRecords['stageTransitionIn']>>
type Input = {
  readonly support: ToolOriginalIssueSupport
  readonly identity: ToolOriginalIssueIdentity
  readonly job: ToolExecutionJob
  readonly isOpen: () => boolean
  readonly verifyIn: (unit: StorageUnit) => Promise<boolean>
}

function prepare(input: Input, supplied: readonly Transition[]) {
  const copied = copyJsonValue(supplied)
  if ('failed' in copied || !Array.isArray(copied.ok) || copied.ok.length === 0) return
  const entries: OwnedLogEntry[] = []
  for (const value of copied.ok as unknown as readonly ToolJournalPayload[]) {
    if (
      !value ||
      !sameJson(value.ref, input.identity.ref) ||
      ['execution_intended', 'execution_started', 'delivery_confirmed'].includes(value.kind)
    )
      return
    const record = prepareToolJournalEntry({ origin: input.identity.origin, value })
    if ('invalid' in record) return
    entries.push(record.entry)
  }
  if (new Set(entries.map(entry => entry.dedupeKey)).size !== entries.length) return
  return entries
}

function recognize(
  entries: readonly LogEntry[],
  proposed: readonly OwnedLogEntry[],
): Result | undefined {
  const seen = proposed.map(value => entries.find(entry => entry.dedupeKey === value.dedupeKey))
  if (seen.every(entry => entry === undefined)) return
  const positions: JsonNumber[] = []
  for (let index = 0; index < proposed.length; index++) {
    const actual = seen[index]
    if (!actual) return { kind: 'conflict' }
    const { session: _session, position, ...owned } = actual
    if (!sameJson(owned, proposed[index])) return { kind: 'conflict' }
    if (index > 0 && compareInteger(position, addInteger(positions[index - 1]!, 1)) !== 0)
      return { kind: 'conflict' }
    positions.push(position)
  }
  return { kind: 'recognized', positions }
}

export function createToolExecutionTransitions(
  input: Input,
): Pick<ToolExecutionRecords, 'stageTransitionIn' | 'terminalIn'> {
  const { support, identity } = input
  const scope = { tenant: identity.ref.tenant, session: identity.ref.session }
  const key = toolJournalCallKey(identity.ref.callId)
  if (typeof key !== 'string') throw new TypeError('invalid original Tool record key')
  const ownKey: string = key

  async function read(unit: StorageUnit) {
    unit.assertStorage(support.storage)
    if (!(await input.verifyIn(unit))) return { kind: 'invalidSource' } as const
    const source = await support.log.sourceIn(unit, support.access, scope)
    if ('failure' in source) return { kind: 'unavailable' } as const
    const records = await support.log.readByKeyIn(unit, support.access, source.source, ownKey)
    if ('failure' in records) return { kind: 'unavailable' } as const
    for (const entry of records.entries) {
      const checked = inspectToolJournalEntry(scope, entry)
      if (!('value' in checked) || checked.value.ref.callId !== identity.ref.callId)
        return { kind: 'invalidSource' } as const
    }
    const projected = projectToolJournal(scope, records.entries)
    if ('invalid' in projected) return { kind: 'invalidSource' } as const
    const history = projected.executions.get(identity.ref.callId)
    return history
      ? { kind: 'found' as const, history, entries: records.entries, source: source.source }
      : { kind: 'invalidSource' as const }
  }

  async function stage(unit: StorageUnit, entries: readonly OwnedLogEntry[]): Promise<Result> {
    const current = await read(unit)
    if (current.kind !== 'found') return current
    if (!input.isOpen()) return { kind: 'unavailable' }
    const existing = recognize(current.entries, entries)
    if (existing) return existing
    let tail = current.source.tail
    const next = entries.map(entry => ({
      ...entry,
      session: scope.session,
      position: (tail = addInteger(tail, 1)),
    }))
    if ('invalid' in projectToolJournal(scope, [...current.entries, ...next]))
      return { kind: 'conflict' }
    const batch = checkAppendInput(
      scope.session,
      entries,
      { kind: 'unfenced' },
      { kind: 'tailEquals', tail: current.source.tail },
    )
    if ('failure' in batch) return { kind: 'invalidSource' }
    const appended = await support.log.appendIn(unit, support.access, batch.ok, current.source)
    if ('failure' in appended)
      return { kind: appended.failure === 'unavailable' ? 'unavailable' : 'conflict' }
    return { kind: 'staged', positions: appended.entries.map(entry => entry.position) }
  }

  return Object.freeze<Pick<ToolExecutionRecords, 'stageTransitionIn' | 'terminalIn'>>({
    async stageTransitionIn(unit, candidate, values) {
      if (candidate !== input.job) return { kind: 'invalidSource' }
      if (!input.isOpen()) return { kind: 'unavailable' }
      const entries = prepare(input, values)
      if (!entries) return { kind: 'invalidSource' }
      try {
        return await unit.run(() => stage(unit, entries))
      } catch (error) {
        if (error instanceof StorageUnavailable) return { kind: 'unavailable' }
        throw error
      }
    },
    async terminalIn(unit, original) {
      if (!sameJson(original, identity)) return { kind: 'invalidSource' }
      try {
        const current = await unit.run(() => read(unit))
        if (current.kind !== 'found') return current
        return current.history.terminal
          ? { kind: 'found', terminal: current.history.terminal }
          : { kind: 'absent' }
      } catch (error) {
        if (error instanceof StorageUnavailable) return { kind: 'unavailable' }
        throw error
      }
    },
  })
}
