import type { CapabilityId, JsonNumber } from '@omne-harness-lite/content-blocks'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { AttemptId, RunId } from '@omne-harness-lite/call-accounts'
import type { SessionRef, UserMessage } from '@omne-harness-lite/messages'
import type { SourceToken } from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { StorageUnit } from '@omne-harness-lite/storage'

declare const accessBrand: unique symbol
declare const permitBrand: unique symbol
declare const coordinationBrand: unique symbol
/** Live trusted ingress references, not serializable claims or user-supplied identity. */
export interface Access {
  readonly [accessBrand]: true
}
export interface CoordinationAuthority {
  readonly [coordinationBrand]: true
}
export interface AttemptPermit {
  readonly [permitBrand]: true
}
export type AttemptReason = 'first' | 'resumed_after_interruption' | 'resumed_after_wait'
export type Terminal = 'completed' | 'failed' | 'cancelled'
export interface OperationRef {
  readonly tenant: TenantId
  readonly principal: string
  readonly operation: 'createSession' | 'submitInput' | 'cancelRun' | 'setArchived'
  readonly operationKey: string
  readonly session: SessionRef | null
}
export interface Receipt {
  readonly operation: OperationRef
  readonly position: JsonNumber
  readonly source: SourceToken
}
export interface StepReceipt extends SessionScope {
  readonly run: RunId | null
  readonly attempt: AttemptId | null
  readonly stepKey: string
  readonly step: CoordinationStep['kind']
  readonly position: JsonNumber
  readonly source: SourceToken
}
export interface ResultReceipt extends SessionScope {
  readonly call: string
  readonly resultKey: string
  readonly position: JsonNumber
  readonly source: SourceToken
}
export type PermissionMode = 'never' | 'auto_permission' | 'bypass-permissions'
export type CollaborationMode = 'co-work' | 'auto-drive'
export interface CreateSessionInput {
  readonly operationKey: string
  readonly definition: CapabilityId & { readonly category: 'agent_definition' }
  readonly executionType: string
  readonly mode: PermissionMode
  readonly collaboration: CollaborationMode
  readonly workspace?: string
}
export interface SessionDescription extends SessionScope {
  readonly definition: CreateSessionInput['definition']
  readonly executionType: string
  readonly mode: PermissionMode
  readonly collaboration: CollaborationMode
  readonly lifecycle: 'initializing' | 'active' | 'archived'
  readonly workspace: string | null
  readonly source: SourceToken
}
export interface Progress extends SessionScope {
  readonly run: RunId | null
  readonly attempt: AttemptId | null
  readonly state: 'idle' | 'runnable' | 'waiting' | Terminal
  readonly position: string | null
  readonly source: SourceToken
  readonly projectionRuleVersion: string
  readonly reconciliation: 'verified' | 'needed'
}
export type Failure<Reason extends string> = { readonly failure: Reason }
export type UnknownCommit = { readonly kind: 'unknownCommit'; readonly operation: OperationRef }
export type PublicFailure = Failure<'invalidInput' | 'denied' | 'unavailable'>
export interface SessionRuntime {
  readonly createSession: (
    access: Access,
    input: CreateSessionInput,
  ) => Promise<
    | { readonly kind: 'created'; readonly session: SessionRef; readonly receipt: Receipt }
    | UnknownCommit
    | PublicFailure
    | Failure<'definitionUnavailable' | 'conflict'>
  >
  readonly readSession: (
    access: Access,
    session: SessionRef,
  ) => Promise<
    | { readonly kind: 'session'; readonly session: SessionDescription }
    | PublicFailure
    | Failure<'notFound'>
  >
  readonly submitInput: (
    access: Access,
    session: SessionRef,
    operationKey: string,
    message: UserMessage,
  ) => Promise<
    | { readonly kind: 'accepted'; readonly receipt: Receipt }
    | UnknownCommit
    | PublicFailure
    | Failure<'notFound' | 'notAccepting' | 'identityConflict'>
  >
  readonly readReceipt: (
    access: Access,
    operation: OperationRef,
  ) => Promise<
    | { readonly kind: 'present'; readonly receipt: Receipt }
    | { readonly kind: 'absent' }
    | PublicFailure
  >
  readonly readProgress: (
    access: Access,
    session: SessionRef,
  ) => Promise<
    { readonly kind: 'progress'; readonly progress: Progress } | PublicFailure | Failure<'notFound'>
  >
  readonly cancelRun: (
    access: Access,
    session: SessionRef,
    run: RunId,
    operationKey: string,
    target: 'graceful' | 'force',
    reason: string,
  ) => Promise<
    | { readonly kind: 'recorded'; readonly stage: string; readonly receipt: Receipt }
    | { readonly kind: 'alreadyTerminal' }
    | UnknownCommit
    | PublicFailure
    | Failure<'notFound' | 'identityConflict'>
  >
  readonly setArchived: (
    access: Access,
    session: SessionRef,
    operationKey: string,
    archived: boolean,
  ) => Promise<
    | {
        readonly kind: 'recorded'
        readonly lifecycle: 'active' | 'archived'
        readonly receipt: Receipt
      }
    | UnknownCommit
    | PublicFailure
    | Failure<'notFound' | 'invalidTransition' | 'identityConflict'>
  >
}
/** Public ingress subset. It does not advertise cancellation or archive operations. */
export type SessionIngressOperations = Pick<
  SessionRuntime,
  'createSession' | 'readSession' | 'submitInput' | 'readReceipt' | 'readProgress'
