/**
 * Public provider protocols consumed by the target live-agent runtime.
 *
 * This module declares capabilities and immutable snapshots only. Its brands
 * separate protocol objects statically; a provider still has to recognize
 * candidates, registrations and generations in its own private runtime state.
 */
import type { ExactUse, GateFrame } from '@omne-harness-lite/admission'
import type { UseBinding } from '@omne-harness-lite/records'
import type {
  AgentRef,
  DefinitionVersion,
  OpaqueId,
  RunRef,
  SessionRef,
} from '@omne-harness-lite/work-data'

export type CheckDenied = Readonly<{ status: 'denied'; code: string }>
export type CheckUnavailable = Readonly<{
  status: 'unavailable'
  owner: string
  code: string
}>

/** Result of a synchronous, I/O-free check inside one active GateFrame. */
export type CheckResult =
  | Readonly<{ status: 'ready' }>
  | Readonly<{ status: 'prepare_again' }>
  | CheckDenied
  | CheckUnavailable

/** Result of work performed outside the shared admission gate. */
export type PreparationResult<T> =
  Readonly<{ status: 'prepared'; value: T }> | CheckDenied | CheckUnavailable

/** A physical cleanup result; retained bindings remain owned and inspectable. */
export type ManagedReleaseResult =
  | Readonly<{ status: 'released' }>
  | Readonly<{
      status: 'retained'
      diagnosticId: OpaqueId
      remaining: readonly UseBinding[]
    }>

export type QuiescenceResult =
  | Readonly<{ status: 'quiescent' }>
  | Readonly<{
      status: 'blocked'
      diagnosticId: OpaqueId
      remaining: readonly UseBinding[]
    }>

export type RuntimeRetireReason =
  | 'explicit_retirement'
  | 'assembly_replacement'
  | 'owner_closed'
  | 'dependency_retired'
  | 'dependency_lost'
  | 'preparation_failed'

export type FactorySelection = Readonly<{
  factoryKey: OpaqueId
  scopeIdentity: OpaqueId
  implementationVersion: OpaqueId
}>

/** Exact AR-issued identity of one registered Factory contribution. */
export type FactoryBinding = Readonly<{
  factoryKey: OpaqueId
  registrationId: OpaqueId
  generation: OpaqueId
  exactVersion: OpaqueId
  scopeIdentity: OpaqueId
}>

declare const activationPermitBrand: unique symbol

/**
 * Capability for preparation and cleanup of one already registered attempt.
 * Possessing the visible identity fields alone does not mint this capability.
 */
export type ActivationPermit = Readonly<{
  [activationPermitBrand]: true
  attemptId: OpaqueId
  session: SessionRef
  agent: AgentRef
  factory: FactoryBinding
}>

declare const workPermitBrand: unique symbol

export type RuntimeAssemblyBinding = Readonly<{
  factory: FactoryBinding
  resources: readonly RuntimeResourceBinding[]
}>

/** Exact Run epoch and actual assembly pinned by AR for one managed work lifetime. */
export type WorkPermit = Readonly<{
  [workPermitBrand]: true
  agent: AgentRef
  run: RunRef
  epoch: OpaqueId
  assembly: RuntimeAssemblyBinding
  use: ExactUse
}>

export type RuntimeAccessRequest = Readonly<{
  session: SessionRef
  agent: AgentRef
  operation: string
}>

declare const runtimeAccessPreparationBrand: unique symbol
export type RuntimeAccessPreparation = Readonly<{
  [runtimeAccessPreparationBrand]: true
}>

/** Caller-bound SR/governance adapter for current, operation-specific runtime access. */
export interface RuntimeAccess {
  prepare(request: RuntimeAccessRequest): Promise<PreparationResult<RuntimeAccessPreparation>>
  check(
    frame: GateFrame,
    preparation: RuntimeAccessPreparation,
    request: RuntimeAccessRequest,
  ): CheckResult
}

export type RuntimeAttemptControl = Readonly<{
  requestClose(reason: RuntimeRetireReason): undefined
}>

export type RuntimeAttemptRegistration = Readonly<{
  permit: ActivationPermit
  control: RuntimeAttemptControl
}>

