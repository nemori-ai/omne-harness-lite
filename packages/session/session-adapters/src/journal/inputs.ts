import type { AgentExecutionId, InputBatchId, InputId } from '@omne-harness/agent-contract'
import { batchRangeOf } from '../testing/journal-values.ts'
import type { ExecutionView } from './view.ts'

// Which inputs a taken batch covers, and which inputs are still open: those of the batch the cursor
// has taken and after it.

export type Range = Readonly<{ from: number; to: number }>
export type Batch = Readonly<{ id: InputBatchId; ordered: readonly InputId[] }>

export function takenRange(
  execution: Readonly<{
    id: AgentExecutionId
    inputs: readonly (Readonly<{ id: InputId }> | undefined)[]
  }>,
  batch: Batch,
): Range | undefined {
  const [first] = batch.ordered
  if (first !== undefined) {
    const from = execution.inputs.findIndex(input => input?.id === first)
    return from < 0 ? undefined : { from, to: from + batch.ordered.length }
  }
  const named = batchRangeOf(execution.id, batch.id)
  return named !== undefined && named.from === named.to && named.to <= execution.inputs.length
    ? named
    : undefined
}

// The place the batch starts at: of its first input, or the one its id names when it is empty.
function takenFrom(view: ExecutionView, batch: Batch): number | undefined {
  const [first] = batch.ordered
  if (first !== undefined) return view.inputs.find(item => item.input === first)?.place
  const named = batchRangeOf(view.execution, batch.id)
  return named !== undefined && named.from === named.to && named.to <= view.accepted
    ? named.from
    : undefined
}

export function inputOpen(input: InputId, view: ExecutionView): boolean {
  const place = view.inputs.find(item => item.input === input)?.place
  const taken = view.cursor.inputBatch
  if (place === undefined || taken === null || taken === undefined) return true
  const step = view.steps.find(item => item.batch.id === taken)
  return step === undefined || place >= (takenFrom(view, step.batch) ?? 0)
}
