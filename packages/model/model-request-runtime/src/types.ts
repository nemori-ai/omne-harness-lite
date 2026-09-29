import type { ArrivalEvent, ArrivalTarget } from '@omne-harness-lite/arrival-events'
import type { ContentBlock, JsonNumber, JsonValue } from '@omne-harness-lite/content-blocks'
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
  RawHeaders,
  CountingBasis,
  RequestInputEvidence,
  ObservedInput,
  OutputGroupEvidence,
  InputCalibration,
  Route,
} from '@omne-harness-lite/model-response'
import type { ModelToolEntry } from '@omne-harness-lite/tool-definition'
import type { CredentialRedactionConfig } from './credential-redaction-types.ts'
import type { DiagnosticEmitter, DiagnosticReference } from './diagnostics-types.ts'
import type { AssemblySnapshot } from '@omne-harness-lite/stream-assembly'
import type { DiagnosticFact, DiagnosticOutcome } from './diagnostics-types.ts'

/** Explicit per-plan estimate policy; never used as upstream usage. */
export interface TokenMargin {
  readonly multiplier: JsonNumber
  readonly reserveTokens: JsonNumber
}
export interface ReplaySelection {
  readonly sourceBlockIndex: number
  readonly messageIndex: number
  readonly blockIndex: number
}
export type PlanCalibration =
  | { readonly kind: 'none'; readonly reason: 'no_observation' | 'source_unavailable' }
  | {
      readonly kind: 'observation'
      readonly inputCalibration: InputCalibration
      readonly usage: Usage
      readonly outputBlocks: readonly ContentBlock[]
      readonly replaySelection: readonly ReplaySelection[]
    }
/** Original response facts for each output group actually selected into this input. */
export type PlanOutputHistoryGroup = Pick<
  Extract<PlanCalibration, { kind: 'observation' }>,
  'inputCalibration' | 'usage' | 'outputBlocks' | 'replaySelection'
> & {
  readonly origin: Pick<
    Route,
    'adaptation' | 'provider' | 'servingProvider' | 'upstreamModel' | 'parameters'
  >
}
export type MeasurementPrecision = 'exact' | 'upperBound' | 'estimated'
export interface MeasurementContribution {
  readonly tokens: JsonNumber
  readonly precision: MeasurementPrecision
}
interface MeasurementBase {
  readonly precision: MeasurementPrecision
  readonly predictedInput: JsonNumber
  readonly admissionTokens: JsonNumber
  readonly basis: CountingBasis
}
export type InputMeasurement =
  | (MeasurementBase & {
      readonly mode: 'full'
      readonly fallbackReason?:
        'source_unavailable' | 'no_observation' | 'prefix_changed' | 'basis_changed'
      readonly fullContribution: MeasurementContribution
      readonly replayContribution?: never
      readonly newContribution?: never
    })
  | (MeasurementBase & {
      readonly mode: 'marginal'
      readonly fallbackReason?: never
      readonly fullContribution?: never
      readonly replayContribution: MeasurementContribution
      readonly newContribution: MeasurementContribution
    })
export interface ReadFacts {
  readonly usage: Usage
  readonly cost: Cost
  readonly observedInput: ObservedInput
}
export interface OutputProjectionInput {
  readonly blocks: readonly ContentBlock[]
  readonly source: 'reply' | 'delivered' | 'none'
  readonly completeness: 'complete' | 'partial'
}
export type OutputProjectionResult =
  | { readonly projected: OutputGroupEvidence }
  | { readonly invalidInput: { readonly reason: 'malformed' } }
  | { readonly unavailable: true }