>
export type CoordinationStep =
  | { readonly kind: 'startRun'; readonly stepKey: string; readonly inputPosition: JsonNumber }
  | {
      readonly kind: 'startAttempt'
      readonly stepKey: string
      readonly run: RunId
      readonly reason: AttemptReason
    }
  | {
      readonly kind: 'adoptInput'
      readonly stepKey: string
      readonly run: RunId
      readonly attempt: AttemptId
      readonly inputPosition: JsonNumber
      readonly permit: AttemptPermit
    }
  | {
      readonly kind: 'prepareCall'
      readonly stepKey: string
      readonly run: RunId
      readonly attempt: AttemptId
      readonly call: string
      readonly originalPosition: string
      readonly permit: AttemptPermit
    }
  | {
      readonly kind: 'adoptResult'
      readonly stepKey: string
      readonly run: RunId
      readonly attempt: AttemptId
      readonly result: ResultReceipt
      readonly permit: AttemptPermit
    }
  | {
      readonly kind: 'finish'
      readonly stepKey: string
      readonly run: RunId
      readonly attempt: AttemptId
      readonly terminal: Terminal
      readonly reason: string
      readonly permit: AttemptPermit
    }
  | {
      readonly kind: 'cancelStage'
      readonly stepKey: string
      readonly run: RunId
      readonly stage: 'requested' | 'stopping' | 'finished'
      readonly cancellation: Receipt
    }
  | {
      readonly kind: 'finishForceCancelled'
      readonly stepKey: string
      readonly run: RunId
      readonly cancellation: Receipt
    }
/** Lifecycle transitions, excluding the cancellation governance steps. */
export type SessionLifecycleStep = Extract<
  CoordinationStep,
  { kind: 'startRun' | 'startAttempt' | 'adoptInput' | 'prepareCall' | 'adoptResult' | 'finish' }
>
export type StepCommit =
  | {
      readonly kind: 'committed'
      readonly receipt: StepReceipt
      readonly source: SourceToken
      readonly permit: AttemptPermit | null
    }
  | { readonly kind: 'unknownCommit'; readonly scope: SessionScope; readonly stepKey: string }
  | Failure<
      'invalidInput' | 'retryFromFacts' | 'staleAttempt' | 'terminal' | 'denied' | 'unavailable'
    >
export interface SessionCoordination {
  readonly commitStep: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    expectedSource: SourceToken,
    step: CoordinationStep,
  ) => Promise<StepCommit>
}
/** Trusted lifecycle subset. Availability does not convey a coordination authority. */
export interface SessionLifecycle {
  readonly commitStep: (
    authority: CoordinationAuthority,
    scope: SessionScope,
    expectedSource: SourceToken,
    step: SessionLifecycleStep,
  ) => Promise<StepCommit>
}
export interface AttemptStartedFact {
  readonly kind: 'attempt_started'
  readonly run: RunId
  readonly attempt: AttemptId
  readonly reason: AttemptReason
  readonly at: string
}
export interface SessionHead extends SessionScope {
  readonly revision: string
  readonly lifecycle: 'active' | 'archived'
  readonly run: {
    readonly id: RunId
    readonly state: 'runnable' | 'waiting' | Terminal
    readonly attempt: AttemptId | null
    readonly executionGeneration: string | null
  } | null
}
export type SessionStateChange =
  | { readonly kind: 'initialize'; readonly stepKey: string }
  | {
      readonly kind: 'acceptInput'
      readonly operation: OperationRef
      readonly semanticDigest: string
      readonly position: JsonNumber
    }
  | {
      readonly kind: 'startRun'
      readonly stepKey: string
      readonly run: RunId
      readonly position: JsonNumber
    }
  | {
      readonly kind: 'startAttempt'
      readonly stepKey: string
      readonly run: RunId
      readonly attempt: AttemptId
      readonly executionGeneration: string
      readonly reason: AttemptReason
    }
  | {
      readonly kind: 'adoptInput'
      readonly stepKey: string
      readonly run: RunId
      readonly attempt: AttemptId
      readonly position: JsonNumber
      readonly permit: AttemptPermit
    }
  | {
      readonly kind: 'finish'
      readonly stepKey: string
      readonly run: RunId
      readonly attempt: AttemptId
      readonly terminal: Terminal
      readonly permit: AttemptPermit
    }
export type SessionStateStage =
  | { readonly kind: 'staged'; readonly head: SessionHead; readonly permit: AttemptPermit | null }
  | Failure<
      | 'invalidInput'
      | 'denied'
      | 'conflict'
      | 'unavailable'
      | 'staleAttempt'
      | 'terminal'
      | 'pendingInput'
    >
/** Closed state transitions only. The coordinator pairs them with log facts in the same unit. */
export interface SessionStateParticipant {
  readonly headIn: (
    unit: StorageUnit,
    authority: CoordinationAuthority,
    scope: SessionScope,
  ) => Promise<{ readonly kind: 'head'; readonly head: SessionHead | null } | PublicFailure>
  readonly stageIn: (
    unit: StorageUnit,
    authority: CoordinationAuthority,
    scope: SessionScope,
    expectedRevision: string | null,
    change: SessionStateChange,
  ) => Promise<SessionStateStage>
  readonly pendingIn: (
    unit: StorageUnit,
    authority: CoordinationAuthority,
    scope: SessionScope,
    limit: number,
  ) => Promise<
    { readonly kind: 'inputs'; readonly positions: readonly JsonNumber[] } | PublicFailure
  >
}
export interface SessionStateAuthorityOperations {
  readonly authorize: (
    unit: StorageUnit,
    authority: CoordinationAuthority,
    scope: SessionScope,
  ) => Promise<{ readonly kind: 'authorized' } | Failure<'denied' | 'unavailable'>>
}
