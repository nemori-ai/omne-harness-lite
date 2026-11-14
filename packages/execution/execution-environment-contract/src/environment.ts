import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { AuthorityDecision, ScopeRef } from '@omne-harness/runtime-context-contract'
import type { BindingKind, EnvironmentBinding, EnvironmentContinuity } from './binding.ts'
import type { FacilityDescriptor, FacilityKey } from './facility.ts'
import type { RetainedProcessInformation } from './facilities/command.ts'
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
import type {
  FacilityGuard,
  ManagedResource,
  RecoveryAccess,
  ResourceLedger,
  SessionTerminalRetention,
} from './ports.ts'
import type { EnvironmentRequirement, IsolationClaim } from './requirement.ts'

export type PlatformFacts = Readonly<{ os: string; release: string }>

export type ProviderFacts = Readonly<{
  provider: string
  generation: string
  version: string
  platform: PlatformFacts
  facilities: readonly FacilityKey[]
  isolation: readonly IsolationClaim[]
  prerequisites: 'satisfied' | 'unsatisfied' | 'unknown'
}>

export type ProviderAcquireInput = Readonly<{
  acquisition: AcquisitionRef
  origin: OriginRef
  scope: ScopeRef
  placement: Placement
  tenant: TenantId
  ledger: ResourceLedger
  retention?: SessionTerminalRetention & { readonly released: AbortSignal }
}>

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

export type Retirement =
  | Readonly<{ kind: 'drained' }>
  | Readonly<{ kind: 'pending'; resources: readonly ManagedResource[] }>

export type ProviderQuota = Readonly<{
  unit: 'unsettled-acquisition'
  perTenant: number
  global: number | null
}>

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

export type AcquisitionSettlement =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'notAllocated' }>
  | Readonly<{ kind: 'pending'; resources: readonly ManagedResource[] }>
  | Readonly<{ kind: 'unsupported' }>
  | Readonly<{ kind: 'conflict' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'unknown' }>

export interface EnvironmentProvider {
  readonly name: string
  readonly generation: string
  readonly version: string
  readonly quotaDomain: string
  readonly bindingKinds: readonly BindingKind[]
  readonly continuity: EnvironmentContinuity
  readonly facilities: readonly FacilityKey[]
  readonly isolation: readonly IsolationClaim[]
  describe(): Promise<ProviderFacts>
  quota(tenant: TenantId): Promise<QuotaAnswer>
  acquire(input: ProviderAcquireInput): Promise<ProviderAcquisition>
  inspectAcquisition(original: OriginalAcquisition): Promise<ProviderAcquisitionStatus>
  listAcquisitions(scope: ScopeRef): Promise<AcquisitionListing>
  /** Seals the key, then compensates, waits, closes and reconciles. Never re-runs the original work. */
  settleAcquisition(original: OriginalAcquisition): Promise<AcquisitionSettlement>
  listRecoveryResources?(scope: ScopeRef): Promise<RecoveryListing>
  /** Stops a legitimate resource. It never re-grants old permits or reruns the original effect. */
  recover?(resource: ManagedResource): Promise<ResourceRecovery>
  retainedProcesses?(
    scope: ScopeRef,
    tenant: TenantId,
  ): Promise<readonly RetainedProcessInformation[] | 'unavailable'>
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

export type ResourcesRecovery = Readonly<{
  kind: 'recovered'
  scope: ScopeRef
  stopped: readonly ManagedResource[]
  pending: readonly ManagedResource[]
  unsupported: readonly ManagedResource[]
}>

export type OwnedRecovery = Readonly<{
  kind: 'recovered'
  scope: ScopeRef
  stopped: readonly ManagedResource[]
  pending: readonly ManagedResource[]
  unsupported: readonly UnsupportedRecovery[]
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
  retention?: SessionTerminalRetention
}>

export type EnvironmentAction =
  | Readonly<{ kind: 'resolve'; scope: ScopeRef }>
  | Readonly<{ kind: 'acquire'; original: OriginalAcquisition }>
  | Readonly<{ kind: 'inspect'; tenant: TenantId; acquisition: AcquisitionRef }>
  | Readonly<{ kind: 'inspect-original'; original: OriginalAcquisition }>
  | Readonly<{ kind: 'describe'; scope: ScopeRef }>
  | Readonly<{ kind: 'observe-retained'; scope: ScopeRef }>

export interface EnvironmentAuthority<P> {
  authorize(access: Access<P>, action: EnvironmentAction): Promise<AuthorityDecision<P>>
}

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
  observeRetained(
    access: Access<P>,
    scope: ScopeRef,
  ): Promise<readonly RetainedProcessInformation[] | Rejected | LookupUnknown>
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
  recoverResources(
    scope: ScopeRef,
    access: RecoveryAccess,
    resources: readonly ManagedResource[],
  ): Promise<ResourcesRecovery | Rejected | LookupUnknown>
}

export interface ProviderRegistrations {
  registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>): () => Promise<void>
  registerProvider(provider: EnvironmentProvider): () => Promise<void>
}
