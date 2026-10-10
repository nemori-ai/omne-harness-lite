import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ModelCallId, RunId, AttemptId } from '@omne-harness-lite/call-accounts'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { CallKey, CreationKey } from '@omne-harness-lite/messages'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type { PlanInput } from './invocation-types.ts'
import type {
  OriginalIssueIdentity,
  OriginalIssueClaim,
  OriginalIssueStage,
  OriginalIssueFailure,
} from './original-issue.ts'
import type { CallHistoryResult } from './call-history.ts'
import type {
  ModelRuntimeOperations,
  RuntimeCloseResult,
  OpenCallInput,
  OpenCallRun,
  OpenCallResult,
  FailureConsumableOperation,
  DispatchResult,
  DispatchAgainResult,
  DispatchAgainInput,
  ModelCallHost,
  ModelIdentitySource,
  RuntimeRecoveryAccess,
} from './service-types.ts'
import type {
  CallAccessAction,
  CallAccessEvidence,
  CallAccessResult,
  CallPresence,
} from './reference-types.ts'
import type { ModelRuntimeExecutionObservation } from './execution-source-types.ts'
import type { AnchoredInvocationHandle } from './anchored-invocation-types.ts'
import type { SettlementCoordinator } from './settlement-types.ts'
import type { StorageUnit } from '@omne-harness-lite/storage'
import type { ModelProfileRef } from '@omne-harness-lite/model-profile'
import type { CredentialLookup } from '@omne-harness-lite/model-profile-directory'
import type { ModelTransportService } from './transport-types.ts'
import type { ModelRuntimeExecutionSupport } from './runtime-host-inputs.ts'
import type { ModelLogSettlementTarget } from './log-codec-settlement.ts'

export type ModelExecutionCallRef = SessionScope & {
  readonly callId: ModelCallId
}

export type ModelExecutionRef = ModelExecutionCallRef & {
  readonly dispatch: JsonNumber
}

export interface PreparedModelExecution {
  readonly ref: ModelExecutionRef
  readonly creationKey: CreationKey
  readonly input: PlanInput
  readonly origin:
    | {
        readonly kind: 'sessionAttempt'
        readonly run: RunId
        readonly attempt: AttemptId
      }
    | {
        readonly kind: 'independent'
      }
}

export type ModelPoolCallOpen = OpenCallRun &
  Omit<OpenCallInput, 'host' | 'run' | 'attempt' | 'report'> & {
    readonly tenant: TenantId
  }

export type PreparedModelFirstDispatch = PreparedModelExecution & {
  readonly plan?: never
}

export type PreparedModelRetryDispatch = PreparedModelExecution & {
  readonly plan: DispatchAgainInput['plan']
}

export interface ModelCallerAccess {
  readonly check: <T>(
    input: {
      readonly ref: CallKey
      readonly action: CallAccessAction
    },
    admitted: (evidence: CallAccessEvidence) => Promise<T>,
  ) => Promise<CallAccessResult<T>>
}

export type ModelPoolControls = Pick<
  ModelRuntimeOperations,
  | 'acquireCall'
  | 'readAttempts'
  | 'interrupt'
  | 'releaseCall'
  | 'settleReply'
  | 'canDispatchAgain'
  | 'acknowledgeCall'
  | 'reconcile'
>

declare const modelExecutionJob: unique symbol

export interface ModelExecutionJob {
  readonly [modelExecutionJob]: true
}

export interface ModelObligationReader<Ref> {
  readonly next: () => Promise<
    | {
        readonly kind: 'page'
        readonly refs: readonly [Ref, ...Ref[]]
      }
    | {
        readonly kind: 'end' | 'unavailable'
      }
  >
}

export interface ModelExecutionObligations<Ref> {
  readonly withObligations: <T>(
    input: {
      readonly tenant: TenantId
      readonly limit: number
    },
    use: (reader: ModelObligationReader<Ref>) => Promise<T>,
  ) => Promise<
    | {
        readonly kind: 'used'
        readonly value: T
      }
    | {
        readonly kind: 'unavailable' | 'denied'
      }
  >
}

