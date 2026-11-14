import type { Message } from '@omne-harness/message'
import type * as M from '@omne-harness/model-contract'
import type { Outcome } from '@omne-harness/operation-result'
import type * as T from '@omne-harness/tool-contract'
import type { AgentDefinition } from './definition.ts'
import type {
  AgentCheckpoint,
  AgentConclusion,
  AgentEvaluator,
  Failure,
  FailureCandidate,
  InputBatch,
  ProducedResult,
  Reply,
  ReplyAdmissionProjection,
  Waiting,
} from './evaluation.ts'
import type { LoopExtensionDeclaration } from './extensions.ts'
import type {
  Access,
  Adoption,
  AgentExecutionId,
  AgentInstanceId,
  AgentInstant,
  AgentOperationId,
  AgentRegistrationId,
  Authority,
  ConsumptionId,
  Continuation,
  DurableEvidence,
  ExecutionAttachmentId,
  ExecutionRevision,
  InputId,
  PassageId,
} from './identity.ts'
import type { ExecutionSettlement, FinishObligations } from './finishing.ts'
import type { EffectIntent, ExecutionHandoff } from './journal.ts'
import type { AgentJournalEntry } from './receiving.ts'

export type ExecutionState =
  | Readonly<{ kind: 'reconciling' | 'advancing' }>
  | Readonly<{ kind: 'waiting'; waits: readonly Waiting[] }>
  | Readonly<{ kind: 'settling'; intent: FinishIntent }>
  | Readonly<{ kind: 'suspended'; handoff: DurableEvidence }>
  | Readonly<{ kind: 'ended'; conclusion: AgentConclusion; disposition: DurableEvidence }>
export type ExecutionSnapshot = Readonly<{
  execution: AgentExecutionId
  revision: ExecutionRevision
  state: ExecutionState
  checkpoint: AgentCheckpoint
  inputWatermark: DurableEvidence
  history: DurableEvidence
  replyAdmissions: ReplyAdmissionProjection
  executionAttachment: Authority | null
  unresolved: readonly AgentOperationId[]
  controls: readonly ControlRecord[]
  results: readonly ResultResponsibility[]
  effects: readonly EffectIntent[]
  terminalObservations: readonly TerminalObservation[]
  handoffs: readonly ExecutionHandoff[]
  finishObligations: FinishObligations | null
  settlement: ExecutionSettlement
  output: Readonly<{ emittedThrough: string | null; acknowledgedThrough: string | null }>
}>
export type AgentState =
  | Readonly<{ kind: 'idle'; instance: AgentInstanceId }>
  | Readonly<{ kind: 'reserved'; instance: AgentInstanceId }>
  | Readonly<{
      kind: 'occupied'
      instance: AgentInstanceId
      execution: AgentExecutionId
      executionAttachment: ExecutionAttachmentId
    }>
  | Readonly<{
      kind: 'draining'
      instance: AgentInstanceId
      unresolved: readonly AgentExecutionId[]
    }>
  | Readonly<{ kind: 'disposed'; instance: AgentInstanceId }>
export type AcceptedInput = Readonly<{
  id: InputId
  content: Message
  source: DurableEvidence | null
  priority: 'ordinary' | 'urgent'
}>
export type TerminalObservation = Readonly<{
  terminal: DurableEvidence
  passage: PassageId
  implementation: Adoption
  observed: DurableEvidence | null
}>
export type FinishIntent = Readonly<{
  candidate: AgentOperationId
  conclusion: AgentConclusion
  inputWatermark: DurableEvidence
  obligations: DurableEvidence | null
  beforeTerminal: DurableEvidence | null
  failure: FailureCandidate | null
}>
export type FinishResult =
  | Readonly<{ kind: 'ended'; receipt: CommandReceipt }>
  | Readonly<{ kind: 'changed'; revision: ExecutionRevision }>
  | Readonly<{
      kind: 'blocked'
      reason: 'inputs' | 'controls' | 'operations' | 'passages' | 'custody'
      source: DurableEvidence
    }>
export type FinishAuthorization =
  | Readonly<{ kind: 'advancement'; authority: Authority }>
  | Readonly<{ kind: 'cancel'; control: AgentOperationId; source: DurableEvidence }>
export type ExecutionControl =
  | Readonly<{ kind: 'interrupt-model'; call: M.ModelCallId; reason: DurableEvidence }>
  | Readonly<{
      kind: 'interrupt-tool' | 'background-tool'
      call: T.ToolCallId
      reason: DurableEvidence
    }>
  | Readonly<{ kind: 'cancel'; reason: DurableEvidence }>
  | Readonly<{ kind: 'suspend'; reason: DurableEvidence }>
export type ControlStage =
  | 'accepted'
  | 'intent-established'
  | 'qualification-revoked'
  | 'producer-confirmed'
  | 'physically-stopped'
  | 'duty-released'
