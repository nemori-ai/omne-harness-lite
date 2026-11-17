import type {
  AgentJournal,
  AgentOperationId,
  CallerCommit,
  ConsumptionId,
  DurableEvidence,
  Failure,
  ResultResponsibility,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { canonical } from '../canonical.ts'
import { semanticKey } from './journal-values.ts'
import type { MemoryExecution } from './journal.ts'

// The caller side of a commit in the memory Journal: which result responsibility a compaction
// commit consumes, whether it is the current unprocessed one, and how its completion is recorded.

export const conflict = (operation: AgentOperationId): Extract<Failure, { kind: 'conflict' }> => ({
  kind: 'conflict',
  operation,
})
export const invalid = (field: string, reason: string): Failure => ({
  kind: 'invalid',
  field,
  reason,
})

export function copy<T>(value: T): T {
  return structuredClone(value)
}

export function sameValue(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}

type Consumed = Readonly<{ result: ResultResponsibility['result']; consumption: ConsumptionId }>

export type CheckedCaller = Readonly<{
  consumed: Consumed | null
  index: number
  responsibility: ResultResponsibility | undefined
}>

function consumedBy(caller: CallerCommit): Consumed | null {
  if (caller.kind === 'processed' && caller.result.producer.kind === 'compaction') return caller
  if (caller.kind !== 'context-transition') return null
  const adopted = caller.value
  return {
    result: {
      producer: { kind: 'compaction', task: adopted.task },
      version: adopted.result.version,
      delivery: null,
      source: adopted.result.evidence,
    },
    consumption: adopted.consumption,
  }
}

export function checkedCaller<P>(
  execution: MemoryExecution,
  input: Parameters<AgentJournal<P>['commit']>[0],
): Outcome<CheckedCaller, Failure> {
  const caller = input.caller
  const consumed = consumedBy(caller)
  const index =
    consumed === null
      ? -1
      : execution.results.findIndex(
          item =>
            sameValue(item.result, consumed.result) && item.consumption === consumed.consumption,
        )
  const responsibility = execution.results[index]
  if (consumed !== null && responsibility === undefined)
    return fail(invalid('caller', 'the result has no durable consumer responsibility'))
  if (caller.kind === 'context-transition') {
    const adopted = caller.value
    const task = execution.checkpoint.compaction
    if (
      task === null ||
      !sameValue(task.task, adopted.task) ||
      task.consumption !== adopted.consumption ||
      !sameValue(task.result, adopted.result) ||
      !sameValue(task.received, adopted.received) ||
      !sameValue(responsibility?.custody, adopted.received) ||
      execution.checkpoint.requestPreparation?.id !== adopted.preparation ||
      responsibility?.completion !== null
    )
      return fail(invalid('caller', 'the compaction result is not the current unprocessed result'))
  }
  if (
    consumed !== null &&
    caller.kind === 'processed' &&
    responsibility?.completion !== null &&
    !sameValue(responsibility?.completion, caller.completion)
  )
    return fail(conflict(input.operation))
  return succeed({ consumed, index, responsibility })
}

export function recordCompletion(
  execution: MemoryExecution,
  checked: CheckedCaller,
  caller: CallerCommit,
  evidence: DurableEvidence,
  revision: number,
): void {
  const { consumed, responsibility } = checked
  if (consumed === null || responsibility === undefined) return
  execution.results[checked.index] = {
    ...responsibility,
    completion: caller.kind === 'processed' ? copy(caller.completion) : evidence,
  }
  execution.resultRevisions.set(
    semanticKey('responsibility', [
      consumed.result.producer,
      consumed.result.version,
      consumed.consumption,
    ]),
    revision,
  )
}
