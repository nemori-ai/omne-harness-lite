// Ordinary runtime operations, controls, observation and the instance directory.
import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolCatalog, ToolInspection } from './authoring.ts'
import type { DiagnosticPage, ProcessSnapshot, ToolContentReader } from './custody.ts'
import type { FixedToolRequest, ToolAvailability } from './definitions.ts'
import type {
  Access,
  CallAccess,
  ConsumerRef,
  DurableEvidence,
  Mutation,
  ToolCallId,
  ToolCursor,
  ToolDeliveryId,
  ToolInstanceId,
  ToolOperationId,
  ToolResultVersion,
  ToolWaitId,
} from './identity.ts'
import type { ControlProgress, WaitRecord } from './records.ts'
import type {
  DeliveryState,
  OperationResolution,
  Reply,
  ResultPage,
  StopReason,
  ToolLookup,
  ToolState,
  WaitState,
} from './results.ts'

export type ToolControl =
  | Readonly<{ kind: 'stop'; reason: StopReason }>
  | Readonly<{
      kind: 'background'
      reason: 'user' | 'threshold' | 'foreground-limit' | 'interruption'
    }>
export type ControlReceipt = Readonly<{
  operation: ToolOperationId
  state: ToolState
  progress: ControlProgress
}>
export type ForegroundReturn =
  | Readonly<{ kind: 'final'; result: ToolResultVersion }>
  | Readonly<{ kind: 'background'; call: ToolCallId; reason: string }>
export type ProcessBlock = Readonly<{
  index: string
  mode: 'append' | 'replace'
  state: 'open' | 'closed'
  sequence: string
  content: ContentBlock
  trim: Readonly<{ removed: string; reason: string }> | null
}>
export type ToolObservation =
  | Readonly<{
      kind: 'snapshot'
      cursor: ToolCursor
      state: ToolState
      process: readonly ProcessBlock[]
      foreground: ForegroundReturn | null
    }>
  | Readonly<{
      kind: 'delta'
      from: ToolCursor
      cursor: ToolCursor
      state: ToolState
      blocks: readonly ProcessBlock[]
    }>
  | Readonly<{ kind: 'gap'; after: ToolCursor; reason: 'buffer' | 'history' }>
  | Readonly<{ kind: 'ended'; reason: 'closed' | 'denied' | 'unavailable' | 'stale-instance' }>
export interface ToolHandle<P> {
  readonly instance: ToolInstanceId
  observe(
    input: Access<P> & Readonly<{ after: ToolCursor | null; signal: AbortSignal }>,
  ): AsyncIterable<ToolObservation>
}
export interface ToolDirectory<P> {
  connect(
    input: CallAccess<P>,
  ): Reply<Readonly<{ kind: 'live'; handle: ToolHandle<P> }> | Readonly<{ kind: 'no-live-route' }>>
}
export type Handoff =
  | Readonly<{ kind: 'retained'; custody: DurableEvidence }>
  | Readonly<{ kind: 'processed'; completion: DurableEvidence }>
export interface ToolRuntime<P, B extends ContentBlock> {
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  admit(
    input: Mutation<P> & Readonly<{ request: FixedToolRequest }>,
  ): Reply<Readonly<{ state: ToolState; recovered: boolean }>>
  lookup(input: CallAccess<P> & Readonly<{ admission: ToolOperationId }>): Reply<ToolLookup>
  queryOperation(
    input: CallAccess<P> & Readonly<{ operation: ToolOperationId }>,
  ): Reply<OperationResolution>
  control(input: Mutation<P> & Readonly<{ intent: ToolControl }>): Reply<ControlReceipt>
  acceptDecision(
    input: Mutation<P> & Readonly<{ wait: ToolWaitId; decision: DurableEvidence }>,
  ): Reply<WaitState>
  acceptResource(
    input: Mutation<P> & Readonly<{ wait: ToolWaitId; response: DurableEvidence }>,
  ): Reply<WaitRecord>
  readProcess(input: CallAccess<P> & Readonly<{ at: ToolCursor | null }>): Reply<ProcessSnapshot>
  readWait(input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>): Reply<WaitRecord>
  readDiagnostics(input: CallAccess<P> & Readonly<{ after: string | null }>): Reply<DiagnosticPage>
  readResult(
    input: CallAccess<P> & Readonly<{ result: ToolResultVersion; after: string | null }>,
  ): Reply<ResultPage<B>>
  releaseDelivery(
    input: Mutation<P> &
      Readonly<{
        result: ToolResultVersion
        delivery: ToolDeliveryId
        consumer: ConsumerRef
        evidence: Handoff
      }>,
  ): Reply<DeliveryState>
  account(input: CallAccess<P>): Reply<CallAccount>
  readonly catalog: ToolCatalog<P>
  readonly content: ToolContentReader<P>
  readonly instances: ToolDirectory<P>
}
