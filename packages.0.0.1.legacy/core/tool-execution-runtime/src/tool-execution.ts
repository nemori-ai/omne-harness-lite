import type { CallId, JsonValue, ToolCallBlock } from '@omne-harness-lite/content-blocks'
import type { AttemptId, RunId, ToolCallAccount, CostItem } from '@omne-harness-lite/call-accounts'
import type { ArrivalEnvelope } from '@omne-harness-lite/arrival-events'
import type { ToolDefinition, JsonSchema, ParameterJudge } from '@omne-harness-lite/tool-definition'
import type { AssemblySnapshot, AcceptRejection } from '@omne-harness-lite/stream-assembly'
import type { ExecutionOutcome } from '@omne-harness-lite/content-blocks'
import type { SessionAccess } from '@omne-harness-lite/session-tenancy'
import type { ContextReader, ContextScope, ContextValue } from '@omne-harness-lite/runtime-context'
import type {
  EnvironmentFacilities,
  EnvironmentAdoption,
  ManagedResource,
} from '@omne-harness-lite/execution-environments'
import type { ToolReturn } from '@omne-harness-lite/tool-definition'
import type { AdmissionToken } from '@omne-harness-lite/tool-admission'
import type { ToolResultWriter } from './tool-results.ts'
import type { ToolPoolAdmission } from './execution-pool.ts'
import type { CardId } from '@omne-harness-lite/messages'

export interface ExecutionRef extends ContextScope {
  readonly callId: CallId
}
export type RuntimeAccess = SessionAccess
export type ToolFrame = Extract<
  Extract<ArrivalEnvelope, { target: { kind: 'tool_execution' } }>['event'],
  { t: 'open' | 'fill' | 'close' }
>
export type FrameReception =
  | { readonly kind: 'accepted' }
  | { readonly kind: 'dropped'; readonly why: 'invalid' | 'closed' | 'capacity' | AcceptRejection }
export interface WaitRequest {
  readonly prompt: JsonValue
  readonly answerSchema: JsonSchema
  /** RFC3339 exchange value, validated; absent means no deadline. */
  readonly deadline?: string
  readonly cardId?: CardId
}
/** Identity is derived from the authenticated answer ingress, never trusted from answer data. */
export interface Answerer {
  readonly kind: 'human' | 'system' | 'agent'
  readonly principal: string
}
export type WaitResult =
  | { readonly kind: 'answered'; readonly value: JsonValue; readonly by: Answerer }
  | { readonly kind: 'ended'; readonly outcome: Exclude<ExecutionOutcome, 'backgrounded'> }
  | {
      readonly kind: 'rejected'
      readonly reason:
        'invalidInput' | 'alreadyWaiting' | 'schemaUnsupported' | 'notAllowed' | 'unavailable'
    }
export interface SelectedTool {
  readonly capability: string
  readonly asset: string
  readonly version: string
  readonly definition: ToolDefinition
  readonly adoption: string
}
export interface InvocationDependencies {
  readonly context: ContextReader
  readonly environment?: EnvironmentFacilities
  readonly attachments?: Pick<ToolResultWriter, 'putAttachment'>
  /** Only explicit execution control aborts this signal; observer release does not. */
  readonly signal: AbortSignal
  readonly wait: (request: WaitRequest) => Promise<WaitResult>
  readonly frames: {
    /** Synchronous, bounded, non-throwing. The host supplies the envelope. */
    readonly emit: (frame: ToolFrame) => FrameReception
  }
  readonly costs: {
    /** A repeated itemId must have identical content; acceptance means durable reception in a runtime. */
    readonly report: (
      itemId: string,
      item: CostItem,
    ) => Promise<'recorded' | 'duplicate' | 'invalid' | 'lateRecordedOnly' | 'unavailable'>
  }
}
export type ToolExecutor = (
  args: JsonValue,
  dependencies: InvocationDependencies,
) => Promise<ToolReturn>
/** The independent function's factory accepts its argument judge and result judge separately. */
export interface InvocationInput {
  readonly definition: ToolDefinition
  readonly args: JsonValue
  readonly executor: ToolExecutor
}
export type InvocationResult =
  | { readonly kind: 'returned'; readonly result: ToolReturn }
  | {
      readonly kind: 'failed'
      readonly code: Exclude<ToolFailureCode, 'abnormal_interruption' | 'environment_unavailable'>
    }
export type InvokeTool = (
  input: InvocationInput,
  dependencies: InvocationDependencies,
) => Promise<InvocationResult>
export interface InvokerOptions {
  readonly parameters: ParameterJudge
  readonly judgeResult: (
    input: unknown,
  ) => { readonly kind: 'valid'; readonly result: ToolReturn } | { readonly kind: 'invalid' }
}
export interface ToolImplementation {
  readonly capability: string
  readonly asset: string
  readonly version: string
  readonly definition: ToolDefinition
  readonly executor: ToolExecutor
  /** Omit for a pure closure whose resources survive registration withdrawal. */
  readonly invalidated?: AbortSignal
}
export interface ToolImplementationLease {
  readonly implementation: ToolImplementation
  readonly release: () => void
}
export interface ToolImplementationOperations {
  readonly register: (implementation: ToolImplementation) => () => void
  readonly acquire: (
    selected: SelectedTool,
  ) => ToolImplementationLease | { readonly kind: 'unavailable' | 'definitionMismatch' }
}

