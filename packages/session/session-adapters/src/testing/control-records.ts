import type { ControlRecord } from '@omne-harness/agent-contract'
import type { ControlView } from '../journal/index.ts'

// The record of a folded control, one variant per kind of command. A tool control always carries
// its operation: null until the control names one, never absent.
export function controlRecordOf(view: ControlView): ControlRecord {
  const { accepted, ...later } = view.stages
  if (accepted === undefined) throw new TypeError(`control ${view.control} was never accepted`)
  const fact = (stage: NonNullable<typeof accepted>) => ({
    state: stage.state,
    source: stage.source,
  })
  const stages = {
    ...Object.fromEntries(Object.entries(later).map(([stage, value]) => [stage, fact(value)])),
    accepted: fact(accepted),
  }
  const { command, control: operation } = view
  if (command.kind === 'cancel' || command.kind === 'suspend') return { operation, stages, command }
  if (command.kind === 'interrupt-model') {
    if (view.modelInvocation === null)
      throw new TypeError(`model control ${operation} names no invocation`)
    return { operation, stages, command, modelInvocation: view.modelInvocation }
  }
  if (view.toolInvocation === null)
    throw new TypeError(`tool control ${operation} names no invocation`)
  return {
    operation,
    stages,
    command,
    toolInvocation: view.toolInvocation,
    toolOperation: view.toolOperation,
  }
}
