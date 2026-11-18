import type { DurableEvidence, InputBatchId } from '@omne-harness/agent-contract'
import { takenRange, type Batch, type Range } from '../journal/inputs.ts'
import type { MemoryExecution } from './journal.ts'
import { journalEvidence } from './journal-values.ts'

// The input ranges of an execution: which inputs a batch took, and where a watermark stands.

type Memo = { batches: Map<InputBatchId, Range>; watermarks: Map<string, Range> }

// Memos of the ranges an execution minted or took, one per execution: ids and records encode them.
// A core built from records learns the batches it still holds, then each one it mints or takes.
export function createInputRanges(
  namespace: string,
  keyOf: (execution: MemoryExecution) => string,
) {
  const memos = new Map<string, Memo>()
  const memo = (execution: MemoryExecution): Memo => {
    const at = keyOf(execution)
    let value = memos.get(at)
    if (value === undefined) {
      const learned: Memo = { batches: new Map(), watermarks: new Map() }
      const learn = (batch: Batch): void => {
        const range = takenRange(execution, batch)
        if (range !== undefined) learned.batches.set(batch.id, range)
      }
      // The events the record still holds (forEach skips the closed ones), and the batch in hand.
      execution.events.forEach(event => {
        if (event.body.kind === 'input-taken') learn(event.body.batch)
      })
      if (execution.checkpoint.inputBatch !== null) learn(execution.checkpoint.inputBatch)
      value = learned
      memos.set(at, value)
    }
    return value
  }
  const inputBoundary = (execution: MemoryExecution): Range => {
    const taken = execution.checkpoint.inputBatch
    const range = taken === null ? undefined : memo(execution).batches.get(taken.id)
    if (taken !== null && range === undefined)
      throw new Error('original input batch range is unavailable')
    return { from: range?.to ?? 0, to: execution.inputs.length }
  }
  return {
    minted(execution: MemoryExecution, id: InputBatchId, range: Range): void {
      memo(execution).batches.set(id, range)
    },
    taken(execution: MemoryExecution, batch: Batch): void {
      const range = takenRange(execution, batch)
      if (range !== undefined) memo(execution).batches.set(batch.id, range)
    },
    inputBoundary,
    takenFrom(execution: MemoryExecution): number {
      const taken = execution.checkpoint.inputBatch
      return taken === null ? 0 : (memo(execution).batches.get(taken.id)?.from ?? 0)
    },
    watermarkRange(execution: MemoryExecution, record: string): Range | undefined {
      const issued = memo(execution).watermarks.get(record)
      if (issued !== undefined) return issued
      const prefix = `${namespace}/${execution.id}/inputs/`
      if (!record.startsWith(prefix)) return undefined
      const match = /^(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/.exec(record.slice(prefix.length))
      if (match === null) return undefined
      const from = Number(match[1])
      const to = Number(match[2])
      if (to < from || to > execution.inputs.length) return undefined
      if (from !== 0 && ![...memo(execution).batches.values()].some(range => range.to === from))
        return undefined
      const range = { from, to }
      memo(execution).watermarks.set(record, range)
      return range
    },
    watermarkOf(execution: MemoryExecution): DurableEvidence {
      const range = inputBoundary(execution)
      const evidence = journalEvidence(
        `${namespace}/${execution.id}/inputs/${range.from}-${range.to}`,
        range.to,
      )
      memo(execution).watermarks.set(evidence.record, range)
      return evidence
    },
  }
}
