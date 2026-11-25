import type { Outcome } from '@omne-harness/operation-result'
import type { DurableEvidence } from '@omne-harness/exchange-refs'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ReasoningStatePart, ToolCallPart } from '@omne-harness/message'
import type { ModelInvocationRef } from './reference.ts'
import type { OVER_LIMIT_METRICS } from './profile.ts'
import type {
  Adoption,
  ConsumerRef,
  ModelCallId,
  ModelInstanceId,
  ModelOperationId,
  Mutation,
  OutputCursor,
  ResultVersion,
  Revision,
  DispatchId,
} from './root.ts'

export type ModelFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'unsupported'; field: string; adapter: Adoption }>
  | Readonly<{ kind: 'conflict'; operation: ModelOperationId; revision: Revision }>
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
export function faultIsTransient(cause: ModelFaultCause): boolean {
  switch (cause) {
    case 'upstream-unavailable':
    case 'stream-lost':
    case 'runtime-lost':
      return true
    case 'profile-withdrawn':
    case 'excluded':
    case 'modality':
    case 'credential':
    case 'input-rejected':
    case 'input-over-limit':
    case 'replay-rejected':
    case 'persistence':
    case 'policy-unavailable':
    case 'upstream-protocol':
    case 'unclassified':
      return false
    default: {
      const unknown: never = cause
      throw new TypeError(`unknown model fault cause ${String(unknown)}`)
    }
  }
}
export type OverLimitMetric = (typeof OVER_LIMIT_METRICS)[number]
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
/** The replay range of a completed result: what its reasoning state belongs to, and on what prefix. */
export type SettledReplay = Readonly<{
  scope: string
  format: string
  prefix?: string
  /** The call that produced the result; the meter counts carried reasoning by its output. */
  call?: string
}>
export type Settlement = Readonly<{
  version: ResultVersion
  termination: Termination
  cursor: OutputCursor
  source: DurableEvidence
  replay?: SettledReplay
}>
export type CleanupStage = 'pending' | 'running' | 'blocked' | 'released'
/** Why no consumer will ever save a settled result: its receiver refused it, or it cannot be read. */
export type AbandonBasis =
  | Readonly<{ kind: 'refused'; refusal: 'denied' | 'invalid' | 'conflict' }>
  | Readonly<{ kind: 'unreadable'; reason: string }>
export type CustodyState =
  | Readonly<{ kind: 'producer' }>
  | Readonly<{
      kind: 'acknowledged'
      operation: ModelOperationId
      receipt: DurableEvidence
      cleanup: CleanupStage
      diagnostic: string | null
    }>
  | Readonly<{
      kind: 'abandoned'
      operation: ModelOperationId
      basis: AbandonBasis
      record: DurableEvidence
      cleanup: CleanupStage
      diagnostic: string | null
    }>
// How far the real dispatches of one call got: how many the fixed request allows, how many were
// prepared, the fault of the last one that failed, and the instant of a decided next one.
export type DispatchProgress = Readonly<{
  allowed: number
  made: number
  last: ModelFault | null
  notBefore: string | null
}>
export type CallState = Readonly<{
  call: ModelCallId
  revision: Revision
  consumer: ConsumerRef
  control: ControlState
  custody: CustodyState
  attempts?: DispatchProgress
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
export type CallContact =
  | Readonly<{ kind: 'holding' }>
  | Readonly<{ kind: 'settled' }>
  | Readonly<{ kind: 'lost'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'not-accepted' }>
  | Readonly<{ kind: 'unknown' }>
export type Admission = Readonly<{
  call: ModelCallId
  revision: Revision
  recovered: boolean
  reference: ModelInvocationRef
}>
export type { DurableEvidence } from '@omne-harness/exchange-refs'
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
export type AbandonInput<P> = Mutation<P> &
  Readonly<{
    result: ResultVersion
    basis: AbandonBasis
  }>
export type AbandonReceipt = Readonly<{
  call: ModelCallId
  result: ResultVersion
  custody: Extract<CustodyState, { kind: 'abandoned' }>
}>
