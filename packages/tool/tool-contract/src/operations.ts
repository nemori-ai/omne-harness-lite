import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ToolCatalog, ToolInspection } from './authoring.ts'
import type { ContentPage, DiagnosticPage, ProcessSnapshot, RawOutput } from './custody.ts'
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
  ToolFailure,
  ToolLookup,
  ToolState,
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

/**
 * The payload of an ordinary invoke: the fixed request without the invocation. The invocation
 * source is bound by the trusted entry the runtime is assembled with; a request that carries
 * `invocation`, `source`, `call` or `operation` fields is invalid at the boundary.
 */
export type ToolInvokeRequest = Omit<FixedToolRequest, 'invocation'>

/** The access of a reference-bearing ordinary operation: the caller, and the saved reference. */
export type InvocationAccess<P> = Access<P> & Readonly<{ reference: ToolInvocationRef }>

/**
 * A definite failure of an invoke or an ordinary command. A lost commit answer is never here:
 * it is the `commit-unknown` branch of the outcome, with the reference to query the original.
 */
export type ToolDefiniteFailure = Exclude<ToolFailure, { kind: 'commit-unknown' }>

/**
 * The outcome of an ordinary invoke. `accepted` carries the original admission state, which is a
 * receipt, not the latest state. `recovered` includes source or admission recall.
 * `association-unknown` has no proven reference. Repeat the original intent to reconcile it.
 * `commit-unknown` means source issuance or admission may be pending; the
 * reference queries it under the original admission. `rejected` carries a definite failure rather than an unknown admission outcome.
 */
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

/**
 * The outcome of an ordinary control command. `committed` carries the operation reference and the
 * receipt. `commit-unknown` means the command may have committed; the operation reference
 * queries it. `rejected` is definite.
 */
export type ToolCommandOutcome<T> =
  | Readonly<{ kind: 'committed'; operation: ToolOperationRef; receipt: T }>
  | Readonly<{ kind: 'commit-unknown'; operation: ToolOperationRef }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>

/**
 * A released delivery returns the producer's original durable receipt, without claiming that
 * this attempt wrote an operation. An unknown answer carries this attempt's operation reference.
 */
export type ToolReleaseDeliveryOutcome =
  | Readonly<{ kind: 'released'; receipt: ReleasedDelivery }>
  | Readonly<{ kind: 'commit-unknown'; operation: ToolOperationRef }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>

/**
 * The persistent queries of an invocation. None of them needs the live directory: a saved
 * reference keeps working while the directory is unavailable. `lookup` locates the original
 * admission and returns the current authoritative ToolState without creating a new call.
 */
export interface ToolInvocationQueries<P, B extends ContentBlock> {
  lookup(input: InvocationAccess<P>): Reply<ToolLookup>
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

/**
 * Supported commands mint an operation identity for each intent. Query an unknown answer with
 * its operation reference. A reliable negative answer rules out only that operation, not an
 * earlier release. After that answer, an explicit new release can retrieve the existing receipt.
 */
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

/** The ordinary access to the current instance directory: connect by the invocation reference. */
export interface ToolInvocationDirectory<P> {
  connect(input: InvocationAccess<P>): ReturnType<ToolDirectory<P>['connect']>
}

/** The ordinary content reads of an invocation, by its reference. */
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
  raw(input: InvocationAccess<P> & Readonly<{ result: ToolResultVersion }>): Reply<RawOutput>
}

/**
 * The ordinary runtime. `invoke` resolves the tenant and complete consumer to its original call.
 * The caller saves the fixed request and consumer before invoking; repeats recover that call. The other members
 * locate by the reference. Dropping a reference or stopping an observation undoes nothing.
 */
export interface ToolRuntime<P, B extends ContentBlock> {
  invoke(input: Access<P> & Readonly<{ request: ToolInvokeRequest }>): Promise<ToolInvokeOutcome>
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  readonly queries: ToolInvocationQueries<P, B>
  readonly commands: ToolInvocationCommands<P>
  readonly instances: ToolInvocationDirectory<P>
  readonly content: ToolInvocationContentReader<P>
  readonly catalog: ToolCatalog<P>
}
