import type { Adoption, AgentInstanceId, PendingCall } from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import { canonical } from './canonical.ts'
import type { MemoryExecution } from './journal.ts'
import type { ReceivingState } from './journal-receiving.ts'

// What a call binding makes reachable: the pending call by its reference, the execution of its
// consumer, and the reception target of a Model or Tool call.

const tenantText = (tenant: MemoryExecution['tenant']) => {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : ''
}

export function bindTarget(
  state: ReceivingState,
  execution: Pick<MemoryExecution, 'id' | 'tenant'>,
  instance: AgentInstanceId,
  definition: Adoption,
  pending: PendingCall,
): void {
  if (pending.kind === 'tool' && pending.association !== 'associated') return
  const tenant = tenantText(execution.tenant)
  const keyOf = (reference: string) => canonical([tenant, reference])
  const bindingKey = keyOf(pending.reference)
  const prior = state.pendingBindings.get(bindingKey) ?? []
  if (
    !prior.some(
      item => item.execution === execution.id && canonical(item.pending) === canonical(pending),
    )
  )
    state.pendingBindings.set(bindingKey, [
      ...prior,
      { execution: execution.id, pending: structuredClone(pending) },
    ])
  state.consumerExecutions.set(canonical([tenant, pending.position]), execution.id)
  if (pending.kind === 'tool') {
    const key = keyOf(pending.reference)
    if (!state.toolTargets.has(key))
      state.toolTargets.set(key, {
        execution: execution.id,
        instance,
        definition: structuredClone(definition),
        pending: structuredClone(pending),
      })
    return
  }
  if (pending.kind !== 'model') return
  const key = keyOf(pending.reference)
  if (state.targets.has(key)) return
  const target = { execution: execution.id, instance, pending: structuredClone(pending) }
  state.targets.set(key, target)
  const reference = resolveModelInvocationRef(pending.reference, execution.tenant)
  if ('ok' in reference) {
    const callKey = keyOf(reference.ok.call)
    if (!state.callTargets.has(callKey)) {
      state.callTargets.set(callKey, target)
      const at = canonical([tenant, execution.id])
      const originals = state.executionTargets.get(at) ?? []
      state.executionTargets.set(at, [...originals, target])
    }
  }
}
