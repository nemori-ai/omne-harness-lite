import type { JsonValue } from '@omne-harness/json-text'
import type { Access, TenantId } from '@omne-harness/legal-identity'
import type { Ack, Outcome } from '@omne-harness/operation-result'
import type {
  AdoptionRevision,
  ConnectionTarget,
  CorrelationKey,
  CredentialBinding,
  EndpointHolding,
  Generation,
  TaskId,
} from './brands.ts'
import type { ActionCatalogRecord, ExpectedRevision } from './catalog.ts'
import type { BlockedReason } from './outcomes.ts'
import type { CatalogKey, EndpointRef, EndpointSettings, PeerAccount, Untrusted } from './values.ts'

export type AdoptedEndpoint = Readonly<{
  ref: EndpointRef
  revision: AdoptionRevision
  body: JsonValue
  settings: EndpointSettings
}>

export interface AdoptionView<P, S> {
  endpoints(access: Access<P>, scope: S): Promise<Outcome<readonly AdoptedEndpoint[], 'unknown'>>
  endpoint(
    access: Access<P>,
    ref: EndpointRef,
  ): Promise<Outcome<AdoptedEndpoint | 'not-adopted', 'unknown'>>
}

export type EligibilityVerdict =
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'refused'; reason: 'not-eligible' | BlockedReason }>
  | Readonly<{ kind: 'unknown' }>

export interface UseEligibility<P> {
  check(access: Access<P>, endpoint: EndpointRef): Promise<EligibilityVerdict>
}

export type HttpPurpose = Readonly<{ kind: 'http-authorization'; target: ConnectionTarget }>

/** How the peer refused a credential it was shown: a 401, or a 403 that names the scopes it wants. */
export type CredentialRefusal =
  | Readonly<{ kind: 'unauthorized' }>
  | Readonly<{ kind: 'insufficient-scope'; scopes: readonly string[] }>

export interface HttpCredentialHandle {
  readonly purpose: 'http-authorization'
  authorize(headers: Headers): Promise<Ack<'rejected' | 'unknown'>>
  reportRejection(refusal: CredentialRefusal): Promise<void>
  release(): Promise<void>
}

export type CredentialFailure = 'missing' | 'rejected' | 'unknown'

export interface CredentialUse<P> {
  acquire(
    access: Access<P>,
    holding: EndpointHolding,
    purpose: HttpPurpose,
    binding: CredentialBinding,
  ): Promise<Outcome<HttpCredentialHandle, CredentialFailure>>
}

export interface McpClock {
  now(): Date
}

/** One checkpoint of a suspended call: the tenant it belongs to and the digest of its state. */
export type ContinuationKey = Readonly<{ tenant: TenantId; checkpoint: string }>

/** Marks that the continuation of a checkpoint was sent; a mark stays, so a second run of the same checkpoint sends nothing. */
export interface ContinuationRecords {
  mark(key: ContinuationKey): Promise<Outcome<'marked' | 'already', 'unavailable'>>
}

export type TaskRowKey = Readonly<{
  tenant: TenantId
  principalKey: string
  holding: EndpointHolding
  taskId: TaskId
}>

export type TaskArrival =
  | Readonly<{ kind: 'terminal'; status: 'completed' | 'failed' | 'cancelled' }>
  | Readonly<{ kind: 'input'; inputRequests?: Untrusted<JsonValue> }>
  | Readonly<{ kind: 'expired' }>
  | Readonly<{ kind: 'unknown' }>

export type TaskRowState = 'following' | 'awaiting' | 'arrived' | 'dropped'

export type TaskRow = Readonly<{
  account: PeerAccount
  issuedAt: Generation
  call: CorrelationKey
  state: TaskRowState
  round: number
  arrival?: TaskArrival
  outputSchema?: JsonValue
  pollIntervalMs?: number
  expiresAt?: number
}>

export type TaskRowStep = Readonly<{ state: TaskRowState; round: number; arrival?: TaskArrival }>

/** The durable task table: a row is there before a call waits on its task; a move happens only from the step it names. */
export interface TaskRecords {
  record(key: TaskRowKey, row: TaskRow): Promise<Outcome<'recorded', 'unavailable'>>
  read(key: TaskRowKey): Promise<Outcome<TaskRow | 'absent' | 'ambiguous', 'unavailable'>>
  move(
    key: TaskRowKey,
    from: Pick<TaskRowStep, 'state' | 'round'>,
    to: TaskRowStep,
  ): Promise<Outcome<'moved' | 'stale', 'unavailable'>>
  following(
    tenant: TenantId,
  ): Promise<Outcome<readonly Readonly<{ key: TaskRowKey; row: TaskRow }>[], 'unavailable'>>
}

export interface CatalogStore {
  read(key: CatalogKey): Promise<Outcome<ActionCatalogRecord | 'absent', 'unavailable'>>
  write(
    key: CatalogKey,
    record: ActionCatalogRecord,
    expected: ExpectedRevision,
  ): Promise<Ack<'unavailable' | 'revision-conflict'>>
}