export interface ModelExecutionRecords extends ModelExecutionObligations<ModelExecutionCallRef> {
  readonly readOriginalIn: (
    unit: StorageUnit,
    ref: ModelExecutionCallRef,
  ) => Promise<CallHistoryResult>
  readonly stageOriginalIn: (
    unit: StorageUnit,
    job: ModelExecutionJob,
  ) => Promise<OriginalIssueStage>
  readonly stageConsumeIn: (
    unit: StorageUnit,
    claim: OriginalIssueClaim,
  ) => Promise<
    | {
        readonly kind: 'staged'
        readonly identity: OriginalIssueIdentity
      }
    | {
        readonly kind: 'alreadyConsumed'
        readonly identity: OriginalIssueIdentity
      }
    | OriginalIssueFailure
  >
  readonly responseWriter: (
    job: ModelExecutionJob,
  ) => Pick<SettlementCoordinator, 'settle' | 'close'>
}

export interface ModelDispatchUnknownCommit {
  readonly kind: 'unknownCommit'
  readonly original: {
    readonly ref: ModelExecutionRef
    readonly creationKey: CreationKey
  }
}

export type ModelDispatchResult = DispatchResult | ModelDispatchUnknownCommit

export type ModelRetryResult = DispatchAgainResult | ModelDispatchUnknownCommit

export interface ModelPoolAdmission extends ModelPoolControls {
  readonly openCall: (request: ModelPoolCallOpen) => Promise<OpenCallResult>
  readonly dispatch: FailureConsumableOperation<PreparedModelFirstDispatch, ModelDispatchResult>
  readonly dispatchAgain: FailureConsumableOperation<PreparedModelRetryDispatch, ModelRetryResult>
}

export interface ModelPoolInstance {
  readonly operations: ModelPoolAdmission
  readonly executionSource: ModelExecutionSource
  readonly closeAdmission: () => void
  readonly close: () => Promise<RuntimeCloseResult>
}

export type ModelExecutionObservation = Omit<
  ModelRuntimeExecutionObservation,
  'session' | 'owner'
> & {
  readonly scope: SessionScope
}

export interface ModelCapturedExecution extends ModelExecutionObservation {
  readonly invocation?: Omit<AnchoredInvocationHandle, 'borrowControl'>
}

export interface ModelExecutionCapture {
  readonly executions: readonly ModelCapturedExecution[]
  readonly release: () => void
}

export interface ModelExecutionSource {
  readonly lookup: (
    ref: CallKey,
    generation?: object,
  ) =>
    | {
        readonly execution: ModelExecutionObservation
      }
    | {
        readonly unknown: true
      }
  readonly snapshot: (scope: SessionScope) =>
    | {
        readonly executions: readonly ModelExecutionObservation[]
      }
    | {
        readonly unavailable: true
      }
  readonly capture: (scope: SessionScope) =>
    | {
        readonly capture: ModelExecutionCapture
      }
    | {
        readonly unavailable: true
      }
  readonly release: () => RuntimeCloseResult
}

export interface ModelCredentialSource {
  readonly value: (
    ref: ModelExecutionRef,
    origin: ModelProfileRef['origin'],
  ) => ReturnType<CredentialLookup['value']>
}

export interface ModelRecoveryScope {
  readonly scope: SessionScope
  readonly records: ModelExecutionRecords
  readonly originalInvocation: (
    key: CallKey,
    target: ModelLogSettlementTarget,
  ) =>
    | {
        readonly original: Omit<AnchoredInvocationHandle, 'borrowControl'>
      }
    | {
        readonly absent: true
      }
    | {
        readonly unavailable: true
      }
  readonly close: () => Promise<void>
}

export interface ModelRecoveryAccess {
  readonly authorize: RuntimeRecoveryAccess['authorize']
  readonly enter: (input: Parameters<RuntimeRecoveryAccess['enter']>[0]) => Promise<
    | {
        readonly scope: ModelRecoveryScope
      }
    | {
        readonly unavailable: true
      }
  >
}

export interface ModelPoolConstruction {
  readonly records: ModelExecutionRecords
  readonly callerAccess: ModelCallerAccess
  readonly credentials: ModelCredentialSource
  readonly transport: Pick<ModelTransportService, 'acquire' | 'clearReuseScope'>
  readonly presence: CallPresence
  readonly host: ModelCallHost
  readonly identities: ModelIdentitySource
  readonly support: ModelRuntimeExecutionSupport
  readonly recovery: ModelRecoveryAccess
  readonly bounds: {
    readonly maxScopes: number
    readonly maxWaitersPerCall: JsonNumber
    readonly reservationTimeoutMs: JsonNumber
  }
}
