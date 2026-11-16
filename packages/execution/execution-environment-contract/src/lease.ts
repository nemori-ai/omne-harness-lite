import type { JsonValue } from '@omne-harness/json-text'
import type { EnvironmentBinding, EnvironmentContinuity } from './binding.ts'
import type { EnvironmentFacilities, FacilityKey } from './facility.ts'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { AcquisitionRef, OriginRef } from './identity.ts'
import type { ManagedResource } from './ports.ts'
import type { EnvironmentRequirement } from './requirement.ts'

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
  | 'callerMismatch'
  | 'quotaExceeded'
  | 'globalCapacityExceeded'
  | 'recoveryUnready'
  | 'acquisitionConflict'
  | 'allocationNotPerformed'

export type Rejected = Readonly<{ kind: 'rejected'; reason: RejectReason }>

export type Placement = Readonly<{
  kind: 'placement'
  requirement: EnvironmentRequirement
  binding: EnvironmentBinding
  provider: ProviderIdentity
  continuity: EnvironmentContinuity
  /** The trusted capacity domain of the chosen provider; it routes the original acquisition after a rebuild. */
  quotaDomain: string
}>

export type RegistryInvalidationReason =
  | 'providerRetired'
  | 'scopeReleased'
  | 'registryClosed'
  | 'released'
  | 'providerInvalidated'

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
  facility<F extends K>(key: F): EnvironmentFacilities[F] | undefined
  readonly invalidated: Promise<LeaseInvalidation>
  release(): Promise<LeaseRelease>
}

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

export type AllocationCleanup =
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'unknown' }>

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

export type AllocationFailed = Readonly<{
  kind: 'allocationFailed'
  acquisition: AcquisitionRef
  reason: RejectReason
  cleanup: AllocationCleanup
}>

export type UnknownAcquisition = Readonly<{
  kind: 'unknown'
  acquisition: AcquisitionRef
  phase: 'preflight' | 'allocation'
}>

export type LookupUnknown = Readonly<{
  kind: 'unknown'
  cause: 'authority' | 'scope-binding' | 'provider' | 'quota'
}>

export type OriginalAcquisition = Readonly<{
  tenant: TenantId
  acquisition: AcquisitionRef
  origin: OriginRef
  scope: ScopeRef
  placement: Placement
  retentionScope?: ScopeRef
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

export type AcquisitionInspection =
  | Readonly<{ kind: 'known'; state: AcquisitionState }>
  | Readonly<{ kind: 'unrecorded' }>
  | Readonly<{ kind: 'invalidInput' }>
  | Readonly<{ kind: 'refused'; reason: 'notAuthorized' | 'callerMismatch' }>
  | Readonly<{ kind: 'queryUnavailable'; cause: QueryCause }>
  | Readonly<{ kind: 'queryUnknown'; cause: QueryCause }>
  | OriginalInspection

export type RecoveryInspection = Exclude<
  AcquisitionInspection,
  Readonly<{ kind: 'known' | 'unrecorded' }>
>