export interface PlanInput {
  readonly calibration: PlanCalibration
  readonly outputHistory: readonly PlanOutputHistoryGroup[]
  readonly tokenMargin: TokenMargin
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
  readonly requestInput: RequestInputEvidence
  readonly measurement: InputMeasurement
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
export type InputLimitMetric = 'maxInputTokens' | 'maxRequestBytes' | 'maxImageBytes' | 'maxImages'
/** Non-content facts from the same fixed plan; an upper bound is not an actual excess. */
export type InputLimitRejection =
  | {
      readonly rejected: 'invalidInput'
      readonly reason: 'input_limit_missing' | 'input_size_unavailable'
      readonly metrics: readonly [InputLimitMetric, ...InputLimitMetric[]]
    }
  | {
      readonly rejected: 'invalidInput'
      readonly reason: 'input_limit_exceeded'
      readonly basis: 'exact'
      readonly metric: InputLimitMetric
      readonly actual: JsonNumber
      readonly limit: JsonNumber
    }
  | {
      readonly rejected: 'invalidInput'
      readonly reason: 'input_limit_exceeded'
      readonly basis: 'estimated'
      readonly metric: 'maxInputTokens'
      readonly estimatedTokens: JsonNumber
      readonly admissionTokens: JsonNumber
      readonly limit: JsonNumber
    }
export type PlanFailure =
  | InputLimitRejection
  | { readonly rejected: 'invalidInput'; readonly reason: 'malformed' }
  | { readonly rejected: Exclude<PlanRejection, 'invalidInput'> }
export type PlanResult<P extends PlannedSemantics> = { readonly planned: P } | PlanFailure
export interface ServingFacts {
  readonly upstreamModel?: string
  readonly servingProvider?: string
  readonly upstreamRequestId?: string
  readonly stopReason?: string
}
export type TransportFailure = {
  readonly source: 'local' | 'connect' | 'http_status' | 'in_band' | 'stream_broken' | 'protocol'
  readonly httpStatus?: number
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
export type StreamEnd = ServingFacts & { readonly readFacts: ReadFacts } & (
    | { readonly ended: 'end' | 'max_tokens' }
    | { readonly aborted: true; readonly queued?: true }
    | { readonly rejected: 'invalidInput' | 'unavailable' }
    | { readonly failed: TransportFailure }
  )
export type SendResult<R> =
  | { readonly response: R; readonly rawHeaders?: RawHeaders }
  | { readonly failed: TransportFailure; readonly rawHeaders?: RawHeaders }
  | { readonly aborted: true; readonly queued?: true; readonly rawHeaders?: RawHeaders }
  | { readonly rejected: 'invalidInput' | 'unavailable' }
/** Request-local transport facts; the caller-owned closure supplies source and association. */
export interface TransportDiagnosticFact {
  readonly stage: 'queue' | 'send' | 'stream_end'
  readonly outcome: DiagnosticOutcome
  readonly facts: Extract<DiagnosticFact, { readonly kind: 'transport' }>
}
export interface TransportExecutionDiagnostics {
  readonly record: (fact: TransportDiagnosticFact) => void
}
/** Explicit free correlation for one public invocation; it carries no inferred domain identity. */
export interface PublicDiagnosticAssociation {
  readonly executionId: string
  readonly causedBy?: DiagnosticReference
}
/** Process-local execution resources; a reuse scope conveys no identity or authority. */
export interface PlanExecutionContext {
  readonly signal: AbortSignal
  readonly reuseScope?: object
}
export interface TransportAdapter<P extends PlannedSemantics, R> {
  readonly plan: (input: PlanInput, execution: PlanExecutionContext) => Promise<PlanResult<P>>
  readonly projectOutput: (planned: P, input: OutputProjectionInput) => OutputProjectionResult
  readonly send: (
    planned: P,
    credential: string,
    signal: AbortSignal,
    diagnostics?: TransportExecutionDiagnostics,
  ) => Promise<SendResult<R>>
  readonly read: (
    response: R,
    planned: P,
    signal: AbortSignal,
    diagnostics?: TransportExecutionDiagnostics,
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
  readonly credentialRedaction: CredentialRedactionConfig
  readonly diagnostic: (event: { readonly kind: string; readonly detail?: JsonValue }) => void
}
export interface InvocationInput<P extends PlannedSemantics, R> extends PlanInput {
  readonly transport: TransportAdapter<P, R>
  readonly credential: string
  readonly signal: AbortSignal
  readonly policy: InvocationPolicy
  /** The invocation sanitizes these free strings at its credential-owning boundary. */
  readonly diagnosticAssociation?: PublicDiagnosticAssociation
  /** Returns one call-owned emitter; its collector/scope are bound by the caller. */
  readonly diagnosticEmitterFactory?: (
    association?: PublicDiagnosticAssociation,
  ) => DiagnosticEmitter
  /** Synchronous final send admission; the caller owns the predicate's actual source. */
  readonly beforeSend?: () => boolean
  readonly beforeFirstContent?: () => Promise<void>
  /** Direct consumer's synchronous delivery; service bounded observers wrap this port. */
  readonly onAccepted?: (event: ArrivalEvent, snapshot: AssemblySnapshot) => void
}
export interface ModelInvocationResult extends ServingFacts {
  readonly inputCalibration: InputCalibration
  readonly rawHeaders?: RawHeaders
  readonly outcome: ResponseOutcome
  readonly blocks: readonly ContentBlock[]
  readonly ending?: AssistantEnding
  readonly failure?: Failure
  readonly timing: Timing & { readonly sentAt: string }
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
/** Stable, owned facts retained by the original send, including an incomplete outcome. */
export interface InvocationObservedFacts extends ServingFacts {
  readonly inputCalibration: InputCalibration
  readonly sentAt?: string
  readonly rawHeaders?: RawHeaders
  readonly usage: Usage
  readonly cost: Cost
  readonly trims?: TrimSummary
}
export type InvocationOutcome =
  ModelInvocationResult | { readonly cancelledBeforeSend: true } | PlanFailure
export interface ModelInvocationHandle {
  readonly outcome: Promise<InvocationOutcome>
  readonly snapshot: () => AssemblySnapshot
  /** Available only once this invocation and all its owned asynchronous work actually stop. */
  readonly observedFacts: () =>
    { readonly facts: InvocationObservedFacts } | { readonly unavailable: true }
  readonly abort: () => void
}
