import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type { ContextScope } from '@omne-harness-lite/runtime-context'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import type { EnvironmentFacilityMap } from './facilities.ts'
import type {
  EnvironmentBinding,
  EnvironmentCall,
  EnvironmentContinuity,
  EnvironmentPlacement,
  PlacementRead,
} from './placement.ts'

export interface EnvironmentReference {
  readonly provider: string
  readonly reference: JsonValue
}
export interface EnvironmentRequirement {
  readonly bindingLayer: 'host_machine' | 'stateless_sandbox' | 'session_sandbox' | 'tenant_sandbox'
  readonly facilities: readonly string[]
}
export type EnvironmentDescription = {
  readonly reference: EnvironmentReference
  readonly facilities: readonly string[]
  readonly instance: { readonly id: string; readonly generation: string }
  readonly continuity: EnvironmentContinuity
} & {
  [K in EnvironmentBinding['kind']]: {
    readonly bindingLayer: K
    readonly binding: Extract<EnvironmentBinding, { readonly kind: K }>
  }
}[EnvironmentBinding['kind']]
/** A provider-specific recovery reference, never a live process or a bare PID. */
export interface ManagedResource {
  readonly key: string
  readonly provider: string
  readonly reference: JsonValue
}
/** Trusted acquisition dependency. The tool receives facilities, not this write interface. */
export interface ResourceLifecycle {
  readonly closed: AbortSignal
  readonly plan: (
    resource: ManagedResource,
  ) => Promise<'recorded' | 'conflict' | 'closed' | 'unavailable'>
  /** Confirmed permission precedes the first external command effect. Unknown is unavailable. */
  readonly permit: (key: string) => Promise<'confirmed' | 'closed' | 'unavailable'>
  readonly stopped: (
    key: string,
    status: 'confirmed' | 'unconfirmed',
  ) => Promise<'recorded' | 'unavailable'>
}
export interface EnvironmentFacilities extends Partial<EnvironmentFacilityMap> {
  readonly description: EnvironmentDescription
}
export interface EnvironmentLease {
  readonly facilities: EnvironmentFacilities
  readonly invalidated: Promise<{ readonly reason: string }>
  /** Pending retains the provider's cleanup owner and the durable resource obligation. */
  readonly release: () => Promise<
    | { readonly kind: 'released' }
    | { readonly kind: 'pending'; readonly resources: readonly ManagedResource[] }
  >
}
export type EnvironmentAuthorization = SessionAccess
declare const recoveryBrand: unique symbol
/** Minted by the application maintenance owner; does not depend on a user's active membership. */
export interface RecoveryAccess {
  readonly [recoveryBrand]: true
}
export interface ResourceRecoveryAuthority {
  readonly authorizeRecovery: (
    access: RecoveryAccess,
    scope: ContextScope,
    resources: readonly ManagedResource[],
  ) => Promise<'authorized' | 'notAuthorized' | 'unavailable'>
}
export type EnvironmentRejection = {
  readonly kind: 'rejected'
  readonly reason:
    | 'notAuthorized'
    | 'noMatchingEnvironment'
    | 'missingFacility'
    | 'referenceExpired'
    | 'providerUnavailable'
    | 'ownerStopped'
    | 'invalidInput'
    | 'unavailable'
    | 'policyUnavailable'
    | 'placementChanged'
    | 'ambiguousEnvironment'
    | 'unsupportedFacility'
    | 'notApplicable'
}
/** Raw provider success remains provisional until the registry checks its authority. */
export type EnvironmentProviderAcquisition =
  | { readonly kind: 'acquired'; readonly lease: EnvironmentLease; readonly evidence: JsonValue }
  | EnvironmentRejection
/** Ordinary data produced by the registry, never self-issued by the physical provider. */
export interface EnvironmentAdoption {
  readonly placement: EnvironmentPlacement
  readonly source: { readonly name: string; readonly generation: string }
  readonly description: EnvironmentDescription
  readonly providerEvidence: JsonValue
}
export type EnvironmentAcquisition =
  | (Extract<EnvironmentProviderAcquisition, { readonly kind: 'acquired' }> & {
      readonly adoption: EnvironmentAdoption
    })
  | EnvironmentRejection
export type EnvironmentPlacementResolution =
  | Exclude<PlacementRead, { readonly kind: 'rejected' }>
  | {
      readonly kind: 'rejected'
      readonly reason: Exclude<EnvironmentRejection['reason'], 'notApplicable'>
    }
export interface ExecutionEnvironmentOperations {
  /** Read the current effective requirement and permission; grants no facilities. */
  readonly resolvePlacement: (
    scope: ContextScope,
    authorization: EnvironmentAuthorization,
    call: EnvironmentCall,
  ) => Promise<EnvironmentPlacementResolution>
  readonly describe: (
    scope: ContextScope,
    authorization: EnvironmentAuthorization,
  ) => Promise<
    | { readonly kind: 'descriptions'; readonly values: readonly EnvironmentDescription[] }
    | EnvironmentRejection
  >
  readonly acquire: (request: {
    readonly scope: ContextScope
    readonly authorization: EnvironmentAuthorization
    readonly reference?: EnvironmentReference
    readonly requirement: EnvironmentRequirement
    readonly resources: ResourceLifecycle
    readonly call: EnvironmentCall
  }) => Promise<EnvironmentAcquisition>
}
/** Provider callbacks are trusted assembly inputs. All operations receive checked authority. */
export interface EnvironmentProvider {
  readonly name: string
  readonly generation: string
  readonly describe: ExecutionEnvironmentOperations['describe']
  readonly acquire: (
    request: Parameters<ExecutionEnvironmentOperations['acquire']>[0] & {
      readonly placement: EnvironmentPlacement
    },
  ) => Promise<EnvironmentProviderAcquisition>
  readonly recover: (
    resource: ManagedResource,
  ) => Promise<'confirmedStopped' | 'pending' | 'unsupported'>
  readonly retire: () => Promise<
    | { readonly kind: 'drained' }
    | { readonly kind: 'pending'; readonly resources: readonly ManagedResource[] }
  >
}
export interface EnvironmentProviderRegistrations {
  readonly registerProvider: (provider: EnvironmentProvider) => () => Promise<void>
  /** Trusted recovery driver only; does not grant facilities or reauthorize old work. */
  readonly recover: (
    scope: ContextScope,
    authorization: RecoveryAccess,
    resources: readonly ManagedResource[],
  ) => Promise<
    | readonly {
        readonly resource: ManagedResource
        readonly status: 'confirmedStopped' | 'pending' | 'unsupported'
      }[]
    | EnvironmentRejection
  >
}
