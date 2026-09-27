import type { ArrivalEvent, ArrivalTarget } from '@omne-harness-lite/arrival-events'
import type { ContentBlock, JsonValue } from '@omne-harness-lite/content-blocks'
import type { Cost, Usage, TrimSummary } from '@omne-harness-lite/call-accounts'
import type {
  ModelProfileSnapshot,
  ModelRequestParameters,
  ModelAdaptationBinding,
} from '@omne-harness-lite/model-profile'
import type { Message, AssistantEnding } from '@omne-harness-lite/messages'
import type {
  Failure,
  Timing,
  ResponseOutcome,
  ParameterAdjustment,
} from '@omne-harness-lite/model-response'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'

export interface PlanInput {
  readonly target: Extract<ArrivalTarget, { kind: 'model_call' }>
  readonly routeName: string
  readonly provider: string
  readonly snapshot: ModelProfileSnapshot
  readonly parameters: ModelRequestParameters
  readonly messages: readonly Message[]
  readonly tools: readonly ModelToolEntry[]
}
export interface PlannedSemantics {
  readonly input: PlanInput
  readonly parameters: ModelRequestParameters
  readonly parameterAdjustments?: readonly ParameterAdjustment[]
  readonly droppedParameters?: readonly string[]
}
export type PlanRejection =
  | 'invalidInput'
  | 'unavailable'
  | 'modality_not_carried'
  | 'orphan_tool_call'
  | 'tool_internal_in_request'
export type PlanResult<P extends PlannedSemantics> =
  { readonly planned: P } | { readonly rejected: PlanRejection }
export interface ServingFacts {
  readonly upstreamModel?: string
  readonly servingProvider?: string
  readonly upstreamRequestId?: string
  readonly stopReason?: string
}
export type TransportFailure = {
  readonly source: 'local' | 'connect' | 'http_status' | 'in_band' | 'stream_broken' | 'protocol'
  readonly httpStatus?: number
  /** Actual response facts after credential redaction; repeated values stay separate. */
  readonly headers?: Readonly<Record<string, string | readonly string[]>>
  readonly upstreamError?: Failure['upstreamError']
  readonly localError?: string
  readonly queued?: true
} & (
  | {
      readonly inBand: true
      readonly statusCode: import('@omne-harness-lite/content-blocks').JsonNumber
    }
  | {
      readonly inBand?: never
      readonly statusCode?: import('@omne-harness-lite/content-blocks').JsonNumber
    }
)
export type StreamEnd = ServingFacts &
  (
    | { readonly ended: 'end' | 'max_tokens' }
    | { readonly aborted: true; readonly queued?: true }
    | { readonly rejected: 'invalidInput' | 'unavailable' }
    | { readonly failed: TransportFailure }
  )
export type SendResult<R> =
  | { readonly response: R }
  | { readonly failed: TransportFailure }
  | { readonly aborted: true; readonly queued?: true }
  | { readonly rejected: 'invalidInput' | 'unavailable' }
export interface TransportAdapter<P extends PlannedSemantics, R> {
  readonly plan: (input: PlanInput) => PlanResult<P>
  readonly send: (planned: P, credential: string, signal: AbortSignal) => Promise<SendResult<R>>
  readonly read: (
    response: R,
    planned: P,
    signal: AbortSignal,
  ) => AsyncGenerator<ArrivalEvent, StreamEnd>
}
export interface InvocationPolicy {
  readonly now: () => string
  /** Own and dispose scheduling explicitly. No internal timeout defaults. */
  readonly schedule: (milliseconds: number, callback: () => void) => () => void
  readonly firstContentTimeoutMs: number
  readonly idleContentTimeoutMs: number
  readonly statusCauseTable: Readonly<
    Record<string, 'credential_unavailable' | 'request_rejected' | 'upstream_unavailable'>
  >
  readonly redact: (value: string) => string
  readonly diagnostic: (event: { readonly kind: string; readonly detail?: JsonValue }) => void
}
export interface InvocationInput<P extends PlannedSemantics, R> extends PlanInput {
  readonly transport: TransportAdapter<P, R>
  readonly credential: string
  readonly signal: AbortSignal
  readonly policy: InvocationPolicy
  readonly beforeFirstContent?: () => Promise<void>
  /** Direct consumer's synchronous delivery; service bounded observers wrap this port. */
  readonly onAccepted?: (event: ArrivalEvent, snapshot: AssemblySnapshot) => void
}
export interface ModelInvocationResult extends ServingFacts {
  readonly outcome: ResponseOutcome
  readonly blocks: readonly ContentBlock[]
  readonly ending?: AssistantEnding
  readonly failure?: Failure
  readonly timing: Timing
  readonly usage: Usage
  readonly cost: Cost
  readonly trims?: TrimSummary
  readonly routeName: string
  readonly provider: string
  readonly adaptation: ModelAdaptationBinding
  readonly parameters: ModelRequestParameters
  readonly parameterAdjustments?: readonly ParameterAdjustment[]
  readonly droppedParameters?: readonly string[]
}
export type InvocationOutcome =
  | ModelInvocationResult
  | { readonly cancelledBeforeSend: true }
  | { readonly rejected: PlanRejection }
export interface ModelInvocationHandle {
  readonly outcome: Promise<InvocationOutcome>
  readonly snapshot: () => AssemblySnapshot
  readonly abort: () => void
}
