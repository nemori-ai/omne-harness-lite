import type {
  AgentExecutionId,
  AgentOperationId,
  Failure,
  HandoffOutcome,
  InitialInputs,
  InputHandoff,
  OriginalInputAcceptance,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'

/** The handoff of the initial input that follows the `admitted` ones; null when none is left. */
export function nextInitialHandoff(
  execution: AgentExecutionId,
  operation: AgentOperationId,
  initial: InitialInputs,
  admitted: number,
): Outcome<InputHandoff | null, Failure> {
  const next = initial[admitted]
  if (next === undefined) return succeed(null)
  if (initial.findIndex(input => input.id === next.id) !== admitted)
    return fail({ kind: 'invalid', field: 'initial', reason: 'an input appears twice' })
  return succeed({
    kind: 'input',
    reference: { kind: 'input', execution, entry: operation, input: next.id },
    entry: { kind: 'invoke', operation, execution, initial: next },
    source: { kind: 'external-input', input: next.id },
  })
}

export const acceptanceOf = (
  request: InputHandoff,
  outcome: HandoffOutcome,
): OriginalInputAcceptance => ({ entry: request.entry, handoff: request.reference, outcome })

export function rejectedInput(
  request: InputHandoff,
  decision: Extract<HandoffOutcome['decision'], { kind: 'rejected' }>,
): Failure {
  return {
    kind: 'invalid',
    field: 'value',
    reason: decision.reason,
    rejected: { input: request.source.input, evidence: decision.evidence },
  }
}

export const nonEmpty = <T>(list: readonly T[]): readonly [T, ...T[]] | null => {
  const [first, ...rest] = list
  return first === undefined ? null : [first, ...rest]
}
