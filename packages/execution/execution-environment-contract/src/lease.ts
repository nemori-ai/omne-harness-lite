import type { JsonValue } from '@omne-harness/json-text'
import type { EnvironmentBinding, EnvironmentContinuity } from './binding.ts'
import type { EnvironmentFacilities, FacilityKey } from './facility.ts'
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

/**
 * State of one acquisition, by `AcquisitionRef`. `unrecorded` means this registry holds no record
 * visible to the caller; the durable record lives in the caller's ledger.
 */
export type AcquisitionState =
  | { readonly kind: 'unrecorded' }
  | { readonly kind: 'acquiring' }
  | { readonly kind: 'provisional' }
  | { readonly kind: 'acquired'; readonly adoption: EnvironmentAdoption }
  | { readonly kind: 'rejected'; readonly reason: RejectReason }
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

export type Acquired = Readonly<{
  kind: 'acquired'
  lease: EnvironmentLease
  adoption: EnvironmentAdoption
}>

/** The acquisition exists but holds no usable lease right now; nothing new was allocated. */
export type Pending = Readonly<{
  kind: 'pending'
  state: Exclude<AcquisitionState, { readonly kind: 'unrecorded' | 'acquired' | 'rejected' }>
}>
