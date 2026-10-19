// The state that the scripted provider keeps in one closure, and the small rules that every
// operation shares: which tenant and call an input addresses, whether the principal still holds
// the right to act, and how a change reaches the observers.
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type {
  CallState,
  ControlState,
  CustodyState,
  DispatchRecord,
  DurableEvidence,
  ModelBlock,
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

/** The phase of a call; a settled call also keeps the result that its pages are cut from. */
export type Lifecycle =
  | Exclude<PublicPhase, { phase: 'settled' }>
  | (Extract<PublicPhase, { phase: 'settled' }> &
      Readonly<{ pages: Readonly<{ blocks: readonly ModelBlock[]; pageSize: number }> }>)

export type SettledLifecycle = Extract<Lifecycle, { phase: 'settled' }>

export type ObservationEnd = 'stale-instance' | 'denied' | 'unavailable'

/** One open observation of a call. `ended` is set by the script; the stream reads it. */
export type Subscription<P> = {
  readonly principal: P
  ended: ObservationEnd | null
  wake: (() => void) | null
}

export type ReadRecord = {
  readonly read: ReadId
  /** The settled call that the pages of this read are cut from. */
  readonly source: SettledLifecycle
  /** What the read was begun with; a repeat of the same operation must match it. */
  readonly parameters: unknown
  ended: Extract<ReadState, { kind: 'ended' }>['reason'] | null
  /** The last page has been served, so closing the read is a completion. */
  exhausted: boolean
  /** The `next` values served so far: the only values `readNext` accepts as `after`. */
  readonly issued: Set<string>
}

export type CallRecord<P> = {
  readonly tenant: TenantId
  /** The tenant as `scopeOf` gives it; two tenants are the same exactly when their scopes are. */
  readonly scope: string
  readonly call: ModelCallId
  readonly admission: ModelOperationId
  readonly consumer: ConsumerRef
  /** Counts every change of the call; the revision and the output cursor are both built from it. */
  revision: number
  lifecycle: Lifecycle
  control: ControlState
  custody: CustodyState
  blocks: readonly VisibleBlock[]
  dispatches: readonly DispatchRecord[]
  /** The instance that serves the call now, or null after the instance left. */
  instance: ModelInstanceId | null
  readonly handles: Map<ModelInstanceId, ModelHandle<P>>
  readonly observers: Set<Subscription<P>>
  readonly reads: Map<ReadId, ReadRecord>
  /** The blocks that upstream facts have built; `blocks` is cut from it when the script plays facts. */
  readonly fill: FillTable
  /**
   * The evidence that the script gave for acknowledging the call. When it is empty, any evidence
   * is taken; otherwise only one of these is.
   */
  readonly evidence: DurableEvidence[]
}

/**
 * What the provider remembers of an accepted operation, to recognise or reject a repeat. Each
 * method has its own set of parameter members, so an operation used for another method never
 * matches.
 */
export type OperationEntry<P> = Readonly<{
  record: CallRecord<P>
  parameters: unknown
  /** The revision of the call when the operation took effect. */
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
  /** Scripted unknown commits, keyed by tenant, action and operation; each is used once. */
  readonly unknownWrites: Map<string, CommitUnknownScript>
  /**
   * Operations whose commit query stays unknown until the same operation is sent again, keyed
   * by tenant and operation. The value is the call that sent the operation: only a query that
   * names that call sees the operation, as with every other answer about an operation.
   */
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

/** The tenant as text, or null for a value that did not come from the legal-identity package. */
export function scopeOf(tenant: TenantId): string | null {
  const encoded = tenantCodec.encode(tenant)
  return encoded.ok ? encoded.value : null
}

/** A key for a name inside a tenant; the JSON keeps one pair from colliding with another. */
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

/** The call of a tenant, or null. A tenant that is not a legal identity has no calls. */
export function findCall<P>(
  core: Core<P>,
  tenant: TenantId,
  call: ModelCallId,
): CallRecord<P> | null {
  const scope = scopeOf(tenant)
  return scope === null ? null : (core.records.get(scoped(scope, call)) ?? null)
}

export type Target<P> = Readonly<{ scope: string; record: CallRecord<P> | null }>

/**
 * The tenant and call an input addresses, or null when the principal may not act on it. A call
 * of another tenant is not found, so the answer does not tell whether it exists.
 */
export function resolve<P>(
  core: Core<P>,
  input: CallAccess<P>,
  action: ScriptedAction,
): Target<P> | null {
  const scope = scopeOf(input.tenant)
  if (scope === null || isRevoked(core, scope, input.call, input.principal, action)) return null
  return { scope, record: core.records.get(scoped(scope, input.call)) ?? null }
}

/** The call, or null when the input is denied or addresses no call. */
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

/**
 * A repeat of a held operation by the call that sent it is the retry that settles its commit
 * query. The same operation sent for another call is a write of its own and settles nothing.
 */
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

/** Counts one change of the call and tells the observers. */
export function commit<P>(record: CallRecord<P>): void {
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
