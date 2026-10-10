import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import type { ModelCallId, RunId, AttemptId } from '@omne-harness-lite/call-accounts'
import type { TenantId } from '@omne-harness-lite/identity-values'
import type { CreationKey } from '@omne-harness-lite/messages'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import type {
  InvocationInput,
  ModelInvocationHandle,
  PlanInput,
  PlannedSemantics,
} from './invocation-types.ts'
import type {
  OriginalIssueIdentity,
  OriginalIssueClaim,
  OriginalIssueStage,
  OriginalIssueFailure,
  OriginalIssueOwner,
} from './original-issue.ts'
import type { RuntimeCloseResult } from './service-types.ts'
import type { StorageUnit } from '@omne-harness-lite/storage'

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

export interface ModelExecutionRecords extends OriginalIssueOwner {
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
}

export interface ModelExecutionRequest<P extends PlannedSemantics, R> {
  readonly ref: ModelExecutionRef
  readonly input: InvocationInput<P, R>
}

export type ModelExecutionAdmission =
  | { readonly invocation: ModelInvocationHandle }
  | { readonly rejected: 'closed' | 'duplicateActive' | 'invalidInput' }

export interface ModelPoolExecutor {
  <P extends PlannedSemantics, R>(request: ModelExecutionRequest<P, R>): ModelExecutionAdmission
}

export interface ModelExecutionObservation {
  readonly ref: ModelExecutionRef
  readonly state: 'active' | 'stopUnconfirmed'
}

export interface ModelExecutionSource {
  readonly snapshot: (scope: SessionScope) => readonly ModelExecutionObservation[]
}

export interface ModelPoolInstance {
  readonly execute: ModelPoolExecutor
  readonly executionSource: ModelExecutionSource
  readonly closeAdmission: () => void
  readonly close: () => Promise<RuntimeCloseResult>
}
