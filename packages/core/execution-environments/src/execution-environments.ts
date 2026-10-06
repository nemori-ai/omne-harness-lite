import type { JsonValue } from '@omne-harness-lite/content-blocks'
import type { ContextScope } from '@omne-harness-lite/runtime-context'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'

export interface EnvironmentReference {
  readonly provider: string
  readonly reference: JsonValue
}
export interface EnvironmentRequirement {
  readonly bindingLayer: 'host_machine' | 'stateless_sandbox' | 'session_sandbox' | 'tenant_sandbox'
  readonly facilities: readonly string[]
}
export interface EnvironmentDescription {
  readonly reference: EnvironmentReference
  readonly bindingLayer: EnvironmentRequirement['bindingLayer']
  readonly facilities: readonly string[]
}
export interface CommandRequest {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly stdin?: Uint8Array
}
export interface CommandResult {
  readonly exit:
    { readonly code: number } | { readonly signal: string } | { readonly unknown: true }
  readonly stdout: Uint8Array
  readonly stderr: Uint8Array
  readonly truncated: boolean
}
export interface ProcessHandle {
  readonly result: Promise<CommandResult>
  readonly stop: (mode: 'graceful' | 'forced') => Promise<'confirmed' | 'unconfirmed'>
}
export type FacilityFailure = {
  readonly kind: 'rejected'
  readonly reason:
    'invalidInput' | 'notAuthorized' | 'closed' | 'notFound' | 'unavailable' | 'effectUnknown'
}
export interface CommandFacility {
  readonly start: (
    request: CommandRequest,
  ) => Promise<{ readonly kind: 'started'; readonly process: ProcessHandle } | FacilityFailure>
}
export interface FileFacility {
  readonly read: (
    path: string,
  ) => Promise<{ readonly kind: 'read'; readonly data: Uint8Array } | FacilityFailure>
  readonly write: (
    path: string,
    data: Uint8Array,
  ) => Promise<{ readonly kind: 'written' } | FacilityFailure>
}
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
export interface EnvironmentFacilities {
  readonly description: EnvironmentDescription
  readonly command?: CommandFacility
  readonly files?: FileFacility
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
}
export type EnvironmentAcquisition =
  | { readonly kind: 'acquired'; readonly lease: EnvironmentLease; readonly evidence: JsonValue }
  | EnvironmentRejection
export interface ExecutionEnvironmentOperations {
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
  }) => Promise<EnvironmentAcquisition>
}
/** Provider callbacks are trusted assembly inputs. All operations receive checked authority. */
export interface EnvironmentProvider extends ExecutionEnvironmentOperations {
  readonly name: string
  readonly generation: string
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
