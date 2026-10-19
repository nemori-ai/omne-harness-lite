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
  ToolLookup,
  ToolState,
  WaitState,
} from './results.ts'

/**
 * A control of the call. `stop` asks the execution to stop and keeps the result wanted at its
 * consumer position. `withdraw` also tells that the controller no longer needs the result. Its
 * `reach` has no default, and it limits the target call first and the children of a program
 * second. Tool compares `reach` with the relation of the target at the control commit. `all`
 * withdraws the foreground and the background execution of the target, and every child of a
 * program. `foreground-and-unadmitted` withdraws the target only if, at the commit, it is in a
 * foreground relation, started or not, and then only the foreground children and the
 * reservations not yet admitted. A call launched in the background has the background relation
 * from its admission on, so it is never in reach of this value; only `all` withdraws it. A target
 * in the background, whether it moved there or was launched there, is not withdrawn: the control
 * is still committed and its receipt reports the progress `rejected` with the reason
 * `out-of-reach`. This is not a `ToolFailure`. No interruption is recorded, and the call
 * does not change.
 */
export type ToolControl =
  | Readonly<{ kind: 'stop' }>
  | Readonly<{ kind: 'withdraw'; reach: 'all' | 'foreground-and-unadmitted' }>
  | Readonly<{ kind: 'background' }>
export type ControlReceipt = Readonly<{
  operation: ToolOperationId
  state: ToolState
  progress: ControlProgress
}>
/** Why the call is in the background: its launch, a control, or a limit Tool measured itself. */
export type BackgroundSource =
  | Readonly<{ kind: 'launched' }>
  | Readonly<{ kind: 'control'; operation: ToolOperationId }>
  | Readonly<{ kind: 'threshold' }>
  | Readonly<{ kind: 'foreground-limit' }>
export type ForegroundReturn =
  | Readonly<{ kind: 'final'; result: ToolResultVersion }>
  | Readonly<{ kind: 'background'; call: ToolCallId; source: BackgroundSource }>
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
