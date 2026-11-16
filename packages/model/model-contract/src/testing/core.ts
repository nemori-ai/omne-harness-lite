import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type {
  CallContact,
  CallState,
  ModelInvocationRef,
  ControlState,
  CustodyState,
  DispatchRecord,
  DurableEvidence,
  ResultPart,
  ModelFailure,
  ModelHandle,
  Settlement,
  Snapshot,
  VisibleBlock,
  ReadState,
} from '../index.ts'
import { MODEL_IDENTITY_PREFIXES } from '../identity-values.ts'
import type { FillTable } from './reduce.ts'
import type {
  CallAccess,
  ConsumerRef,
  DispatchId,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  ReadId,
} from '../root.ts'
import { mintCursor, mintRevision } from './mint.ts'

export type ScriptedAction =
  | 'admit'
  | 'inspect'
  | 'dispatches'
  | 'cancel'
  | 'connect'
  | 'observe'
  | 'read'
  | 'acknowledge'
  | 'query'

type FirstContent = 'none-proven' | 'observed' | 'uncertain'

type PublicPhase =
  | Readonly<{ phase: 'accepted' }>
  | Readonly<{ phase: 'running'; dispatch: DispatchId; firstContent: FirstContent }>
  | Readonly<{ phase: 'settled'; settlement: Settlement }>

export type Lifecycle =
  | Exclude<PublicPhase, { phase: 'settled' }>
  | (Extract<PublicPhase, { phase: 'settled' }> &
      Readonly<{
        pages: Readonly<{ parts: readonly ResultPart[]; pageSize: number; pageTargetBytes: number }>
      }>)

export type SettledLifecycle = Extract<Lifecycle, { phase: 'settled' }>

export type ObservationEnd = 'stale-instance' | 'denied' | 'unavailable'

export type Subscription<P> = {
  readonly principal: P
  ended: ObservationEnd | null
  wake: (() => void) | null
}

export type ReadRecord = {
  readonly read: ReadId
  readonly source: SettledLifecycle
  readonly parameters: unknown
  ended: Extract<ReadState, { kind: 'ended' }>['reason'] | null
  exhausted: boolean
  readonly issued: Set<string>
}

export type CallRecord<P> = {
  readonly tenant: TenantId
  readonly scope: string
  readonly call: ModelCallId
  readonly admission: ModelOperationId
  readonly reference: ModelInvocationRef
  readonly consumer: ConsumerRef
  revision: number
  lifecycle: Lifecycle
  control: ControlState
  custody: CustodyState
  blocks: readonly VisibleBlock[]
  dispatches: readonly DispatchRecord[]
  instance: ModelInstanceId | null
  readonly handles: Map<ModelInstanceId, ModelHandle<P>>
  readonly observers: Set<Subscription<P>>
  readonly reads: Map<ReadId, ReadRecord>
  readonly fill: FillTable
  readonly evidence: DurableEvidence[]
  contact: CallContact | null
}

export type OperationEntry<P> = Readonly<{
  record: CallRecord<P>
  parameters: unknown
  revision: number
}>

export type Revocation<P> = Readonly<{
  principal: P
  actions: 'all' | readonly ScriptedAction[]
}>

export type CommitUnknownScript = Readonly<{
  effect: 'applied' | 'dropped'
  query: 'answers' | 'stays-unknown'
}>

export type Core<P> = {
  readonly instance: ModelInstanceId
  readonly samePrincipal: (left: P, right: P) => boolean
  readonly records: Map<string, CallRecord<P>>
  readonly operations: Map<string, OperationEntry<P>>
  readonly readsByOperation: Map<string, ReadRecord>
  readonly revocations: Map<string, Revocation<P>[]>
  readonly unknownWrites: Map<string, CommitUnknownScript>
  readonly heldQueries: Map<string, ModelCallId>
  state: { quiescing: boolean; directoryDown: boolean; reads: number }
}

