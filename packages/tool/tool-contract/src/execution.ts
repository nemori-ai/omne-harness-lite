// Executors, result policy, execution references, recovery input and the ledger command port.
import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Outcome } from '@omne-harness/operation-result'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolExecutionContext } from './author-context.ts'
import type { RawOutput } from './custody.ts'
import type { FixedToolRequest } from './definitions.ts'
import type {
  Access,
  Adoption,
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
  ToolRevision,
  ToolWaitId,
} from './identity.ts'
import type { ControlReceipt, Handoff, ProcessBlock, ToolControl } from './operations.ts'
import type { ToolStartRecord } from './ports.ts'
import type { ProgramClosure } from './program.ts'
import type {
  Checkpoint,
  ControlProgress,
  ControlRecord,
  FactBatch,
  FactProgress,
  FactReceipt,
  PreparationRecord,
  ProgramScheduling,
  ReleaseProgress,
  ReleaseRecord,
  ResponseProgress,
  ResponseRecord,
  StartProgress,
  SuspensionRecord,
  TaskResolution,
  ToolTask,
  WaitIntent,
  WaitRecord,
} from './records.ts'
import type {
  DeliveryState,
  Effect,
  Reply,
  ToolResult,
  ToolState,
  ToolTerminal,
  WaitState,
} from './results.ts'

export interface TextRenderer<R> {
  render(value: R): Outcome<string, Readonly<{ reason: string }>>
}
export interface ToolExecutor<A, R, E> {
  execute(argumentsValue: A, environment: E, execution: ToolExecutionContext): Promise<R>
}
export interface ResultPolicy<B extends ContentBlock> {
  readonly adoption: Adoption
  judge(value: ContentBlock): Outcome<B, Readonly<{ reason: string }>>
  judgeResult(value: ToolResult<ContentBlock>): Outcome<ToolResult<B>, Readonly<{ reason: string }>>
}
export type ToolExecutionRef = Readonly<{
  tenant: TenantId
  call: ToolCallId
  instance: ToolInstanceId
  generation: string
}>
export type WriteContext = ToolExecutionRef &
  Readonly<{ operation: ToolOperationId; expected: ToolRevision }>
