import type {
  Access,
  Adoption,
  AgentExecutionId,
  AgentInstanceId,
  PendingCall,
} from '@omne-harness/agent-contract'
import type { BlobStore } from '../journal/index.ts'
import type { BindingView } from '../journal/view.ts'
import { needClosed, type ClosedTable } from './closed-items.ts'
import type { ModelReceptionTarget, ToolReceptionTarget } from './reception-targets.ts'
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

// A binding the store holds closed, read back by the call reference it was keyed by.
export type ClosedBinding = Readonly<{
  execution: AgentExecutionId
  instance: AgentInstanceId
  definition: Adoption
  pending: PendingCall
}>

export function closedBindingOf(
  table: ClosedTable & Readonly<{ blobs: BlobStore }>,
  execution: AgentExecutionId,
  reference: string,
): ClosedBinding | undefined {
  const body = needClosed(table, {
    execution,
    family: 'binding',
    item: reference,
  }) as BindingView | null
  if (body === null) return undefined
  const pending = table.blobs.get(body.pending.digest)
  if (pending === undefined)
    throw new TypeError(`the core holds no block for the binding of ${reference}`)
  const { instance, definition } = body
  return { execution, instance, definition, pending: structuredClone(pending) as PendingCall }
}

export const modelTargetOf = (
  closed: ClosedBinding | undefined,
): ModelReceptionTarget | undefined =>
  closed?.pending.kind === 'model'
    ? { execution: closed.execution, instance: closed.instance, pending: closed.pending }
    : undefined

export const toolTargetOf = (closed: ClosedBinding | undefined): ToolReceptionTarget | undefined =>
  closed?.pending.kind === 'tool' && closed.pending.association === 'associated'
    ? { ...closed, pending: closed.pending }
    : undefined

export const targetKey = <P>(access: Pick<Access<P>, 'tenant'>, reference: string) =>
  canonical([tenantText(access.tenant), reference])

// What the reception reads of bindings: the open ones the core holds, the closed ones by key.
export type BindingReads<P> = Readonly<{
  state(): ReceivingState
  closedBinding(
    input: Access<P> & { execution: AgentExecutionId },
    reference: string,
  ): ClosedBinding | undefined
}>

// A binding this core no longer holds open is read back by its execution and call reference.
export function closedPendings<P>(
  reads: BindingReads<P>,
  input: Access<P> & { execution: AgentExecutionId },
  reference: string,
): { execution: AgentExecutionId; pending: PendingCall }[] {
  const closed = reads.closedBinding(input, reference)
  return closed === undefined ? [] : [closed]
}

const closedTarget = <P>(reads: BindingReads<P>, input: TargetQuery<P>) =>
  input.execution === undefined
    ? undefined
    : reads.closedBinding({ ...input.access, execution: input.execution }, input.reference)

type TargetQuery<P> = Readonly<{
  access: Access<P>
  reference: string
  execution?: AgentExecutionId
}>

export const modelTarget = <P>(reads: BindingReads<P>, input: TargetQuery<P>, call: string) =>
  reads.state().callTargets.get(targetKey(input.access, call)) ??
  modelTargetOf(closedTarget(reads, input))

export const toolTarget = <P>(reads: BindingReads<P>, input: TargetQuery<P>) =>
  reads.state().toolTargets.get(targetKey(input.access, input.reference)) ??
  toolTargetOf(closedTarget(reads, input))
