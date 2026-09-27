import type {
  AttemptId,
  Cost,
  ModelCallId,
  RunId,
  TrimSummary,
  Usage,
} from '@omne-harness-lite/call-accounts'
import type {
  AttachmentRef,
  ContentBlock,
  JsonNumber,
  JsonValue,
} from '@omne-harness-lite/content-blocks'
import type { ScopeLayerIdentity } from '@omne-harness-lite/identity-values'
import type { FailureCause } from '@omne-harness-lite/loop-extension/v3'
import type { AssistantMessage } from '@omne-harness-lite/messages'
import type {
  ModelAdaptationBinding,
  ModelProfileRef,
  ModelProfileSnapshot,
  ModelRequestParameters,
  ProviderName,
} from '@omne-harness-lite/model-profile'

export type { AttemptId, ModelCallId, RunId } from '@omne-harness-lite/call-accounts'

/** S-6: opaque exchange spelling. Deployment uniqueness belongs to the writer. */
export type ResponseId = string
export interface ModelCallRef {
  readonly callId: ModelCallId
  readonly runId?: RunId
}
export type ReplyDisposition =
  | 'persisted'
  | {
      readonly vetoed: { readonly by: string; readonly reason?: string }
      readonly consumed?: never
    }
  | { readonly consumed: { readonly by: 'compaction' | 'side_query' }; readonly vetoed?: never }
export type SelectedBy = 'session' | 'layer_lock' | { readonly extension: string }
export type CredentialScope =
  { readonly layer: 'factory' } | Extract<ScopeLayerIdentity, { layer: 'tenant' }>
export interface ParameterAdjustment {
  readonly name: string
  readonly requested: JsonValue
  readonly sent: JsonValue
}
export interface Route {
  readonly adaptation: ModelAdaptationBinding
  readonly servingProvider?: string
  readonly profile: ModelProfileRef
  readonly profileSnapshot: ModelProfileSnapshot
  readonly selectedBy: SelectedBy
  readonly provider: ProviderName
  readonly credentialScope: CredentialScope
  readonly upstreamModel?: string
  readonly upstreamRequestId?: string
  readonly parameters: ModelRequestParameters
  readonly parameterAdjustments?: readonly [ParameterAdjustment, ...ParameterAdjustment[]]
  readonly droppedParameters?: readonly [string, ...string[]]
}
export type ResponseOutcome = 'complete' | 'truncated' | 'interrupted' | 'failed'
export type UpstreamError = {
  readonly code?: string
  readonly message?: string
  readonly raw?: JsonValue
} & ({ readonly code: string } | { readonly message: string } | { readonly raw: JsonValue })
export type Failure = {
  readonly cause: FailureCause
  readonly upstreamError?: UpstreamError
  readonly localError?: string
} & (
  | { readonly inBand: true; readonly statusCode: JsonNumber }
  | { readonly inBand?: never; readonly statusCode?: JsonNumber }
)
/** RFC 3339 exchange strings, preserved without reading a clock or comparing instants. */
export interface Timing {
  readonly sentAt: string
  readonly firstTokenAt?: string
  readonly endedAt: string
}
export type RawHeaders = Readonly<Record<string, string | readonly string[]>>
export type RawResponse = {
  readonly headers?: RawHeaders
  readonly body?: AttachmentRef
} & ({ readonly headers: RawHeaders } | { readonly body: AttachmentRef })
interface ResponseBase {
  readonly id: ResponseId
  readonly dispatch: JsonNumber
  readonly route: Route
  readonly stopReason?: string
  readonly usage: Usage
  readonly cost: Cost
  readonly trims?: TrimSummary
  readonly raw?: RawResponse
}
type RunContext =
  | {
      readonly call: { readonly callId: ModelCallId; readonly runId: RunId }
      readonly attemptId: AttemptId
      readonly late?: true
    }
  | {
      readonly call: { readonly callId: ModelCallId; readonly runId?: never }
      readonly attemptId?: never
      readonly late?: never
    }
type OpenedTiming = Timing & { readonly firstTokenAt: string }
type UnopenedTiming = Timing & { readonly firstTokenAt?: never }
type Delivered = readonly [ContentBlock, ...ContentBlock[]]
type NoReply = { readonly reply?: never; readonly replyDisposition?: never }
type NoFailure = { readonly failure?: never }
type SuccessfulResponse = NoFailure & {
  readonly initiator?: never
  readonly delivered?: never
  readonly replyDisposition: ReplyDisposition
  readonly timing: OpenedTiming
} & (
    | {
        readonly outcome: 'complete'
        readonly reply: AssistantMessage & { readonly ending: 'complete' }
      }
    | {
        readonly outcome: 'truncated'
        readonly reply: AssistantMessage & { readonly ending: 'truncated_at_limit' }
      }
  )
type InterruptedResponse = NoFailure & { readonly outcome: 'interrupted' } & (
    | {
        readonly initiator: 'user' | 'run_cancelled'
        readonly reply: AssistantMessage & { readonly ending: 'interrupted_by_user' }
        readonly replyDisposition: ReplyDisposition
        readonly delivered?: never
        readonly timing: OpenedTiming
      }
    | (NoReply & {
        readonly initiator: 'user' | 'run_cancelled' | 'runtime_lost'
      } & (
          | { readonly timing: OpenedTiming; readonly delivered?: Delivered }
          | { readonly timing: UnopenedTiming; readonly delivered?: never }
        ))
  )
type FailedResponse = NoReply & {
  readonly outcome: 'failed'
  readonly initiator?: never
} & (
    | {
        readonly failure: Failure & {
          readonly cause: Exclude<FailureCause, 'interrupted_mid_reply'>
        }
        readonly timing: UnopenedTiming
        readonly delivered?: never
      }
    | {
        readonly failure: Failure & { readonly cause: 'interrupted_mid_reply' }
        readonly timing: OpenedTiming
        readonly delivered: Delivered
      }
  )
/** S-13: seven conditional shapes; runtime provenance remains with the writer. */
export type ModelResponse = ResponseBase &
  RunContext &
  (SuccessfulResponse | InterruptedResponse | FailedResponse)
export type ModelResponseRejection =
  | 'outcome_unknown'
  | 'dispatch_zero'
  | 'cause_unknown'
  | 'reply_missing'
  | 'reply_on_failure'
  | 'reply_and_delivered'
  | 'failure_missing'
  | 'failure_on_interrupted'
  | 'failure_on_success'
  | 'reply_ending_mismatch'
  | 'first_token_inconsistent'
  | 'malformed'
export type ModelResponseJudgment =
  { readonly ok: true } | { readonly rejected: ModelResponseRejection }
