// Tool results, effects, terminals, failures, state and result pages.
import type {
  ContentBlock,
  ContentReference,
  ReferenceContentBlock,
  TextContentBlock,
} from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { Outcome } from '@omne-harness/kernel-basis'
import type { ToolSchemaIdentity } from './definitions.ts'
import type {
  Adoption,
  ConsumerRef,
  DurableEvidence,
  ToolCallId,
  ToolDeliveryId,
  ToolInstanceId,
  ToolOperationId,
  ToolResultVersion,
  ToolRevision,
  ToolWaitId,
} from './identity.ts'
import type { ForegroundReturn } from './operations.ts'
import type { ControlRecord, PhysicalExecution, QueuePosition, ToolTiming } from './records.ts'

export type Attachment = ContentReference
export type ToolMessageContentBlock = TextContentBlock | ReferenceContentBlock
export type ToolResult<B extends ContentBlock> = Readonly<{
  content: readonly B[]
  data: ToolResultData
  original:
    | Readonly<{ kind: 'none' }>
    | Readonly<{
        kind: 'offloaded'
        source: Attachment
        summary: readonly B[]
      }>
  attachments: readonly Attachment[]
}>
export type ToolResultData =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'json'
      contract: Adoption
      schema: ToolSchemaIdentity
      value: JsonValue
    }>
export type Effect =
  | Readonly<{ kind: 'not-started' }>
  | Readonly<{ kind: 'not-occurred'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'occurred'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
export type StopReason =
  | 'user'
  | 'foreground-timeout'
  | 'run-cancelled'
  | 'session-archived'
  | 'interruption'
  | 'agent-owned-background'
export type ToolTerminal =
  | Readonly<{ kind: 'completed' }>
  | Readonly<{
      kind: 'failed'
      cause: 'arguments' | 'environment' | 'executor' | 'runtime-lost' | 'result'
      diagnostic: string
    }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{ kind: 'interrupted'; reason: StopReason }>
  | Readonly<{ kind: 'no-response'; wait: ToolWaitId; reason: string }>
export type ToolFailure =
  | Readonly<{ kind: 'denied'; action: string }>
  | Readonly<{ kind: 'invalid'; field: string; reason: string }>
  | Readonly<{ kind: 'conflict'; operation: ToolOperationId }>
  | Readonly<{ kind: 'unavailable'; dependency: string; diagnostic: string }>
  | Readonly<{ kind: 'commit-unknown'; operation: ToolOperationId }>
  | Readonly<{ kind: 'not-settled' }>
  | Readonly<{ kind: 'stale-instance'; instance: ToolInstanceId }>
  | Readonly<{ kind: 'stale-revision'; current: ToolRevision }>
  | Readonly<{ kind: 'invalid-cursor'; reason: string }>
  | Readonly<{ kind: 'unsupported'; adoption: Adoption; reason: string }>
export type Reply<T> = Promise<Outcome<T, ToolFailure>>
export type WaitState =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'ask'
      wait: ToolWaitId
      card: DurableEvidence
      resume: DurableEvidence
      decision: DurableEvidence | null
    }>
  | Readonly<{
      kind: 'resource'
      wait: ToolWaitId
      contract: Adoption
      deadline: string | null
      resume: DurableEvidence
      registration: DurableEvidence
    }>
export type DeliveryState =
  | Readonly<{ kind: 'pending'; delivery: ToolDeliveryId; consumer: ConsumerRef }>
  | Readonly<{
      kind: 'released'
      delivery: ToolDeliveryId
      consumer: ConsumerRef
      evidence: DurableEvidence
    }>
export type ToolState = Readonly<{
  call: ToolCallId
  revision: ToolRevision
  source: DurableEvidence
  foreground: ForegroundReturn | null
  effect: Effect
  execution: PhysicalExecution
  timing: ToolTiming
  queue: QueuePosition
  controls: readonly ControlRecord[]
  delivery: DeliveryState | null
  supplements: readonly Readonly<{
    result: ToolResultVersion
    actual: ToolTerminal
    delivery: DeliveryState
    source: DurableEvidence
  }>[]
}> &
  (
    | (Readonly<{
        phase: 'accepted' | 'preparing' | 'queued' | 'starting'
        wait: Readonly<{ kind: 'none' }>
      }> &
        ToolRelation)
    | (Readonly<{ phase: 'running'; instance: ToolInstanceId }> & ActiveRelation)
    | (Readonly<{ phase: 'suspended'; checkpoint: DurableEvidence }> & ActiveRelation)
    | (Readonly<{ phase: 'settled'; wait: Readonly<{ kind: 'none' }>; result: ToolResultVersion }> &
        (
          | Readonly<{ relation: 'foreground'; terminal: ToolTerminal }>
          | Readonly<{
              relation: 'background'
              terminal: Exclude<ToolTerminal, { kind: 'no-response' }>
            }>
        ))
  )
export type ToolRelation = Readonly<{ relation: 'foreground' | 'background' }>
export type ActiveRelation =
  | Readonly<{ relation: 'foreground'; wait: WaitState }>
  | Readonly<{ relation: 'background'; wait: Readonly<{ kind: 'none' }> }>
export type ResultPage<B extends ContentBlock> = Readonly<{
  result: ToolResultVersion
  terminal: ToolTerminal
  effect: Effect
  actualTerminal: ToolTerminal | null
  relation: 'original' | 'late'
  delivery: ToolDeliveryId
  source: DurableEvidence
  value: ToolResult<B>
  next: string | null
}>
export type OperationResolution =
  | Readonly<{ kind: 'committed'; revision: ToolRevision; receipt: DurableEvidence }>
  | Readonly<{ kind: 'rolled-back' | 'not-committed' }>
  | Readonly<{ kind: 'unknown' }>
export type ToolLookup =
  | Readonly<{ kind: 'found'; state: ToolState }>
  | Readonly<{ kind: 'not-accepted'; operation: ToolOperationId }>
