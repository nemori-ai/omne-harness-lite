import type { JsonValue } from '@omne-harness/json-text'
import type { EnvironmentBinding, EnvironmentContinuity } from './binding.ts'
import type { EnvironmentFacilities, FacilityKey } from './facility.ts'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { AcquisitionRef, OriginRef } from './identity.ts'
import type { ManagedResource } from './ports.ts'
import type { EnvironmentRequirement } from './requirement.ts'

/**
 * `generation` names one registration incarnation: a provider takes a new one each time it is
 * registered. `version` is the version of the provider's code, the same for every incarnation of it.
 */
export type ProviderIdentity = Readonly<{ name: string; generation: string; version: string }>

/** A new instance with the same name never claims to be the old one. */
export type InstanceIdentity = Readonly<{ id: string; generation: string }>

export type RejectReason =
  | 'notAuthorized'
  | 'noMatchingEnvironment'
  | 'missingFacility'
  | 'unsupportedFacility'
  | 'isolationUnconfirmed'
  | 'referenceExpired'
  | 'providerUnavailable'
  | 'ownerStopped'
  | 'invalidInput'
  | 'unavailable'
  | 'ambiguousEnvironment'
  /** The caller class an assembly declared does not match the surface of the operation. */
  | 'callerMismatch'
  /** The provider's per-tenant bound refused a new unsettled acquisition: a zero-effect final answer. */
  | 'quotaExceeded'
  /** The provider's global safety bound refused a new unsettled acquisition: a zero-effect final answer. */
  | 'globalCapacityExceeded'
  /** The provider's quota or owner index is not rebuilt yet. */
  | 'recoveryUnready'
  /** The same tenant and key already name an acquisition with another fingerprint. */
  | 'acquisitionConflict'
  /** The original query proved no allocation and no late success, without an original refusal reason. */
  | 'allocationNotPerformed'

export type Rejected = Readonly<{ kind: 'rejected'; reason: RejectReason }>

/**
 * The requirement plus the chosen layer and provider. It grants neither facilities nor resources;
 * `acquire` checks it again because resolving and acquiring are not atomic.
 */
export type Placement = Readonly<{
  kind: 'placement'
  requirement: EnvironmentRequirement
  binding: EnvironmentBinding
  provider: ProviderIdentity
  continuity: EnvironmentContinuity
  /** The trusted capacity domain of the chosen provider; it routes the original acquisition after a rebuild. */
  quotaDomain: string
}>

/** Reasons the registry itself gives when it invalidates a lease. */
export type RegistryInvalidationReason =
  | 'providerRetired'
  | 'scopeReleased'
  | 'registryClosed'
  | 'released'
  | 'providerInvalidated'

/**
 * Why a lease stopped being valid. The registry names its own reasons from a closed set; a reason a
 * provider reports is carried as the provider wrote it.
 */
export type LeaseInvalidation =
  | { readonly source: 'registry'; readonly reason: RegistryInvalidationReason }
  | { readonly source: 'provider'; readonly reason: string }

export type LeaseRelease =
  | { readonly kind: 'released' }
  | { readonly kind: 'pending'; readonly resources: readonly ManagedResource[] }

export interface EnvironmentLease<K extends FacilityKey = FacilityKey> {
  readonly placement: Placement
  readonly instance: InstanceIdentity
  readonly continuity: EnvironmentContinuity
  /** Only keys of the requirement resolve; any other key gives `undefined`. */
  facility<F extends K>(key: F): EnvironmentFacilities[F] | undefined
  /** Settles when the provider retires, the scope is released, the registry closes, the environment is reclaimed at its lifetime bound, or the instance is lost or replaced. */
  readonly invalidated: Promise<LeaseInvalidation>
  /** Releases this acquisition only; a shared environment is not destroyed. */
  release(): Promise<LeaseRelease>
}

/** The canonical facility subset a tool executor receives. */
export type FacilitySet<K extends FacilityKey> = Pick<EnvironmentFacilities, K>

/** Issued by the registry, never by the provider. Provider evidence is not a self-issued permission. */
export type EnvironmentAdoption = Readonly<{
  acquisition: AcquisitionRef
  origin: OriginRef
  placement: Placement
  provider: ProviderIdentity
  instance: InstanceIdentity
  continuity: EnvironmentContinuity
  evidence: JsonValue
}>

/** Cleanup of an allocation whose adoption failed. Only `settled` returns the quota slot. */
export type AllocationCleanup =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'unknown' }>

/**
 * The stored state of one acquisition. `allocationUnknown` is a fact not known yet; a failed query
 * never overwrites a known `acquired` with it.
 */
