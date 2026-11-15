import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { StreamId, StreamObserver, StreamRef } from '@omne-harness/stream-arrival'
import type { ToolCatalog, ToolInspection } from './authoring.ts'
import type { ContentPage, DiagnosticPage, ProcessSnapshot } from './custody.ts'
import type { FixedToolRequest, ToolAvailability } from './definitions.ts'
import type {
  Access,
  CallAccess,
  ConsumerRef,
  DurableEvidence,
  ToolCallId,
  ToolCursor,
  ToolDeliveryId,
  ToolInstanceId,
  ToolOperationId,
  ToolResultVersion,
  ToolWaitId,
} from './identity.ts'
import type { ControlProgress, WaitRecord } from './records.ts'
import type { ToolInvocationRef, ToolOperationRef } from './reference.ts'
import type {
  Attachment,
  ReleasedDelivery,
  OperationResolution,
  Reply,
  ResultPage,
  ToolCallContact,
  ToolFailure,
  ToolLookup,
  ToolState,
} from './results.ts'

export type ToolControl =
  | Readonly<{ kind: 'stop' }>
  | Readonly<{ kind: 'withdraw'; reach: 'all' | 'foreground-and-unadmitted' }>
  | Readonly<{ kind: 'background' }>
export type ControlReceipt = Readonly<{
  operation: ToolOperationId
  state: ToolState
  progress: ControlProgress
}>
export type BackgroundSource =
  | Readonly<{ kind: 'launched' }>
  | Readonly<{ kind: 'control'; operation: ToolOperationId }>
  | Readonly<{ kind: 'foreground-limit' }>
  | Readonly<{ kind: 'threshold' }>
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
export type ToolStreamSnapshot = Readonly<{
  state: ToolState
  process: readonly ProcessBlock[]
  foreground: ForegroundReturn | null
}>
export type ToolStreamDelta = Readonly<{ state: ToolState; blocks: readonly ProcessBlock[] }>
export type ToolStreamEnd = Readonly<{ reason: 'closed' | 'stale-instance' }>
export type ToolStreamObservation<P> = StreamObserver<
  P,
  ToolStreamSnapshot,
  ToolStreamDelta,
  ToolStreamEnd
>
export type ToolStreamSelection = Readonly<{
  state: ToolState
  current: Readonly<{
    ref: StreamRef
    instance: ToolInstanceId
    generation: string
    projection: 'tool-process-v1'
  }> | null
}>
export interface ToolStreamReferences<P> {
  current(
    input: Readonly<{ access: Access<P>; reference: ToolInvocationRef }>,
  ): Reply<ToolStreamSelection>
}
export interface ToolHandle<P> {
  readonly instance: ToolInstanceId
  readonly generation: string
  readonly stream: StreamId
  readonly observation: ToolStreamObservation<P>
}
export interface ToolDirectory<P> {
  connect(
    input: CallAccess<P>,
  ): Reply<Readonly<{ kind: 'live'; handle: ToolHandle<P> }> | Readonly<{ kind: 'no-live-route' }>>
}
export type Handoff =
  | Readonly<{ kind: 'retained'; custody: DurableEvidence }>
  | Readonly<{ kind: 'processed'; completion: DurableEvidence }>

export type ToolInvokeRequest = Omit<FixedToolRequest, 'invocation'>

export type InvocationAccess<P> = Access<P> & Readonly<{ reference: ToolInvocationRef }>

export type ToolDefiniteFailure = Exclude<ToolFailure, { kind: 'commit-unknown' }>

export type ToolInvokeOutcome =
  | Readonly<{
      kind: 'accepted'
      reference: ToolInvocationRef
      state: ToolState
      recovered: boolean
    }>
  | Readonly<{ kind: 'commit-unknown'; reference: ToolInvocationRef }>
  | Readonly<{ kind: 'association-unknown' }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>

export type ToolCommandOutcome<T> =
  | Readonly<{ kind: 'committed'; operation: ToolOperationRef; receipt: T }>
  | Readonly<{ kind: 'commit-unknown'; operation: ToolOperationRef }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>

export type ToolReleaseDeliveryOutcome =
  | Readonly<{ kind: 'released'; receipt: ReleasedDelivery }>
  | Readonly<{ kind: 'commit-unknown'; operation: ToolOperationRef }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>

export interface ToolInvocationQueries<P, B extends ContentBlock> {
  lookup(input: InvocationAccess<P>): Reply<ToolLookup>
  contact(input: InvocationAccess<P>): Reply<ToolCallContact>
  queryOperation(
    input: Access<P> & Readonly<{ operation: ToolOperationRef }>,
  ): Reply<OperationResolution>
  readProcess(
    input: InvocationAccess<P> & Readonly<{ at: ToolCursor | null }>,
  ): Reply<ProcessSnapshot>
  readWait(input: InvocationAccess<P> & Readonly<{ wait: ToolWaitId }>): Reply<WaitRecord>
  readDiagnostics(
    input: InvocationAccess<P> & Readonly<{ after: string | null }>,
  ): Reply<DiagnosticPage>
  readResult(
    input: InvocationAccess<P> & Readonly<{ result: ToolResultVersion; after: string | null }>,
  ): Reply<ResultPage<B>>
  account(input: InvocationAccess<P>): Reply<CallAccount>
}

export interface ToolInvocationCommands<P> {
  control(
    input: InvocationAccess<P> & Readonly<{ intent: ToolControl }>,
  ): Promise<ToolCommandOutcome<ControlReceipt>>
  releaseDelivery(
    input: InvocationAccess<P> &
      Readonly<{
        result: ToolResultVersion
        delivery: ToolDeliveryId
        consumer: ConsumerRef
        evidence: Handoff
      }>,
  ): Promise<ToolReleaseDeliveryOutcome>
}

export interface ToolInvocationContentReader<P> {
  read(
    input: InvocationAccess<P> &
      Readonly<{
        result: ToolResultVersion
        attachment: Attachment
        after: string | null
        maxBytes: number
      }>,
  ): Reply<ContentPage>
}

export interface ToolRuntime<P, B extends ContentBlock> {
  readonly body: import('./body-reads.ts').ToolInvocationBodyReader<P>
  invoke(input: Access<P> & Readonly<{ request: ToolInvokeRequest }>): Promise<ToolInvokeOutcome>
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  readonly queries: ToolInvocationQueries<P, B>
  readonly commands: ToolInvocationCommands<P>
  readonly instances: ToolStreamReferences<P>
  readonly observation: ToolStreamObservation<P>
  readonly content: ToolInvocationContentReader<P>
  readonly catalog: ToolCatalog<P>
}
