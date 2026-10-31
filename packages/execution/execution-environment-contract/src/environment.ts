import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { AuthorityDecision, ScopeRef } from '@omne-harness/runtime-context-contract'
import type { BindingKind, EnvironmentBinding, EnvironmentContinuity } from './binding.ts'
import type { FacilityDescriptor, FacilityKey } from './facility.ts'
import type { Access, AcquisitionRef, OriginRef } from './identity.ts'
import type {
  AcquisitionInspection,
  AcquisitionQuery,
  AcquisitionState,
  Acquired,
  AllocationFailed,
  EnvironmentLease,
  InstanceIdentity,
  LookupUnknown,
  OriginalAcquisition,
  Pending,
  Placement,
  ProviderIdentity,
  RecoveryInspection,
  Rejected,
  UnknownAcquisition,
} from './lease.ts'
import type { FacilityGuard, ManagedResource, RecoveryAccess, ResourceLedger } from './ports.ts'
import type { EnvironmentRequirement, IsolationClaim } from './requirement.ts'

/** The operating system a provider runs on: its type and its release. */
export type PlatformFacts = Readonly<{ os: string; release: string }>

/**
 * Facts a provider declares about where it runs. They are observations, not control.
 * `prerequisites` is `unknown` until a probe of the platform prerequisites is accepted.
 */
export type ProviderFacts = Readonly<{
  provider: string
  generation: string
  version: string
  platform: PlatformFacts
  facilities: readonly FacilityKey[]
  isolation: readonly IsolationClaim[]
  prerequisites: 'satisfied' | 'unsatisfied' | 'unknown'
}>

/** `scope` is the requester's scope; the provider indexes the resources and the acquisition under it. */
export type ProviderAcquireInput = Readonly<{
  acquisition: AcquisitionRef
  origin: OriginRef
  scope: ScopeRef
  placement: Placement
  tenant: TenantId
  ledger: ResourceLedger
}>

/**
 * A provider success stays provisional until the registry checks it. `unknown` names the original
 * key only: the allocation may have happened, and the slot stays occupied.
 */
export type ProviderAcquisition =
  | Readonly<{ kind: 'acquired'; lease: EnvironmentLease; evidence: JsonValue }>
  | Rejected
  | Readonly<{ kind: 'unknown'; acquisition: AcquisitionRef }>

export type RecoveryListing =
  | Readonly<{ kind: 'listed'; resources: readonly ManagedResource[] }>
  | Readonly<{ kind: 'unavailable' }>

export type ResourceRecovery = Readonly<{
  status: 'confirmedStopped' | 'pending' | 'unsupported'
  evidence: JsonValue | null
}>

/** `pending` may list no resource and still hold operations in flight or close responsibilities. */
export type Retirement =
  | Readonly<{ kind: 'drained' }>
  | Readonly<{ kind: 'pending'; resources: readonly ManagedResource[] }>

/**
 * The per-tenant quota a provider declares (J43). The unit is one unsettled acquisition. `perTenant`
 * 0 refuses new acquisitions; `global` null means no extra global safety bound. The values come from
 * a configurable policy, never from this contract.
 */
export type ProviderQuota = Readonly<{
  unit: 'unsettled-acquisition'
  perTenant: number
  global: number | null
}>

/** Describes the policy only; it reserves nothing. */
export type QuotaAnswer =
  | Readonly<{ kind: 'declared'; quota: ProviderQuota }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** What the provider's original record says about one acquisition. It never revives a lease. */
export type ProviderAcquisitionStatus =
  | Readonly<{ kind: 'acquired'; lease: EnvironmentLease; evidence: JsonValue }>
  | Readonly<{
      kind: 'pending'
      phase: 'acquiring' | 'provisional' | 'releasing'
      resources: readonly ManagedResource[]
    }>
  | Readonly<{ kind: 'notAllocated' }>
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** A finite and complete view of one scope; a missing directory is `unavailable`, never an empty list. */
export type AcquisitionListing =
  | Readonly<{ kind: 'listed'; acquisitions: readonly OriginalAcquisition[] }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/** Idempotent. `pending` may list no resource and still hold work in flight. */