export interface ExecutionOrigin {
  readonly run: RunId
  readonly attempt: AttemptId
  readonly assistantMessage: string
}
export interface ExecutionSubmission {
  readonly access: RuntimeAccess
  readonly scope: ContextScope
  readonly origin: ExecutionOrigin
  readonly adoption: string
  /** One execution per submission. Batch order is enforced by the upper driver. */
  readonly call: ToolCallBlock
  readonly admissionToken?: AdmissionToken
}
export type ToolFailureCode =
  | 'business_failure'
  | 'implementation_error'
  | 'result_rejected'
  | 'unparseable'
  | 'schema_unsupported'
  | 'arguments_invalid'
  | 'environment_unavailable'
  | 'start_failed'
  | 'abnormal_interruption'
export type ExecutionTerminal =
  | { readonly outcome: 'completed'; readonly result: ToolReturn }
  | { readonly outcome: 'failed'; readonly code: ToolFailureCode; readonly result?: ToolReturn }
  | { readonly outcome: 'unavailable'; readonly reason: string }
  | { readonly outcome: 'interrupted'; readonly reason: string }
  | { readonly outcome: 'no_answer'; readonly waitIndex: number }
export type ExecutionState =
  | { readonly phase: 'queued' }
  | { readonly phase: 'running'; readonly startedAt: string }
  | { readonly phase: 'waiting'; readonly waitIndex: number; readonly request: WaitRequest }
  | {
      readonly phase: 'ended'
      readonly terminal: ExecutionTerminal
      readonly account: ToolCallAccount
    }
export interface ExecutionResourceSnapshot {
  readonly resource: ManagedResource
  readonly permission: 'planned' | 'permitted'
  readonly ownership: 'call' | 'environment'
  readonly observation?: {
    readonly status: 'confirmed' | 'unconfirmed'
    readonly at: string
    readonly evidence?: JsonValue
  }
}
export interface ExecutionSnapshot {
  readonly ref: ExecutionRef
  readonly origin: ExecutionOrigin
  /** Absent for malformed or unknown calls that never selected an implementation. */
  readonly selected?: SelectedTool
  readonly adoptedEnvironment?: EnvironmentAdoption
  readonly adoptedContext: readonly ContextValue[]
  readonly resources: readonly ExecutionResourceSnapshot[]
  readonly state: ExecutionState
}
export type ExecutionRead =
  | { readonly kind: 'found'; readonly snapshot: ExecutionSnapshot }
  | {
      readonly kind: 'rejected'
      readonly reason:
        'notFound' | 'notAuthorized' | 'runtimeUnavailable' | 'runtimeNotReady' | 'ownerStopped'
    }
export interface ExecutionObserver {
  readonly read: () => Promise<ExecutionRead>
  readonly waitForEnd: () => Promise<ExecutionRead>
  /** Replayable current assembly; it does not promise delivery of every transient frame. */
  readonly frames: () => Promise<
    | { readonly kind: 'snapshot'; readonly value: AssemblySnapshot }
    | Extract<ExecutionRead, { kind: 'rejected' }>
  >
  readonly release: () => void
}
export type SubmissionResult =
  | { readonly kind: 'recorded'; readonly execution: ExecutionRef }
  | {
      readonly kind: 'rejected'
      readonly reason:
        | 'invalidInput'
        | 'notAuthorized'
        | 'callConflict'
        | 'originUnavailable'
        | 'admissionMissing'
        | 'adoptionUnavailable'
        | 'runEnded'
        | 'runtimeUnavailable'
        | 'runtimeNotReady'
        | 'ownerStopped'
    }
export interface ToolRuntimeOperations {
  readonly acquire: (
    access: RuntimeAccess,
    ref: ExecutionRef,
  ) => Promise<
    | { readonly kind: 'acquired'; readonly observer: ExecutionObserver }
    | Extract<ExecutionRead, { kind: 'rejected' }>
  >
  readonly stop: (
    access: RuntimeAccess,
    ref: ExecutionRef,
    reason: string,
  ) => Promise<'stopped' | 'alreadyEnded' | 'notAuthorized' | 'notFound' | 'unavailable'>
  readonly answer: (
    access: RuntimeAccess,
    ref: ExecutionRef,
    waitIndex: number,
    answer: JsonValue,
  ) => Promise<
    | 'accepted'
    | 'stale'
    | 'invalidInput'
    | 'invalidAnswer'
    | 'endedSchemaUnsupported'
    | 'notAuthorized'
    | 'notFound'
    | 'ownerStopped'
    | 'unavailable'
  >
}

/** Stable provider registration; withdrawal does not transfer execution ownership. */
export interface ToolRuntimeRegistryOperations extends ToolPoolAdmission {
  readonly register: (provider: ToolPoolAdmission) => () => Promise<void>
}