export function createCore<P>(input: {
  instance: ModelInstanceId
  samePrincipal: (left: P, right: P) => boolean
}): Core<P> {
  return {
    instance: input.instance,
    samePrincipal: input.samePrincipal,
    records: new Map(),
    operations: new Map(),
    readsByOperation: new Map(),
    revocations: new Map(),
    unknownWrites: new Map(),
    heldQueries: new Map(),
    state: { quiescing: false, directoryDown: false, reads: 0 },
  }
}

export function scopeOf(tenant: TenantId): string | null {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : null
}

export function scoped(scope: string, name: string): string {
  return JSON.stringify([scope, name])
}

export function denied(action: string): Outcome<never, ModelFailure> {
  return fail({ kind: 'denied', action })
}

export function isRevoked<P>(
  core: Core<P>,
  scope: string,
  call: ModelCallId,
  principal: P,
  action: ScriptedAction,
): boolean {
  const revoked = core.revocations.get(scoped(scope, call)) ?? []
  return revoked.some(
    revocation =>
      (revocation.actions === 'all' || revocation.actions.includes(action)) &&
      core.samePrincipal(revocation.principal, principal),
  )
}

export function findCall<P>(
  core: Core<P>,
  tenant: TenantId,
  call: ModelCallId,
): CallRecord<P> | null {
  const scope = scopeOf(tenant)
  return scope === null ? null : (core.records.get(scoped(scope, call)) ?? null)
}

export type Target<P> = Readonly<{ scope: string; record: CallRecord<P> | null }>

export function resolve<P>(
  core: Core<P>,
  input: CallAccess<P>,
  action: ScriptedAction,
): Target<P> | null {
  const scope = scopeOf(input.tenant)
  if (scope === null || isRevoked(core, scope, input.call, input.principal, action)) return null
  return { scope, record: core.records.get(scoped(scope, input.call)) ?? null }
}

export function openCall<P>(
  core: Core<P>,
  input: CallAccess<P>,
  action: ScriptedAction,
): CallRecord<P> | null {
  return resolve(core, input, action)?.record ?? null
}

export function isReserved(operation: ModelOperationId): boolean {
  return operation.slice(MODEL_IDENTITY_PREFIXES.ModelOperationId.length).startsWith('--')
}

export function reservedOperation(field: string): Outcome<never, ModelFailure> {
  return fail({
    kind: 'invalid',
    field,
    reason: 'operation values that start with -- are reserved',
  })
}

export function retried<P>(
  core: Core<P>,
  scope: string,
  operation: ModelOperationId,
  call: ModelCallId,
): void {
  const key = scoped(scope, operation)
  if (core.heldQueries.get(key) === call) core.heldQueries.delete(key)
}

export function notify<P>(record: CallRecord<P>): void {
  for (const subscription of record.observers) subscription.wake?.()
}

export function commit<P>(record: CallRecord<P>): void {
  mintRevision(record.revision + 1)
  record.revision += 1
  notify(record)
}

function phaseOf(lifecycle: Lifecycle): PublicPhase {
  switch (lifecycle.phase) {
    case 'accepted':
      return { phase: 'accepted' }
    case 'running':
      return {
        phase: 'running',
        dispatch: lifecycle.dispatch,
        firstContent: lifecycle.firstContent,
      }
    case 'settled':
      return { phase: 'settled', settlement: lifecycle.settlement }
  }
}

export function stateOf<P>(record: CallRecord<P>): CallState {
  return structuredClone({
    call: record.call,
    revision: mintRevision(record.revision),
    consumer: record.consumer,
    control: record.control,
    custody: record.custody,
    ...phaseOf(record.lifecycle),
  })
}

export function snapshotOf<P>(record: CallRecord<P>): Snapshot {
  return structuredClone({
    call: record.call,
    cursor: mintCursor(record.revision),
    blocks: record.blocks,
    state: stateOf(record),
  })
}