export type AcquisitionState =
  | { readonly kind: 'acquiring' }
  | { readonly kind: 'provisional' }
  | { readonly kind: 'acquired'; readonly adoption: EnvironmentAdoption }
  | { readonly kind: 'rejected'; readonly reason: RejectReason }
  | {
      readonly kind: 'allocationFailed'
      readonly reason: RejectReason
      readonly cleanup: AllocationCleanup
    }
  | {
      readonly kind: 'invalidated'
      readonly adoption: EnvironmentAdoption
      readonly invalidation: LeaseInvalidation
    }
  | { readonly kind: 'releasing'; readonly adoption: EnvironmentAdoption }
  | {
      readonly kind: 'pendingRelease'
      readonly adoption: EnvironmentAdoption | null
      readonly resources: readonly ManagedResource[]
    }
  | { readonly kind: 'released'; readonly adoption: EnvironmentAdoption }
  | { readonly kind: 'allocationUnknown'; readonly acquisition: AcquisitionRef }
  | { readonly kind: 'settled' }

export type Acquired = Readonly<{
  kind: 'acquired'
  lease: EnvironmentLease
  adoption: EnvironmentAdoption
}>

/**
 * This call delivered no usable lease and allocated nothing again. The original acquisition may
 * still hold an allocation and its responsibilities.
 */
export type Pending = Readonly<{
  kind: 'pending'
  state: Extract<
    AcquisitionState,
    {
      readonly kind:
        | 'acquiring'
        | 'provisional'
        | 'invalidated'
        | 'releasing'
        | 'pendingRelease'
        | 'released'
        | 'settled'
    }
  >
}>

/** The provider allocated, the adoption check failed for a known reason, and cleanup is driven. No lease. */
export type AllocationFailed = Readonly<{
  kind: 'allocationFailed'
  acquisition: AcquisitionRef
  reason: RejectReason
  cleanup: AllocationCleanup
}>

/**
 * The result is not known. `preflight`: the provider was not called and the same key may be checked
 * again. `allocation`: the provider may have allocated; query the original key, never re-send.
 */
export type UnknownAcquisition = Readonly<{
  kind: 'unknown'
  acquisition: AcquisitionRef
  phase: 'preflight' | 'allocation'
}>

/** A lookup could not give a result this time. */
export type LookupUnknown = Readonly<{
  kind: 'unknown'
  cause: 'authority' | 'scope-binding' | 'provider' | 'quota'
}>

/** What the caller keeps before the provider is called: tenant, key, origin, scope and placement. */
export type OriginalAcquisition = Readonly<{
  tenant: TenantId
  acquisition: AcquisitionRef
  origin: OriginRef
  scope: ScopeRef
  placement: Placement
}>

export type AcquisitionQuery =
  | Readonly<{ kind: 'local'; acquisition: AcquisitionRef }>
  | Readonly<{ kind: 'original'; original: OriginalAcquisition }>

type QueryCause = 'authority' | 'scope-binding' | 'provider'

/** The answer of an original-acquisition query. It never carries a lease. */
export type OriginalInspection =
  | Readonly<{
      kind: 'original'
      status: 'allocated'
      original: OriginalAcquisition
      adoption: EnvironmentAdoption | null
    }>
  | Readonly<{
      kind: 'original'
      status: 'pending'
      original: OriginalAcquisition
      adoption: EnvironmentAdoption | null
      phase: 'acquiring' | 'provisional' | 'releasing'
      resources: readonly ManagedResource[]
    }>
  | Readonly<{
      kind: 'original'
      status: 'notAllocated' | 'settled' | 'conflict'
      original: OriginalAcquisition
    }>
  | Readonly<{
      kind: 'original'
      status: 'allocationFailed'
      original: OriginalAcquisition
      reason: RejectReason
      cleanup: AllocationCleanup
    }>

/**
 * The answer of a query, not a stored state. `unrecorded` means no record of the caller's tenant;
 * `invalidInput` says nothing about the key. `queryUnknown` never implies that the query allocated.
 */
export type AcquisitionInspection =
  | Readonly<{ kind: 'known'; state: AcquisitionState }>
  | Readonly<{ kind: 'unrecorded' }>
  | Readonly<{ kind: 'invalidInput' }>
  | Readonly<{ kind: 'refused'; reason: 'notAuthorized' | 'callerMismatch' }>
  | Readonly<{ kind: 'queryUnavailable'; cause: QueryCause }>
  | Readonly<{ kind: 'queryUnknown'; cause: QueryCause }>
  | OriginalInspection

/** The maintainer's query by original description: no local `known` or `unrecorded`. */
export type RecoveryInspection = Exclude<
  AcquisitionInspection,
  Readonly<{ kind: 'known' | 'unrecorded' }>
>