export type ControlStageFact = Readonly<{
  state: 'reached' | 'unresolved'
  source: DurableEvidence
}>
type ToolControl = Extract<ExecutionControl, { kind: 'interrupt-tool' | 'background-tool' }>
export type ControlRecord = Readonly<{
  operation: AgentOperationId
  stages: Readonly<
    { accepted: ControlStageFact } & Partial<
      Record<Exclude<ControlStage, 'accepted'>, ControlStageFact>
    >
  >
}> &
  (
    | Readonly<{
        command: ToolControl
        toolInvocation: T.ToolInvocationRef
        toolOperation: T.ToolOperationRef | null
      }>
    | Readonly<{
        command: Exclude<ExecutionControl, ToolControl>
        toolInvocation?: never
        toolOperation?: never
      }>
  )
export type ResultResponsibility = Readonly<{
  result: ProducedResult
  consumption: ConsumptionId
  custody: DurableEvidence | null
  completion: DurableEvidence | null
  release: Readonly<{ kind: 'pending' }> | Readonly<{ kind: 'confirmed'; receipt: DurableEvidence }>
}>
export type ExecutionMutation<P> = Access<P> &
  Readonly<{
    execution: AgentExecutionId
    operation: AgentOperationId
  }>
export type CommandReceipt = Readonly<{
  operation: AgentOperationId
  execution: AgentExecutionId
  revision: ExecutionRevision
  evidence: DurableEvidence
  state: 'accepted' | 'applied' | 'unresolved'
}>
export type AgentEventBody =
  | Readonly<{ kind: 'input-taken'; batch: InputBatch }>
  | Readonly<{ kind: 'message'; message: Message; source: DurableEvidence }>
  | Readonly<{ kind: 'producer'; result: ProducedResult; consumption: ConsumptionId }>
  | Readonly<{ kind: 'entry'; entry: AgentJournalEntry }>
  | Readonly<{ kind: 'waiting'; waits: readonly Waiting[] }>
  | Readonly<{
      kind: 'control'
      operation: AgentOperationId
      stage: ControlStage
      state: 'reached' | 'unresolved'
      source: DurableEvidence
    }>
  | Readonly<{ kind: 'ended'; conclusion: AgentConclusion; disposition: DurableEvidence }>
export type AgentEvent = Readonly<{
  execution: AgentExecutionId
  sequence: string
  executionAttachment: ExecutionAttachmentId
  schema: Adoption
  cause: DurableEvidence
  body: AgentEventBody
}>
export type EventPage =
  | Readonly<{ kind: 'page'; events: readonly AgentEvent[]; next: string; caughtUp: boolean }>
  | Readonly<{ kind: 'gap'; retainedFrom: string; recovery: DurableEvidence }>
export interface AgentExecutionInput<P> {
  submit(input: ExecutionMutation<P> & Readonly<{ value: AcceptedInput }>): Reply<CommandReceipt>
}
export interface AgentExecutionControl<P> {
  control(
    input: ExecutionMutation<P> & Readonly<{ command: ExecutionControl }>,
  ): Reply<CommandReceipt>
}
export interface AgentExecutionEvents<P> {
  read(
    input: Access<P> &
      Readonly<{ execution: AgentExecutionId; after: string | null; limit: number }>,
  ): Reply<EventPage>
  events(
    input: Access<P> &
      Readonly<{ execution: AgentExecutionId; after: string | null; signal: AbortSignal }>,
  ): AsyncIterable<Outcome<EventPage, Failure>>
  acknowledge(
    input: ExecutionMutation<P> & Readonly<{ through: string; receipt: DurableEvidence | null }>,
  ): Reply<CommandReceipt>
}
export interface AgentExecutionHandle<P> {
  readonly execution: AgentExecutionId
  readonly input: AgentExecutionInput<P>
  readonly control: AgentExecutionControl<P>
  readonly output: AgentExecutionEvents<P>
}
export interface AgentRuntime<P> {
  readonly instance: AgentInstanceId
  invoke(
    input: ExecutionMutation<P> &
      Readonly<{ initial: AcceptedInput; grant: DurableEvidence | null }>,
  ): Reply<AgentExecutionHandle<P>>
  resume(
    input: ExecutionMutation<P> &
      Readonly<{ recovery: DurableEvidence; grant: DurableEvidence | null }>,
  ): Reply<AgentExecutionHandle<P>>
}
export type AgentObservation =
  | Readonly<{ kind: 'state'; value: AgentState }>
  | Readonly<{ kind: 'ended'; reason: 'closed' | 'denied' | 'retired' | 'unavailable' }>
