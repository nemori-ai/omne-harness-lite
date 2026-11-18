import type { AgentExecutionId, InputBatchId, InputId } from '@omne-harness/agent-contract'
import { batchIdOf } from '../testing/journal-values.ts'
import type { ExecutionView } from './view.ts'

// Which inputs a taken batch covers, and which inputs are still open: those of the batch the cursor
// has taken and after it.

export type Range = Readonly<{ from: number; to: number }>
export type Batch = Readonly<{ id: InputBatchId; ordered: readonly InputId[] }>

export function takenRange(
  execution: Readonly<{ id: AgentExecutionId; inputs: readonly Readonly<{ id: InputId }>[] }>,
  batch: Batch,
): Range | undefined {
  const [first] = batch.ordered
  if (first !== undefined) {
    const from = execution.inputs.findIndex(input => input.id === first)
    return from < 0 ? undefined : { from, to: from + batch.ordered.length }
  }
  const named = /\/batch\/(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/u.exec(String(batch.id))
  if (named === null) return undefined
  const from = Number(named[1])
  const to = Number(named[2])
  return from === to &&
    to <= execution.inputs.length &&
    batchIdOf(execution.id, from, to) === batch.id
    ? { from, to }
    : undefined
}

export function inputOpen(input: InputId, view: ExecutionView): boolean {
  const index = view.inputs.findIndex(item => item.input === input)
  const taken = view.cursor.inputBatch
  if (index < 0 || taken === null || taken === undefined) return true
  const step = view.steps.find(item => item.batch.id === taken)
  if (step === undefined) return true
  const inputs = view.inputs.map(item => ({ id: item.input }))
  return index >= (takenRange({ id: view.execution, inputs }, step.batch)?.from ?? 0)
}