export type AcquisitionSettlement =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'notAllocated' }>
  | Readonly<{ kind: 'pending'; resources: readonly ManagedResource[] }>
  | Readonly<{ kind: 'unsupported' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

/**
 * A provider of one or more binding layers. Without `listRecoveryResources` and `recover` the
 * provider does not support resource recovery. `acquire` and `retire` return within a bound the
 * provider itself configures; the registry sets no timer. The acquisition path (quota, query, list
 * and settle) is required: an empty resource listing never proves that no acquisition is open.
 */
export interface EnvironmentProvider {
  readonly name: string
  /** One registration incarnation: a new value for each registration. */
  readonly generation: string
  /** The version of the provider's code. */
  readonly version: string
  /** The trusted capacity domain; every registration that shares capacity shares this value. */
  readonly quotaDomain: string
  readonly bindingKinds: readonly BindingKind[]
  readonly continuity: EnvironmentContinuity
  readonly facilities: readonly FacilityKey[]
  readonly isolation: readonly IsolationClaim[]
  describe(): Promise<ProviderFacts>
  /** The quota policy for one tenant. It reserves nothing. */
  quota(tenant: TenantId): Promise<QuotaAnswer>
  /**
   * Checks the tenant and global bounds atomically and reserves one slot before the first
   * allocation. Past its own bound it releases what it allocated, then refuses with
   * `providerUnavailable`; when the release is not confirmed it answers `unknown`.
   */
  acquire(input: ProviderAcquireInput): Promise<ProviderAcquisition>
  /** Reads the original record by its full description, through the original generation or a successor. */
  inspectAcquisition(original: OriginalAcquisition): Promise<ProviderAcquisitionStatus>
  /** Lists acquisitions of the scope that still hold a slot or a close responsibility. */
  listAcquisitions(scope: ScopeRef): Promise<AcquisitionListing>
  /** Seals the key, then compensates, waits, closes and reconciles. Never re-runs the original work. */
  settleAcquisition(original: OriginalAcquisition): Promise<AcquisitionSettlement>
  /** Lists resources of the scope that the provider's owner index proves. Failure is not an empty list. */
  listRecoveryResources?(scope: ScopeRef): Promise<RecoveryListing>
  /** Stops a legitimate resource. It never re-grants old permits or reruns the original effect. */
  recover?(resource: ManagedResource): Promise<ResourceRecovery>
  /**
   * Refuses new leases, closes facilities to new operations, waits for admitted ones and for the
   * acquisition responsibilities. Past its own bound it answers `pending`.
   */
  retire(): Promise<Retirement>
}

export type EnvironmentDescription = Readonly<{
  acquisition: AcquisitionRef
  origin: OriginRef
  binding: EnvironmentBinding
  provider: ProviderIdentity
  instance: InstanceIdentity
  continuity: EnvironmentContinuity
  facilities: readonly FacilityKey[]
  state: AcquisitionState['kind']
}>

export type UnsupportedRecovery =
  | Readonly<{ kind: 'provider'; provider: ProviderIdentity }>
  | Readonly<{ kind: 'resource'; resource: ManagedResource }>

/**
 * Result of one recovery drive over both paths: resources and acquisitions. A failed group does not
 * erase the groups already handled. Released holds only when both listings were complete and every
 * resource and acquisition is settled.
 */
export type OwnedRecovery = Readonly<{
  kind: 'recovered'
  scope: ScopeRef
  stopped: readonly ManagedResource[]
  pending: readonly ManagedResource[]
  unsupported: readonly UnsupportedRecovery[]
  /** Providers whose resource or acquisition enumeration or query failed. Their state is unknown, not absent. */
  unavailable: readonly ProviderIdentity[]
  settledAcquisitions: readonly Readonly<{
    original: OriginalAcquisition
    outcome: 'settled' | 'notAllocated'
  }>[]
  pendingAcquisitions: readonly Readonly<{
    original: OriginalAcquisition
    reason: 'pending' | 'unknown'
    resources: readonly ManagedResource[]
  }>[]
  unsupportedAcquisitions: readonly OriginalAcquisition[]
}>

/**
 * The requester's scope travels with every placement and acquisition, independent of the binding
 * layer: an acquisition on the host machine or in a tenant sandbox still belongs to this scope. The
 * caller gives it explicitly; it is never built from another identifier (J17).
 */
export type PlacementInput = Readonly<{
  scope: ScopeRef
  requirement: EnvironmentRequirement
}>

export type AcquireInput<P> = Readonly<{
  acquisition: AcquisitionRef
  origin: OriginRef
  scope: ScopeRef
  placement: Placement
  ledger: ResourceLedger
  guard: FacilityGuard<P>
}>

/** The actions the environment authority decides for ordinary access. */
export type EnvironmentAction =
  | Readonly<{ kind: 'resolve'; scope: ScopeRef }>
  | Readonly<{ kind: 'acquire'; original: OriginalAcquisition }>
  | Readonly<{ kind: 'inspect'; tenant: TenantId; acquisition: AcquisitionRef }>
  | Readonly<{ kind: 'inspect-original'; original: OriginalAcquisition }>
  | Readonly<{ kind: 'describe'; scope: ScopeRef }>

/**
 * Needed port: checks ordinary access for one action. It issues no identity. `current()` of an
 * authorized answer is a required synchronous premise, as in Runtime Context.
 */
export interface EnvironmentAuthority<P> {
  authorize(access: Access<P>, action: EnvironmentAction): Promise<AuthorityDecision<P>>
}

/** The surface of tool hosts, independent callers and maintainers. */
export interface ExecutionEnvironment<P> {
  resolvePlacement(
    access: Access<P>,
    input: PlacementInput,
  ): Promise<Placement | Rejected | LookupUnknown>
  acquire(
    access: Access<P>,
    input: AcquireInput<P>,
  ): Promise<Acquired | Pending | Rejected | AllocationFailed | UnknownAcquisition>
  inspectAcquisition(access: Access<P>, query: AcquisitionQuery): Promise<AcquisitionInspection>
  inspectRecoveryAcquisition(
    access: RecoveryAccess,
    original: OriginalAcquisition,
  ): Promise<RecoveryInspection>
  describe(
    access: Access<P>,
    scope: ScopeRef,
  ): Promise<readonly EnvironmentDescription[] | Rejected | LookupUnknown>
  recoverOwned(
    scope: ScopeRef,
    access: RecoveryAccess,
    known?: readonly OriginalAcquisition[],
  ): Promise<OwnedRecovery | Rejected | LookupUnknown>
  releaseScope(
    scope: ScopeRef,
    access: RecoveryAccess,
    known?: readonly OriginalAcquisition[],
  ): Promise<OwnedRecovery | Rejected | LookupUnknown>
}

/** The surface of providers and facility owners. Each call returns its own removal. */
export interface ProviderRegistrations {
  registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>): () => Promise<void>
  registerProvider(provider: EnvironmentProvider): () => Promise<void>
}
