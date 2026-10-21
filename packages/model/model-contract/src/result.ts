// Declarations of the public-api chapter "结果、失败和状态".
import type { Outcome } from '@omne-harness/operation-result'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ReasoningStatePart, ToolCallPart } from '@omne-harness/message'
import type { ModelInvocationRef } from './reference.ts'
import type { LimitMetric } from './profile.ts'
import type {
  Adoption,
  ConsumerRef,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  Mutation,
  OutputCursor,
  ResultCapacity,
  ResultVersion,
  Revision,
  DispatchId,
} from './root.ts'

export type ModelFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unsupported'; field: string; adapter: Adoption }>
  | Readonly<{ kind: 'conflict'; operation: ModelOperationId; revision: Revision }>
  | Readonly<{ kind: 'capacity'; required: ResultCapacity }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>
  | Readonly<{ kind: 'commit-unknown'; operation: ModelOperationId }>
  | Readonly<{ kind: 'stale-instance'; instance: ModelInstanceId }>
  | Readonly<{ kind: 'not-settled' }>
  | Readonly<{ kind: 'handoff-invalid'; reason: string }>
export type Reply<T> = Promise<Outcome<T, ModelFailure>>
export type ToolSuggestion = ToolCallPart
export type ModelBlock = ContentBlock | ToolSuggestion | ReasoningStatePart
export type ModelFaultCause =
  | 'profile-withdrawn'
  | 'excluded'
  | 'modality'
  | 'credential'
  | 'input-rejected'
  | 'input-over-limit'
  | 'replay-rejected'
  | 'upstream-unavailable'
  | 'stream-lost'
  | 'runtime-lost'
  | 'persistence'
  | 'policy-unavailable'
  | 'upstream-protocol'
  | 'unclassified'
export type OverLimitMetric = 'context-tokens' | 'input-tokens' | LimitMetric
/**
 * `replayCarried` is present only when the failed send carried reasoning state, so the original
 * consumer can try again in a new call with replay off. A `replay-rejected` send always carried it.
 */
export type ModelFault = Readonly<{
  diagnostic: string
  upstreamStatus: string | null
}> &
  (
    | Readonly<{
        cause: Exclude<ModelFaultCause, 'input-over-limit' | 'replay-rejected'>
        replayCarried?: true
      }>
    | Readonly<{ cause: 'replay-rejected'; replayCarried: true }>
    | Readonly<{
        cause: 'input-over-limit'
        reported: Readonly<{
          metric: OverLimitMetric | null
          limit: string | null
          actual: string | null
        }>
        replayCarried?: true
      }>
  )
export type Termination =
  | Readonly<{ kind: 'completed'; reason: 'stop' | 'limit' | 'tool-suggestions' }>
  | Readonly<{ kind: 'failed'; fault: ModelFault }>
  | Readonly<{ kind: 'interrupted'; control: ModelOperationId }>
export type Settlement = Readonly<{
  version: ResultVersion
  termination: Termination
  cursor: OutputCursor
  source: DurableEvidence
}>
export type CustodyState =
  | Readonly<{ kind: 'producer' }>
  | Readonly<{
      kind: 'acknowledged'
      operation: ModelOperationId
      receipt: DurableEvidence
      cleanup: 'pending' | 'running' | 'blocked' | 'released'
      diagnostic: string | null
    }>
export type CallState = Readonly<{
  call: ModelCallId
  revision: Revision
  consumer: ConsumerRef
  control: ControlState
  custody: CustodyState
}> &
  (
    | Readonly<{ phase: 'accepted' }>
    | Readonly<{
        phase: 'running'
        dispatch: DispatchId
        firstContent: 'none-proven' | 'observed' | 'uncertain'
      }>
    | Readonly<{ phase: 'retry-decision'; dispatch: DispatchId }>
    | Readonly<{ phase: 'settled'; settlement: Settlement }>
  )
export type ControlState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'requested'
      operation: ModelOperationId
      propagation: 'pending' | 'sent' | 'unavailable'
      upstream: 'unknown' | 'stopped' | 'completed'
    }>
export type Lookup =
  | Readonly<{ kind: 'found'; state: CallState }>
  | Readonly<{ kind: 'not-accepted'; operation: ModelOperationId }>
export type Admission = Readonly<{
  call: ModelCallId
  revision: Revision
  recovered: boolean
  reference: ModelInvocationRef
}>
export type DurableEvidence = Readonly<{
  owner: string
  record: string
  revision: string
  digest: string
}>
export type Handoff =
  | Readonly<{ kind: 'processed'; completion: DurableEvidence }>
  | Readonly<{ kind: 'retained'; custody: DurableEvidence }>
export type AckInput<P> = Mutation<P> &
  Readonly<{
    result: ResultVersion
    evidence: Handoff
  }>
export type AckReceipt = Readonly<{
  call: ModelCallId
  result: ResultVersion
  custody: Extract<CustodyState, { kind: 'acknowledged' }>
}>
