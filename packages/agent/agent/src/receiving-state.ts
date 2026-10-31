import type {
  Access,
  AgentAccountHandoff,
  AgentAccountOutcome,
  AgentOperationId,
  ReceivedCommitValue,
} from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { ModelDelivery } from '@omne-harness/model-contract'
import { canonical } from './canonical.ts'
import type { ModelReceptionTarget } from './receiving-types.ts'

type CommitState =
  | { kind: 'new' | 'unknown' | 'excluded' }
  | { kind: 'saved'; value: ReceivedCommitValue }
export type Reception<P> = {
  access: Access<P>
  target: ModelReceptionTarget
  binding: string
  delivery: ModelDelivery
  operation: AgentOperationId
  bytes: number
  attachments: number
  commit: CommitState
}
export type Outbound<P> = {
  access: Access<P>
  target: ModelReceptionTarget
  binding: string
  handoff: AgentAccountHandoff
} & ({ kind: 'pending' } | { kind: 'received' } | { kind: 'blocked'; reason: AgentAccountOutcome })
export type ModelReceptionDiagnostic = Readonly<{ operation: string; reason: string }>
type ScopedDiagnostic = { binding: string | null; value: ModelReceptionDiagnostic }
/** The host retains facts and actual tasks across receiver reassembly. Tasks are not durable. */
export class ModelReceiverState<P> {
  readonly receptions = new Map<string, Reception<P>>()
  readonly outbound = new Map<string, Outbound<P>>()
  readonly outletActive = new Set<string>()
  readonly outletTasks = new Map<string, Promise<void>>()
  readonly tasks = new Set<Promise<unknown>>()
  driver: symbol = Symbol('unassembled')
  readonly active = new Map<string, number>()
  readonly writing = new Set<string>()
  readonly diagnostics = new Map<string, ScopedDiagnostic>()
}
export const createModelReceiverState = <P>() => new ModelReceiverState<P>()
export type ModelReceiverReport = Readonly<{
  pending: number
  blocked: number
  diagnostics: readonly ModelReceptionDiagnostic[]
}>
export function tenantKey<P>(access: Access<P>) {
  const encoded = tenantCodec.encode(access.tenant)
  return encoded.ok ? encoded.value : ''
}
export const bindingKey = <P>(access: Access<P>, target: ModelReceptionTarget) =>
  canonical([
    tenantKey(access),
    target.execution,
    target.instance,
    target.pending.reference,
    target.pending.position,
    target.pending.consumption,
  ])
export function diagnose<P>(
  state: ModelReceiverState<P>,
  operation: string,
  reason: unknown,
  binding: string | null,
) {
  state.diagnostics.set(operation, { binding, value: { operation, reason: canonical(reason) } })
}
export function receptionReport<P>(
  state: ModelReceiverState<P>,
  scope?: ReadonlySet<string>,
): ModelReceiverReport {
  const outbound = [...state.outbound.values()].filter(item => !scope || scope.has(item.binding))
  return {
    pending:
      outbound.filter(item => item.kind === 'pending').length +
      [...state.receptions.values()].filter(
        item => item.commit.kind === 'unknown' && (!scope || scope.has(item.binding)),
      ).length,
    blocked: outbound.filter(item => item.kind === 'blocked').length,
    diagnostics: structuredClone(
      [...state.diagnostics.values()]
        .filter(item => !scope || (item.binding !== null && scope.has(item.binding)))
        .map(item => item.value),
    ),
  }
}
/** The supplied task already maps rejection to a protocol result or a retained diagnostic. */
export function retainTask<P, T>(state: ModelReceiverState<P>, task: Promise<T>): Promise<T> {
  state.tasks.add(task)
  void task.then(
    () => state.tasks.delete(task),
    () => state.tasks.delete(task),
  )
  return task
}
