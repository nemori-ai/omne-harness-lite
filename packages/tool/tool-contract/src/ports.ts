// Ports of the Tool runtime that outside providers implement, and the driver and the provider
// that a Tool implementation hands to its host. The construction shape of the runtime factory is
// not here: it belongs to the implementation package.
import type { CallAccount } from '@omne-harness/call-account'
import type { ContentBlock } from '@omne-harness/content-block'
import type { JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import type { ToolDecision } from './author-context.ts'
import type { ToolInspection } from './authoring.ts'
import type { RawOutput } from './custody.ts'
import type { FixedToolRequest, ToolAvailability, ToolInvocation } from './definitions.ts'
import type { ToolExecutionRef } from './execution.ts'
import type {
  Access,
  Adoption,
  CallAccess,
  DurableEvidence,
  Mutation,
  ToolCallId,
  ToolInstanceId,
  ToolOperationId,
  ToolWaitId,
} from './identity.ts'
import type {
  ProcessBlock,
  ToolDirectory,
  ToolHandle,
  ToolInvokeRequest,
  ToolDefiniteFailure,
  ToolRuntime,
} from './operations.ts'
import type {
  ClockSegment,
  ControlDispatch,
  ControlProgress,
  DrainState,
  ExternalOperationResolution,
  FactBatch,
  FactReceipt,
  PreparationProgress,
  PreparationRecord,
  ProgramScheduling,
  ReleaseProgress,
  ReleaseRecord,
  ResponseProgress,
  ResponseRecord,
  StartPermit,
  SuspensionProgress,
  SuspensionRecord,
  ToolRecoveryBinding,
  WaitIntent,
} from './records.ts'
import type { Effect, Reply, ToolResult, ToolTerminal } from './results.ts'

export type DecisionValue = ToolDecision<JsonValue>
export interface ToolDecisionBridge<P> {
  inspectOperation(input: Mutation<P>): Reply<ExternalOperationResolution>
  ensure(
    input: Mutation<P> & Readonly<{ wait: ToolWaitId; request: DurableEvidence }>,
  ): Reply<DurableEvidence>
  inspect(
    input: CallAccess<P> & Readonly<{ wait: ToolWaitId }>,
  ): Reply<Readonly<{ registration: DurableEvidence; decision: DurableEvidence | null }>>
  invalidate(
    input: Mutation<P> & Readonly<{ wait: ToolWaitId; terminal: DurableEvidence }>,
  ): Reply<DurableEvidence>
  resolve(
    input: CallAccess<P> &
      Readonly<{
        wait: ToolWaitId
        decision: DurableEvidence
      }>,
  ): Reply<DecisionValue>
}
export type ToolExecutionFact<B extends ContentBlock> =
  | Readonly<{ kind: 'process'; blocks: readonly ProcessBlock[] }>
  | Readonly<{ kind: 'wait'; value: WaitIntent }>
  | Readonly<{
      kind: 'continued'
      wait: ToolWaitId
      response: ToolOperationId
      timing: DurableEvidence
    }>
  | Readonly<{ kind: 'program-scheduling'; value: ProgramScheduling }>
  | Readonly<{ kind: 'account'; event: string; value: CallAccount }>
  | Readonly<{
      kind: 'final'
      raw: RawOutput
      result: ToolResult<B>
      terminal: ToolTerminal
      effect: Effect
    }>
export interface ToolLiveExecution<B extends ContentBlock> {
  facts(input: Readonly<{ after: string | null; signal: AbortSignal }>): AsyncIterable<FactBatch<B>>
  acknowledge(input: FactReceipt): Reply<DurableEvidence>
  stop(input: ControlDispatch): Reply<ControlProgress>
  inspectControl(input: ControlDispatch): Reply<ControlProgress>
  answer(input: ResponseRecord): Reply<ResponseProgress>
  inspectAnswer(input: ResponseRecord): Reply<ResponseProgress>
}
export type ToolStartRecord = Readonly<{
  operation: ToolOperationId
  executor: Adoption
  execution: ToolExecutionRef
}> &
  (Readonly<{ kind: 'start' }> | Readonly<{ kind: 'resume'; checkpoint: DurableEvidence }>)
export type ToolStartLookup<B extends ContentBlock> =
  | Readonly<{ kind: 'not-started'; exclusion: DurableEvidence }>
  | Readonly<{ kind: 'unknown'; diagnostic: string }>
  | Readonly<{ kind: 'live'; execution: ToolLiveExecution<B> }>
  | Readonly<{
      kind: 'settled'
      source: DurableEvidence
      event: string
      fact: Extract<ToolExecutionFact<B>, { kind: 'final' }>
    }>
  | Readonly<{ kind: 'lost'; continuity: DurableEvidence }>
export type ToolExecutorBinding<P, B extends ContentBlock, E> =
  | Readonly<{
      kind: 'live-only'
      start(
        input: CallAccess<P> &
          Readonly<{
            start: Extract<ToolStartRecord, { kind: 'start' }>
            permit: StartPermit
            request: FixedToolRequest
          }>,
        environment: E,
      ): Reply<ToolLiveExecution<B>>
      inspectStart(
        input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>,
      ): Reply<ToolStartLookup<B>>
    }>
  | Readonly<{
      kind: 'checkpointed'
      checkpointSchema: Adoption
      start(
        input: CallAccess<P> &
          Readonly<{
            start: Extract<ToolStartRecord, { kind: 'start' }>
            permit: StartPermit
            request: FixedToolRequest
          }>,
        environment: E,
      ): Reply<ToolLiveExecution<B>>
      inspectStart(
        input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>,
      ): Reply<ToolStartLookup<B>>
      suspend(input: SuspensionRecord): Reply<SuspensionProgress>
      inspectSuspension(input: SuspensionRecord): Reply<SuspensionProgress>
      resume(
        input: CallAccess<P> &
          Readonly<{
            start: Extract<ToolStartRecord, { kind: 'resume' }>
            permit: StartPermit
            request: FixedToolRequest
          }>,
        environment: E,
      ): Reply<ToolLiveExecution<B>>
    }>
export interface PreparedEnvironment<E> {
  readonly value: E
  readonly evidence: DurableEvidence
  readonly preparation: PreparationRecord
}
export interface ToolEnvironment<P, E> {
  prepare(
    input: CallAccess<P> & Readonly<{ preparation: PreparationRecord }>,
  ): Reply<PreparationProgress<E>>
  inspectPreparation(
    input: CallAccess<P> & Readonly<{ preparation: PreparationRecord }>,
  ): Reply<PreparationProgress<E>>
  release(input: CallAccess<P> & Readonly<{ release: ReleaseRecord }>): Reply<ReleaseProgress>
  inspectRelease(
    input: CallAccess<P> & Readonly<{ release: ReleaseRecord }>,
  ): Reply<ReleaseProgress>
}
export interface ToolBindings<P, B extends ContentBlock, E> {
  inspect(input: ToolInspection<P>): Reply<ToolAvailability>
  resolve(
    input: CallAccess<P> & Readonly<{ request: FixedToolRequest }>,
  ): Reply<ToolExecutorBinding<P, B, E>>
  recover(
    input: CallAccess<P> & Readonly<{ start: ToolStartRecord }>,
  ): Reply<ToolRecoveryBinding<B>>
}
export interface ToolInstanceHost<P> {
  install(driver: ToolDriver<P>): Readonly<{ release(): Promise<void> }>
  schedule(
    input: Readonly<{ tenant: TenantId; call: ToolCallId }>,
  ): Reply<Readonly<{ queued: true }>>
  publish(
    input: ToolExecutionRef,
    handle: ToolHandle<P>,
  ): Reply<Readonly<{ execution: ToolExecutionRef; registration: string }>>
  withdraw(
    input: Readonly<{ execution: ToolExecutionRef; registration: string }>,
  ): Reply<Readonly<{ removed: boolean }>>
  readonly directory: ToolDirectory<P>
}
/**
 * The operation and instance identity mints of trusted providers. Invocation identities belong
 * to the source association. A new operation belongs to an admitted call; a new instance is the
 * identity of one hosted instance the host creates. A mint never reuses a value it returned
 * before, also not after a restart of the provider.
 */
export interface ToolOperationIdentities {
  newOperation(): Reply<ToolOperationId>
}
export interface ToolInstanceIdentities {
  newInstance(): Reply<ToolInstanceId>
}
/** The source owns the atomic tenant/consumer association and its original identities. */
export type ToolInvocationSourceOutcome =
  | Readonly<{
      kind: 'bound'
      call: ToolCallId
      admission: ToolOperationId
      invocation: ToolInvocation
      recovered: boolean
    }>
  | Readonly<{ kind: 'issuance-unknown'; call: ToolCallId; admission: ToolOperationId }>
  | Readonly<{ kind: 'association-unknown' }>
  | Readonly<{ kind: 'rejected'; failure: ToolDefiniteFailure }>

export interface ToolInvocationSourceIssuer<P> {
  resolve(
    input: Access<P> & Readonly<{ request: ToolInvokeRequest }>,
  ): Promise<ToolInvocationSourceOutcome>
}
export interface ToolDriver<P> {
  run(
    input: CallAccess<P> & Readonly<{ instance: ToolInstanceId; signal: AbortSignal }>,
  ): Promise<void>
}
export interface ToolClock {
  now(): string
  /**
   * Only produces a marker. A segment that is not committed has no effect and needs no closing.
   * Elapsed time counts the committed segments only.
   */
  begin(
    input: Readonly<{ operation: ToolOperationId; execution: ToolExecutionRef }>,
  ): Reply<ClockSegment>
  elapsed(
    evidence: DurableEvidence,
  ): Reply<Readonly<{ milliseconds: string; evidence: DurableEvidence }>>
  waitUntil(instant: string, signal: AbortSignal): Promise<'elapsed' | 'cancelled'>
}
export interface ToolProvider<P, B extends ContentBlock> {
  readonly runtime: ToolRuntime<P, B>
  recover(input: Access<P>): Reply<Readonly<{ scheduled: string }>>
  quiesce(): Reply<Readonly<{ pending: string; running: string }>>
  inspectDrain(input: Access<P>): Reply<DrainState>
  handover(
    input: Access<P> &
      Readonly<{
        operation: ToolOperationId
        successor: DurableEvidence
        inventory: DurableEvidence
      }>,
  ): Reply<DurableEvidence>
}
