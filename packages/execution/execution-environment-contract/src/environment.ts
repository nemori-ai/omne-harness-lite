import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { BindingKind, EnvironmentBinding, EnvironmentContinuity } from './binding.ts'
import type { FacilityDescriptor, FacilityKey } from './facility.ts'
import type { Access, AcquisitionRef, OriginRef } from './identity.ts'
import type {
  AcquisitionState,
  Acquired,
  EnvironmentLease,
  InstanceIdentity,
  Pending,
  Placement,
  ProviderIdentity,
  Rejected,
} from './lease.ts'
import type { FacilityGuard, ManagedResource, RecoveryAccess, ResourceLedger } from './ports.ts'
import type { EnvironmentRequirement, IsolationClaim } from './requirement.ts'

/** Facts a provider declares about where it runs. They are observations, not control. */
export type ProviderFacts = Readonly<{
  provider: string
  generation: string
  platform: string
  facilities: readonly FacilityKey[]
  isolation: readonly IsolationClaim[]
  prerequisites: 'satisfied' | 'unsatisfied'
}>

export type ProviderAcquireInput = Readonly<{
  acquisition: AcquisitionRef
  origin: OriginRef
  placement: Placement
  tenant: TenantId
  ledger: ResourceLedger
}>

/** A provider success stays provisional until the registry checks it. */
export type ProviderAcquisition =
  | Readonly<{ kind: 'acquired'; lease: EnvironmentLease; evidence: JsonValue }>
  | Rejected

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

/**
 * A provider of one or more binding layers. Without `listRecoveryResources` and `recover` the
 * provider does not support recovery.
 */
export interface EnvironmentProvider {
  readonly name: string
  readonly generation: string
  readonly bindingKinds: readonly BindingKind[]
  readonly continuity: EnvironmentContinuity
  readonly facilities: readonly FacilityKey[]
  readonly isolation: readonly IsolationClaim[]
  describe(): Promise<ProviderFacts>
  acquire(input: ProviderAcquireInput): Promise<ProviderAcquisition>
  /** Lists resources of the scope that the provider's owner index proves. Failure is not an empty list. */
  listRecoveryResources?(scope: ScopeRef): Promise<RecoveryListing>
  /** Stops a legitimate resource. It never re-grants old permits or reruns the original effect. */
  recover?(resource: ManagedResource): Promise<ResourceRecovery>
  /** Refuses new leases, closes facilities to new operations, waits for admitted ones. */
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

/** Result of one recovery drive. A failed group does not erase the groups already handled. */
export type OwnedRecovery = Readonly<{
  kind: 'recovered'
  scope: ScopeRef
  stopped: readonly ManagedResource[]
  pending: readonly ManagedResource[]
  unsupported: readonly UnsupportedRecovery[]
  /** Providers whose enumeration failed. Their resources are unknown, not absent. */
  unavailable: readonly ProviderIdentity[]
}>

export type AcquireInput<P> = Readonly<{
  acquisition: AcquisitionRef
  origin: OriginRef
  placement: Placement
  ledger: ResourceLedger
  guard: FacilityGuard<P>
}>

/** The surface of tool hosts, independent callers and maintainers. */
export interface ExecutionEnvironment<P> {
  resolvePlacement(
    access: Access<P>,
    requirement: EnvironmentRequirement,
  ): Promise<Placement | Rejected>
  acquire(access: Access<P>, input: AcquireInput<P>): Promise<Acquired | Pending | Rejected>
  inspectAcquisition(access: Access<P>, acquisition: AcquisitionRef): Promise<AcquisitionState>
  describe(
    access: Access<P>,
    scope: ScopeRef,
  ): Promise<readonly EnvironmentDescription[] | Rejected>
  recoverOwned(scope: ScopeRef, access: RecoveryAccess): Promise<OwnedRecovery | Rejected>
  releaseScope(scope: ScopeRef, access: RecoveryAccess): Promise<OwnedRecovery | Rejected>
}

/** The surface of providers and facility owners. Each call returns its own removal. */
export interface ProviderRegistrations {
  registerFacility<K extends FacilityKey>(descriptor: FacilityDescriptor<K>): () => Promise<void>
  registerProvider(provider: EnvironmentProvider): () => Promise<void>
}
