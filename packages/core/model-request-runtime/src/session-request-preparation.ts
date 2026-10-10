import type { AttemptId } from '@omne-harness-lite/call-accounts'
import type { Message } from '@omne-harness-lite/messages'
import type { SettlementPrefix } from './settlement-prefix.ts'
import type { PlanCalibration, PlanOutputHistoryGroup } from './planning-types.ts'
import type { CallKey } from '@omne-harness-lite/messages'
import type {
  ModelProfileRef,
  ModelProfileSnapshot,
  ModelRequestParameters,
} from '@omne-harness-lite/model-profile'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import type { CredentialScope } from '@omne-harness-lite/model-response'
import type {
  SessionRuntimeBinding,
  OpenCallInput,
  CurrentHistoryReaders,
} from './service-types.ts'
import type { SettlementOwner, SettlementRegistration } from './settlement-types.ts'
import type { PlanInput, InvocationPolicy } from './invocation-types.ts'
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
        readonly planInput: PlanInput
        readonly credential: string
        readonly credentialScope: CredentialScope
        readonly policy: InvocationPolicy
      }
    }
  | { readonly credentialUnavailable: true }
  | { readonly invalidInput: { readonly reason: 'malformed' | 'unknownTool' } }
  | { readonly unavailable: true; readonly diagnosticReason?: 'scope_disallowed' }

export interface SessionModelRequestPreparation {
  readonly calibrate: (
    prefix: SettlementPrefix,
    messages: readonly Message[],
    target: Parameters<CurrentHistoryReaders['calibration']>[2],
    read: CurrentHistoryReaders['calibration'],
  ) =>
    | {
        readonly calibration: PlanCalibration
        readonly outputHistory: readonly PlanOutputHistoryGroup[]
      }
    | { readonly unavailable: true }
  readonly prepare: (input: SessionModelDispatchInput) => Promise<SessionModelDispatchResult>
  readonly resolveTools: (
    request: Pick<OpenCallInput, 'session' | 'tools' | 'run' | 'attempt' | 'report'>,
    registry: SessionRuntimeBinding['tools'],
  ) => Promise<
    | { readonly tools: readonly ModelToolEntry[] }
    | { readonly failure: 'invalidInput'; readonly reason?: 'unknownTool' }
    | { readonly failure: 'unavailable' }
  >
}
