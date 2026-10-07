import type { SessionRef } from '@omne-harness-lite/messages'
import type {
  AnchoredInvocationHandle,
  ModelLogSettlementTarget,
  ModelRuntimeExecutionObservation,
  SessionRuntimeBinding,
  SettlementOwner,
} from '@omne-harness-lite/model-request-runtime'

export function captureExecutionInvocations(
  executions: readonly ModelRuntimeExecutionObservation[],
): Map<string, Set<AnchoredInvocationHandle>> {
  const captured = new Map<string, Set<AnchoredInvocationHandle>>()
  for (const execution of executions) {
    if (execution.invocation === undefined) continue
    const handles = captured.get(execution.key.callId) ?? new Set<AnchoredInvocationHandle>()
    handles.add(execution.invocation)
    captured.set(execution.key.callId, handles)
  }
  return captured
}

export function releasedExecutionCalls(
  executions: readonly ModelRuntimeExecutionObservation[],
  session: SessionRef,
  binding: SessionRuntimeBinding | undefined,
  owner: SettlementOwner,
): ReadonlySet<string> | undefined {
  const calls = new Set<string>()
  const generations = new Set<object>()
  for (const execution of executions) {
    if (
      execution.key.session !== session ||
      execution.session !== binding ||
      execution.owner !== owner ||
      !execution.released ||
      generations.has(execution.executionGeneration)
    )
      return undefined
    generations.add(execution.executionGeneration)
    calls.add(execution.key.callId)
  }
  return calls
}

/** Never choose the last container when a logical Call has several physical generations. */
export function originalExecutionInvocation(
  handles: ReadonlySet<AnchoredInvocationHandle>,
  target: ModelLogSettlementTarget,
): AnchoredInvocationHandle | undefined {
  if (handles.size === 1) return handles.values().next().value
  const matching = [...handles].filter(handle => 'facts' in handle.observedFacts(target))
  return matching.length === 1 ? matching[0] : undefined
}
