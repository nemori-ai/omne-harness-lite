// Execution coordination and runtime instance types of the Agent contract (README, "托管协调与运行实例"):
// the execution record and its snapshot, the control and result-responsibility records, the event
// stream, the runtime, directory, recovery, adoption and instance-host ports, the access check and
// the clock. Types only; no function runs here. The Journal ports live in journal.ts.
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
import type { EffectIntent } from './journal.ts'
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
  output: Readonly<{ emittedThrough: string | null; acknowledgedThrough: string | null }>
  /**
   * The committed receiving entries in commit order, when the provider serves
   * `AgentJournalEntries`. Absent means the provider does not serve them, not that there are none.
   */
  entries?: readonly AgentJournalEntry[]
}>
export type AgentState =
  | Readonly<{ kind: 'idle'; instance: AgentInstanceId }>
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
  conclusion: AgentConclusion
  inputWatermark: DurableEvidence
  obligations: DurableEvidence
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
/** The input view of one execution handle; see SPEC "托管协调与运行实例". */
export interface AgentExecutionInput<P> {
  submit(input: ExecutionMutation<P> & Readonly<{ value: AcceptedInput }>): Reply<CommandReceipt>
}
/** The control view of one execution handle; see SPEC "取消、退出与结构变更". */
export interface AgentExecutionControl<P> {
  control(
    input: ExecutionMutation<P> & Readonly<{ command: ExecutionControl }>,
  ): Reply<CommandReceipt>
}
/** The output view of one execution handle: paged reads, a live stream and acknowledgement; see SPEC "事件流与读取". */
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
/** The input, control and output views of the one execution that invoke or resume returned; see SPEC "托管协调与运行实例". */
export interface AgentExecutionHandle<P> {
  readonly execution: AgentExecutionId
  readonly input: AgentExecutionInput<P>
  readonly control: AgentExecutionControl<P>
  readonly output: AgentExecutionEvents<P>
}
/** The runtime of one agent instance: start an execution or take one over; see SPEC "创建、登记与复用" and "恢复与接管". */
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
/** The live observation of one instance; see SPEC "创建、登记与复用". */
export interface AgentHandle<P> {
  readonly instance: AgentInstanceId
  observe(input: Access<P> & Readonly<{ signal: AbortSignal }>): AsyncIterable<AgentObservation>
}
/** The directory that resolves an instance to its runtime or to a live handle; see SPEC "创建、登记与复用". */
export interface AgentDirectory<P> {
  resolve(input: Access<P> & Readonly<{ instance: AgentInstanceId }>): Reply<AgentRuntime<P>>
  connect(
    input: Access<P> & Readonly<{ instance: AgentInstanceId }>,
  ): Reply<Readonly<{ kind: 'live'; handle: AgentHandle<P> }> | Readonly<{ kind: 'no-live-route' }>>
}
/** The entry that reconciles one execution when no live runtime exists; see SPEC "提交与保管" and "交接与停用". */
export interface AgentExecutionRecovery<P> {
  /** The four conclusions of SPEC "查询的四种结论与持久拒绝"; `rejected` only comes from recordControl. */
  query(
    input: ExecutionMutation<P>,
  ): Reply<
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
}
/** The port that resolves an adoption into its definition, evaluator and extensions and hands a snapshot over to another adoption; see SPEC "采用交接". */
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
/** The registration capability that the host gives a runtime at reserve; see SPEC "创建、登记与复用". */
export interface AgentRegistrationHandle<P> {
  readonly instance: AgentInstanceId
  report(input: Readonly<{ state: AgentState }>): void
  withdraw(
    input: Access<P> & Readonly<{ operation: AgentOperationId; reason: DurableEvidence }>,
  ): Reply<Registration | null>
}
/** The host that reserves, publishes and withdraws instances and owns the directory; see SPEC "创建、登记与复用". */
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
/** The control plane that retires an instance, given by the runtime provider to the host only; see SPEC "交接与停用". */
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
export type AgentAccessTarget =
  | Readonly<{ kind: 'scope'; scope: DurableEvidence; definition: Adoption }>
  | Readonly<{ kind: 'instance'; instance: AgentInstanceId }>
  | Readonly<{ kind: 'execution'; instance: AgentInstanceId; execution: AgentExecutionId }>
export type AgentAccessDecision =
  | Readonly<{ kind: 'allowed'; evidence: DurableEvidence }>
  | Readonly<{ kind: 'denied' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>
/** The port of the authorization domain that checks the current standing of a principal for one public operation; see SPEC "主体资格核验". */
export interface AgentAccessCheck<P> {
  check(
    input: Readonly<{
      access: Access<P>
      operation: AgentAccessOperation
      target: AgentAccessTarget
    }>,
  ): Promise<AgentAccessDecision>
}
/** The injected UTC reading and wait port; see SPEC "托管协调与运行实例". */
export interface AgentClock {
  /** Reads the provider's current UTC instant; unavailable time is not a fabricated reading. */
  now(): Reply<AgentInstant>
  waitUntil(instant: AgentInstant, signal: AbortSignal): Reply<'elapsed' | 'cancelled'>
}
