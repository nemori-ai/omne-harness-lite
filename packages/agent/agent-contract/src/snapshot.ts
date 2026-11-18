import type { AgentCheckpoint } from './evaluation.ts'
import type { ExecutionSnapshot, ExecutionState, ResultResponsibility } from './execution.ts'
import type { InputId } from './identity.ts'
import type { EffectIntent, ExecutionHandoff, OriginalInputAcceptance } from './journal.ts'
import type { HandoffReference } from './passages.ts'

// The one rule of what a snapshot holds (SPEC「执行日志」): open items only, every item once the
// execution settles or has ended, because finishing reads the whole record.

type OpenItems = Pick<ExecutionSnapshot, 'results' | 'effects' | 'handoffs'>

export type OpenScope = Readonly<{
  state: ExecutionState
  checkpoint: AgentCheckpoint
  /** An accepted input is open from the batch the Agent has taken onward. */
  inputOpen(input: InputId): boolean
}>

export function finishingState(state: ExecutionState): boolean {
  return state.kind === 'settling' || state.kind === 'ended'
}

export function openResult(result: ResultResponsibility): boolean {
  return result.completion === null || result.release.kind === 'pending'
}

export function openEffect(checkpoint: AgentCheckpoint, effect: EffectIntent): boolean {
  return (
    checkpoint.calls.some(call => call.action === effect.action) ||
    (checkpoint.batch?.actions.some(action => action.id === effect.action) ?? false)
  )
}

export function sameHandoff(left: HandoffReference, right: HandoffReference): boolean {
  if (left.kind === 'execution')
    return (
      right.kind === 'execution' &&
      left.execution === right.execution &&
      left.operation === right.operation
    )
  return (
    right.kind === 'input' &&
    left.execution === right.execution &&
    left.entry === right.entry &&
    left.input === right.input
  )
}

export function openHandoff(scope: OpenScope, record: ExecutionHandoff): boolean {
  if (record.history.kind === 'pending') return true
  if (record.custody !== null && record.custody.committed === null) return true
  const { checkpoint } = scope
  const held = (reference: HandoffReference | null) =>
    reference !== null && sameHandoff(reference, record.handoff)
  if (held(checkpoint.currentHandoff)) return true
  if (checkpoint.batch?.slots.some(slot => held(slot.handoff)) ?? false) return true
  if (record.handoff.kind === 'input') return scope.inputOpen(record.handoff.input)
  return record.request.kind === 'execution' && record.request.position.step === checkpoint.step
}

export function openItems(scope: OpenScope, items: OpenItems): OpenItems {
  if (finishingState(scope.state)) return items
  return {
    results: items.results.filter(openResult),
    effects: items.effects.filter(effect => openEffect(scope.checkpoint, effect)),
    handoffs: items.handoffs.filter(record => openHandoff(scope, record)),
  }
}

type HandoffFacts = Pick<ExecutionHandoff, 'handoff' | 'request' | 'resolution' | 'history'>

/** The committed acceptance of one input among the records of an execution, open or closed. */
export function acceptanceIn(
  records: readonly HandoffFacts[],
  input: InputId,
): OriginalInputAcceptance | null {
  for (const { handoff, request, resolution, history } of records)
    if (
      handoff.kind === 'input' &&
      handoff.input === input &&
      request.kind === 'input' &&
      resolution?.kind === 'recorded' &&
      history.kind === 'committed'
    )
      return { entry: request.entry, handoff, outcome: resolution.outcome }
  return null
}
