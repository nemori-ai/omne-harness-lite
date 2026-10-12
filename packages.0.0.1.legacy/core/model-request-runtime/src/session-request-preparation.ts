import type { AttemptId } from '@omne-harness-lite/call-accounts'
import type { ModelCallCreatedPayload } from '@omne-harness-lite/messages'
import type { PlanCalibration, PlanOutputHistoryGroup } from './planning-types.ts'
import type { CallKey } from '@omne-harness-lite/messages'
import type {
  ModelProfileRef,
  ModelProfileSnapshot,
  ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import type { ModelToolEntry, ParameterJudge } from '@omne-harness-lite/tool-definition'
import type { CredentialScope } from '@omne-harness-lite/model-response'
import type {
  SessionRuntimeBinding,
  OpenCallInput,
  CurrentHistoryReaders,
} from './service-types.ts'
import type {
  SettlementLogBinding,
  SettlementOwner,
  SettlementRegistration,
} from './settlement-types.ts'
import type { CallHistoryResult } from './call-history.ts'
import type { InvocationPolicy } from './invocation-types.ts'
import type { PreparedModelExecution } from './execution-pool.ts'
import type { TokenMargin } from './planning-types.ts'

/** Session-side preparation used while migrating the existing runtime consumer. Not a pool request. */
export interface SessionModelDispatchInput {
  readonly session: SessionRuntimeBinding
  readonly key: CallKey
  readonly dispatch: number
  readonly provider: string
  readonly attempt?: AttemptId
  readonly request: OpenCallInput
  readonly model: {
    readonly profile: ModelProfileRef
    readonly snapshot: ModelProfileSnapshot
    readonly parameters: ModelRequestParameters
  }
  readonly owner: SettlementOwner
  readonly tokenMargin: TokenMargin
  readonly calibration: CurrentHistoryReaders['calibration']
  readonly policy: InvocationPolicy
  readonly read: <T>(
    owner: SettlementOwner,
    work: (registration: SettlementRegistration) => Promise<T>,
  ) => Promise<{ readonly ok: T } | { readonly unavailable: true }>
}

export type SessionModelDispatchResult =
  | {
      readonly prepared: {
        readonly execution: PreparedModelExecution
        readonly credential: string
        readonly credentialScope: CredentialScope
        readonly policy: InvocationPolicy
      }
    }
  | { readonly credentialUnavailable: true }
  | { readonly invalidInput: { readonly reason: 'malformed' | 'unknownTool' } }
  | { readonly unavailable: true; readonly diagnosticReason?: 'scope_disallowed' }

export interface SessionModelCreationInput {
  readonly session: SessionRuntimeBinding
  readonly request: OpenCallInput
  readonly key: CallKey
  readonly tools: readonly ModelToolEntry[]
  readonly registration: SettlementRegistration
  readonly calibration: CurrentHistoryReaders['calibration']
}

export interface PreparedModelCreation {
  readonly content: Extract<ModelCallCreatedPayload, { readonly status: 'accepted' }>
  readonly calibration: PlanCalibration
  readonly outputHistory: readonly PlanOutputHistoryGroup[]
}

export type SessionModelCreationResult =
  | { readonly prepared: PreparedModelCreation }
  | { readonly unavailable: true }
  | { readonly profileNotFound: true }
  | { readonly undispatched: 'withdrawn' | 'modality_mismatch' | 'credential_unavailable' }
  | import('./service-types.ts').ServiceInvalidInput

export interface SessionModelRequestPreparation {
  readonly prepareCreation: (
    input: SessionModelCreationInput,
  ) => Promise<SessionModelCreationResult>
  readonly readCall: (input: {
    readonly binding: SettlementLogBinding
    readonly registration: SettlementRegistration
    readonly callId: CallKey['callId']
    readonly interpret: CurrentHistoryReaders['call']
    readonly additionalReaders?: readonly {
      readonly callId: CallKey['callId']
      readonly interpret: CurrentHistoryReaders['call']
    }[]
  }) => Promise<CallHistoryResult>
  readonly prepare: (input: SessionModelDispatchInput) => Promise<SessionModelDispatchResult>
  readonly resolveTools: (
    request: Pick<OpenCallInput, 'session' | 'tools' | 'run' | 'attempt' | 'report'>,
    registry: SessionRuntimeBinding['tools'],
    parameters?: ParameterJudge,
  ) => Promise<
    | { readonly tools: readonly ModelToolEntry[] }
    | { readonly failure: 'invalidInput'; readonly reason?: 'unknownTool' }
    | { readonly failure: 'unavailable' }
  >
}