export interface AgentHandle<P> {
  readonly instance: AgentInstanceId
  observe(input: Access<P> & Readonly<{ signal: AbortSignal }>): AsyncIterable<AgentObservation>
}
export interface AgentDirectory<P> {
  resolve(input: Access<P> & Readonly<{ instance: AgentInstanceId }>): Reply<AgentRuntime<P>>
  connect(
    input: Access<P> & Readonly<{ instance: AgentInstanceId }>,
  ): Reply<Readonly<{ kind: 'live'; handle: AgentHandle<P> }> | Readonly<{ kind: 'no-live-route' }>>
}
export interface AgentExecutionRecovery<P> {
  query(input: ExecutionMutation<P>): Reply<
    | Readonly<{ kind: 'committed'; receipt: CommandReceipt }>
    | Readonly<{
        kind: 'rejected'
        failure: Extract<Failure, { kind: 'conflict' }>
        audit: DurableEvidence
        revision: ExecutionRevision
      }>
    | Readonly<{ kind: 'excluded'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'unknown' }>
  >
  load(input: Access<P> & Readonly<{ execution: AgentExecutionId }>): Reply<ExecutionSnapshot>
  reconcile(
    input: ExecutionMutation<P>,
  ): Reply<Readonly<{ remaining: readonly ConsumptionId[]; evidence: DurableEvidence }>>
  detach(
    input: ExecutionMutation<P> & Readonly<{ authority: Authority; reason: DurableEvidence }>,
  ): Reply<DurableEvidence>
  contact(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; authority: Authority }>,
  ): Reply<
    | Readonly<{ kind: 'live' }>
    | Readonly<{ kind: 'lost'; evidence: DurableEvidence }>
    | Readonly<{ kind: 'unknown' }>
  >
}
export interface AgentAdoptions<P> {
  resolve(input: Access<P> & Readonly<{ adoption: Adoption }>): Reply<
    Readonly<{
      definition: AgentDefinition
      evaluator: AgentEvaluator
      extensions: readonly LoopExtensionDeclaration[]
    }>
  >
  handover(
    input: Access<P> &
      Readonly<{
        from: Adoption
        to: Adoption
        snapshot: ExecutionSnapshot
        original: Continuation
      }>,
  ): Reply<Readonly<{ continuation: Continuation; evidence: DurableEvidence }>>
}
export type RegistrationState = 'published' | 'withdrawing' | 'withdrawn'
export type Registration = Readonly<{
  registration: AgentRegistrationId
  state: RegistrationState
}>
export interface AgentRegistrationHandle<P> {
  readonly instance: AgentInstanceId
  report(input: Readonly<{ state: AgentState }>): void
  withdraw(
    input: Access<P> & Readonly<{ operation: AgentOperationId; reason: DurableEvidence }>,
  ): Reply<Registration | null>
}
export interface AgentInstanceHost<P> {
  reserve(
    input: Access<P> &
      Readonly<{ operation: AgentOperationId; scope: DurableEvidence; definition: Adoption }>,
  ): Reply<
    Readonly<{
      instance: AgentInstanceId
      registration: AgentRegistrationHandle<P>
    }>
  >
  publish(
    input: Access<P> &
      Readonly<{
        operation: AgentOperationId
        instance: AgentInstanceId
        scope: DurableEvidence
        state: AgentState
      }>,
  ): Reply<Registration>
  withdraw(
    input: Access<P> &
      Readonly<{
        operation: AgentOperationId
        instance: AgentInstanceId
        registration: AgentRegistrationId
      }>,
  ): Reply<Registration>
  readonly directory: AgentDirectory<P>
}
export type QuiesceResult = Readonly<{
  kind: 'drained' | 'unresolved'
  remaining: readonly AgentExecutionId[]
  evidence: DurableEvidence
}>
export interface AgentRuntimeControl<P> {
  quiesce(
    input: Access<P> & Readonly<{ operation: AgentOperationId; reason: DurableEvidence }>,
  ): Reply<QuiesceResult>
}
export type AgentAccessOperation =
  | 'invoke'
  | 'resume'
  | 'submit'
  | 'control'
  | 'read'
  | 'events'
  | 'acknowledge'
  | 'takeover'
  | 'observe'
  | 'resolve'
  | 'connect'
  | 'reserve'
  | 'publish'
  | 'withdraw'
  | 'quiesce'
  | 'query'
  | 'load'
  | 'reconcile'
  | 'detach'
  | 'record-terminal-observation'
  | 'receive-result'
  | 'read-message-handoff'
  | 'record-message-handoff'
  | 'exclude-message-handoff'
  | 'settle'
  | 'migrate-cancellation'
export type AgentAccessTarget =
  | Readonly<{ kind: 'scope'; scope: DurableEvidence; definition: Adoption }>
  | Readonly<{ kind: 'instance'; instance: AgentInstanceId }>
  | Readonly<{ kind: 'execution'; execution: AgentExecutionId }>
  | Readonly<{ kind: 'input-entry'; execution: AgentExecutionId; operation: AgentOperationId }>
export type AgentAccessDecision =
  | Readonly<{ kind: 'allowed'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
export interface AgentAccessCheck<P> {
  check(
    input: Readonly<{
      access: Access<P>
      operation: AgentAccessOperation
      target: AgentAccessTarget
    }>,
  ): Promise<AgentAccessDecision>
}
export interface AgentClock {
  now(): Reply<AgentInstant>
  waitUntil(instant: AgentInstant, signal: AbortSignal): Reply<'elapsed' | 'cancelled'>
}