export type ToolRecovery<B extends ContentBlock> = Readonly<{
  state: ToolState
  request: FixedToolRequest
  admission: ToolOperationId
  initiator: Readonly<{ owner: string; subject: string; revision: string }>
  execution: ToolExecutionRef | null
  checkpoint: DurableEvidence | null
  start: ToolStartRecord | null
  startRejection: Readonly<{ reason: string; exclusion: DurableEvidence }> | null
  invocations: readonly ToolStartRecord[]
  controls: readonly ControlRecord[]
  result: ToolResult<B> | null
  unresolved: readonly ToolOperationId[]
  preparations: readonly PreparationRecord[]
  waits: readonly WaitRecord[]
  suspensions: readonly SuspensionRecord[]
  rawOutputs: readonly RawOutput[]
  tasks: readonly ToolTask[]
  program: ProgramClosure | null
  scheduling: ProgramScheduling | null
  streams: readonly FactProgress[]
}>
export interface ToolCommands<P, B extends ContentBlock> {
  admit(input: Mutation<P> & Readonly<{ request: FixedToolRequest }>): Reply<ToolState>
  control(input: Mutation<P> & Readonly<{ intent: ToolControl }>): Reply<ControlReceipt>
  acceptDecision(
    input: Mutation<P> & Readonly<{ wait: ToolWaitId; decision: DurableEvidence }>,
  ): Reply<WaitState>
  acceptResource(
    input: Mutation<P> & Readonly<{ wait: ToolWaitId; response: DurableEvidence }>,
  ): Reply<WaitRecord>
  releaseDelivery(
    input: Mutation<P> &
      Readonly<{
        result: ToolResultVersion
        delivery: ToolDeliveryId
        consumer: ConsumerRef
        evidence: Handoff
      }>,
  ): Reply<DeliveryState>
  scanPending(
    input: Access<P> & Readonly<{ after: string | null; limit: number }>,
  ): Reply<Readonly<{ calls: readonly ToolCallId[]; next: string | null }>>
  loadRecovery(input: CallAccess<P>): Reply<ToolRecovery<B>>
  claim(
    input: Mutation<P> & Readonly<{ instance: ToolInstanceId; continuity: DurableEvidence }>,
  ): Reply<ToolExecutionRef>
  planPreparation(
    input: WriteContext & Readonly<{ request: FixedToolRequest; purpose: 'initial' | 'resume' }>,
  ): Reply<PreparationRecord>
  prepared(
    input: WriteContext & Readonly<{ preparation: PreparationRecord; resources: DurableEvidence }>,
  ): Reply<ToolState>
  enqueue(input: WriteContext): Reply<ToolState>
  prepareStart(
    input: WriteContext,
  ): Reply<Readonly<{ state: ToolState; start: Extract<ToolStartRecord, { kind: 'start' }> }>>
  prepareResume(
    input: WriteContext & Readonly<{ checkpoint: DurableEvidence }>,
  ): Reply<Readonly<{ state: ToolState; start: Extract<ToolStartRecord, { kind: 'resume' }> }>>
  rejectPending(
    input: WriteContext & Readonly<{ reason: string; exclusion: DurableEvidence }>,
  ): Reply<ToolState>
  recordStart(
    input: WriteContext & Readonly<{ invocation: ToolStartRecord; outcome: StartProgress }>,
  ): Reply<ToolState>
  preserveProcess(
    input: WriteContext & Readonly<{ blocks: readonly ProcessBlock[] }>,
  ): Reply<ToolCursor>
  openWait(input: WriteContext & Readonly<{ wait: WaitIntent }>): Reply<WaitRecord>
  attachCard(
    input: WriteContext & Readonly<{ wait: ToolWaitId; card: DurableEvidence }>,
  ): Reply<WaitRecord>
  attachResource(
    input: WriteContext & Readonly<{ wait: ToolWaitId; registration: DurableEvidence }>,
  ): Reply<WaitRecord>
  planSuspension(
    input: WriteContext & Readonly<{ start: ToolStartRecord; schema: Adoption }>,
  ): Reply<SuspensionRecord>
  suspend(
    input: WriteContext & Readonly<{ suspension: SuspensionRecord; checkpoint: Checkpoint }>,
  ): Reply<ToolState>
  preserveResult(
    input: WriteContext &
      Readonly<{ raw: RawOutput; value: ToolResult<B>; terminal: ToolTerminal; effect: Effect }>,
  ): Reply<ToolState>
  recordResponse(
    input: WriteContext & Readonly<{ response: ResponseRecord; outcome: ResponseProgress }>,
  ): Reply<WaitRecord>
  closeWait(
    input: WriteContext & Readonly<{ wait: ToolWaitId; continuation: DurableEvidence }>,
  ): Reply<ToolState>
  recordControl(
    input: Mutation<P> &
      Readonly<{ control: ToolOperationId; source: DurableEvidence; progress: ControlProgress }>,
  ): Reply<ControlRecord>
  receiveFacts(
    input: CallAccess<P> & Readonly<{ start: ToolStartRecord; batch: FactBatch<B> }>,
  ): Reply<FactReceipt>
  recordFactAcknowledgement(
    input: Mutation<P> & Readonly<{ receipt: FactReceipt; sourceReceipt: DurableEvidence }>,
  ): Reply<FactProgress>
  recordScheduling(
    input: WriteContext & Readonly<{ scheduling: ProgramScheduling }>,
  ): Reply<ToolState>
  recordAccount(
    input: Mutation<P> &
      Readonly<{
        start: ToolStartRecord | null
        source: DurableEvidence
        event: string
        value: CallAccount
      }>,
  ): Reply<DurableEvidence>
  planRelease(
    input: Mutation<P> & Readonly<{ preparation: PreparationRecord; custody: DurableEvidence }>,
  ): Reply<ReleaseRecord>
  recordRelease(
    input: Mutation<P> & Readonly<{ release: ReleaseRecord; outcome: ReleaseProgress }>,
  ): Reply<DurableEvidence>
  recordLateFact(
    input: Mutation<P> &
      Readonly<{
        source: DurableEvidence
        event: string
        fact:
          | Readonly<{ kind: 'account'; value: CallAccount }>
          | Readonly<{ kind: 'effect'; value: Effect }>
      }>,
  ): Reply<ToolRevision>
  recordLateResult(
    input: Mutation<P> &
      Readonly<{
        start: ToolStartRecord
        source: DurableEvidence
        event: string
        raw: RawOutput
        value: ToolResult<B>
        actual: ToolTerminal
        effect: Effect
      }>,
  ): Reply<Readonly<{ result: ToolResultVersion; delivery: DeliveryState }>>
  settleLost(input: Mutation<P> & Readonly<{ continuity: DurableEvidence }>): Reply<ToolState>
  recordTask(
    input: Mutation<P> & Readonly<{ task: ToolTask; resolution: TaskResolution }>,
  ): Reply<DurableEvidence>
}