export type AttemptRegistrationResult =
  Readonly<{ status: 'registered' }> | CheckDenied | CheckUnavailable

/** Stable host capability that owns attempt closure independently of callers. */
export interface RuntimeOwner {
  registerAttempt(frame: GateFrame, attempt: RuntimeAttemptRegistration): AttemptRegistrationResult
  closeAdmission(frame: GateFrame, reason: RuntimeRetireReason): undefined
}

declare const attachmentBrand: unique symbol

/** Exact held registration returned by the Session provider. */
export type Attachment = Readonly<{
  [attachmentBrand]: true
  attachmentRegistrationId: OpaqueId
  providerRegistrationId: OpaqueId
  providerGeneration: OpaqueId
  session: SessionRef
  agent: AgentRef
  definition: DefinitionVersion
  acquisition: Readonly<{ tenantId: OpaqueId; acquisitionId: OpaqueId }>
  factory: FactoryBinding
}>

export type AttachmentInspection =
  | Readonly<{
      status: 'held' | 'revoked' | 'releasing'
      attachment: Attachment
    }>
  | ManagedReleaseResult

/** Session-owned attachment and current activation qualification. */
export interface SessionAttachment {
  prepare(
    request: Readonly<{
      permit: ActivationPermit
      session: SessionRef
      selection: FactorySelection
    }>,
  ): Promise<PreparationResult<Attachment>>
  checkActivation(frame: GateFrame, attachment: Attachment, permit: ActivationPermit): CheckResult
  inspect(attachment: Attachment): AttachmentInspection
  release(attachment: Attachment): Promise<ManagedReleaseResult>
}

/** A driver accepting retirement has only closed new work; quiescence is separate. */
export interface Driver {
  requestRetire(reason: RuntimeRetireReason): undefined
  awaitQuiescent(): Promise<QuiescenceResult>
  releaseResources(): Promise<ManagedReleaseResult>
}

export type RuntimeResourcePurpose = 'instance_required' | 'operation_required' | 'optional'

/** Exact provider registration used by one prepared or pinned runtime resource. */
export type RuntimeResourceBinding = Readonly<{
  owner: string
  registrationId: OpaqueId
  generation: OpaqueId
  resourceId: OpaqueId
}>

declare const runtimeResourcePreparationBrand: unique symbol
export type RuntimeResourcePreparation = Readonly<{
  [runtimeResourcePreparationBrand]: true
  binding: RuntimeResourceBinding
  purpose: RuntimeResourcePurpose
}>

export type ResourcePinResult =
  Readonly<{ status: 'pinned'; use: ExactUse }> | Exclude<CheckResult, { status: 'ready' }>

/** Resource-owner port used for preparation, atomic pinning and retirement. */
export interface RuntimeResource {
  readonly binding: RuntimeResourceBinding
  prepare(
    request: Readonly<{
      permit: ActivationPermit
      purpose: RuntimeResourcePurpose
    }>,
  ): Promise<PreparationResult<RuntimeResourcePreparation>>
  check(
    frame: GateFrame,
    preparation: RuntimeResourcePreparation,
    permit: ActivationPermit,
  ): CheckResult
  pin(
    frame: GateFrame,
    preparation: RuntimeResourcePreparation,
    permit: ActivationPermit,
  ): ResourcePinResult
  retire(frame: GateFrame, reason: RuntimeRetireReason): undefined
}

export type RuntimeResourceRequirement = Readonly<{
  purpose: RuntimeResourcePurpose
  resource: RuntimeResource
}>

declare const factoryPreparationBrand: unique symbol
export type FactoryPreparation = Readonly<{
  [factoryPreparationBrand]: true
  binding: FactoryBinding
  attachment: Attachment
  driver: Driver
  resources: readonly RuntimeResourceRequirement[]
}>

/** Factory contribution; AR retains publication and work admission authority. */
export interface Factory {
  prepare(
    request: Readonly<{
      permit: ActivationPermit
      owner: RuntimeOwner
      attachment: Attachment
    }>,
  ): Promise<PreparationResult<FactoryPreparation>>
  check(frame: GateFrame, preparation: FactoryPreparation, permit: ActivationPermit): CheckResult
}
