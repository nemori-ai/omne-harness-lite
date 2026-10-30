// Journal port types of the Agent contract (README, "执行记录与调用方交接端口"): the caller-commit
// union, the effect intent, the five role groups of the durable port and its joint-commit
// capabilities. Types only; no function runs here. The execution types that the groups use live in
// execution.ts.
import type { ToolOperationRef } from '@omne-harness/tool-contract'
import type { Message } from '@omne-harness/message'
import type {
  AgentCheckpoint,
  InputBatch,
  ModelReplyAdmission,
  PendingCall,
  PreparedContextTransition,
  ProducedResult,
  Reply,
  ReplyAdmissionPage,
} from './evaluation.ts'
import type {
  AcceptedInput,
  AgentEventBody,
  AgentExecutionControl,
  AgentExecutionEvents,
  AgentExecutionInput,
  AgentExecutionRecovery,
  CommandReceipt,
  ControlStage,
  ExecutionMutation,
  ExecutionSnapshot,
  ExecutionState,
  FinishAuthorization,
  FinishIntent,
  FinishResult,
} from './execution.ts'
import type {
  Access,
  ActionId,
  Adoption,
  AgentExecutionId,
  AgentInstanceId,
  AgentOperationId,
  Authority,
  ConsumptionId,
  DurableEvidence,
  ExecutionRevision,
  PassageId,
} from './identity.ts'

export type CallerCommit =
  | Readonly<{ kind: 'none' }>
  | Readonly<{
      kind: 'message'
      message: Message
      source: DurableEvidence
      admission: DurableEvidence
    }>
  | Readonly<{
      kind: 'context-transition'
      value: PreparedContextTransition
      admission: DurableEvidence
    }>
  | Readonly<{
      kind: 'custody'
      result: ProducedResult
      consumption: ConsumptionId
      retained: DurableEvidence
    }>
  | Readonly<{
      kind: 'processed'
      result: ProducedResult
      consumption: ConsumptionId
      completion: DurableEvidence
    }>
export type EffectIntent = Readonly<{
  action: ActionId
  pending: PendingCall
  authority: Authority
}>
export type JournalCommit<P> = ExecutionMutation<P> &
  Readonly<{
    authority: Authority
    expected: ExecutionRevision
    checkpoint: AgentCheckpoint
    state: Exclude<ExecutionState, { kind: 'ended' }>
    /** The `entry` and `ended` kinds are allocated only by the Journal itself (SPEC "日志条目" 6). */
    events: readonly Exclude<AgentEventBody, { kind: 'ended' | 'entry' }>[]
    effects: readonly EffectIntent[]
    caller: CallerCommit
    replyAdmission: ModelReplyAdmission | null
  }>
/** The role group that opens an execution, attaches to it and detaches; see SPEC "托管协调与运行实例". */
export interface AgentJournalAttachment<P> {
  open(
    input: ExecutionMutation<P> &
      Readonly<{
        instance: AgentInstanceId
        grant: DurableEvidence | null
        initial: AcceptedInput
        checkpoint: AgentCheckpoint
      }>,
  ): Reply<Readonly<{ receipt: CommandReceipt; authority: Authority }>>
  attach(
    input: ExecutionMutation<P> &
      Readonly<{
        instance: AgentInstanceId
        grant: DurableEvidence | null
        recovery: DurableEvidence
        takeover: DurableEvidence | null
      }>,
  ): Reply<Readonly<{ receipt: CommandReceipt; authority: Authority }>>
  detach(input: Parameters<AgentExecutionRecovery<P>['detach']>[0]): Reply<DurableEvidence>
}
/** The role group that records commits, inputs, controls, acknowledgements and results; see SPEC "托管协调与运行实例" and "提交参加者协议". */
export interface AgentJournalRecording<P> {
  commit(input: JournalCommit<P>): Reply<CommandReceipt>
  submit(input: Parameters<AgentExecutionInput<P>['submit']>[0]): Reply<CommandReceipt>
  control(input: Parameters<AgentExecutionControl<P>['control']>[0]): Reply<CommandReceipt>
  acknowledge(input: Parameters<AgentExecutionEvents<P>['acknowledge']>[0]): Reply<CommandReceipt>
  recordResult(
    input: ExecutionMutation<P> &
      Readonly<{
        result: ProducedResult
        consumption: ConsumptionId
        transfer:
          | Extract<CallerCommit, { kind: 'custody' | 'processed' }>
          | Readonly<{ kind: 'none' }>
        release:
          | Readonly<{ kind: 'pending' }>
          | Readonly<{ kind: 'confirmed'; receipt: DurableEvidence }>
      }>,
  ): Reply<CommandReceipt>
  recordControl(
    input: ExecutionMutation<P> &
      Readonly<{
        target: AgentOperationId
        toolOperation?: ToolOperationRef
        stage: Exclude<ControlStage, 'accepted'>
        state: 'reached' | 'unresolved'
        source: DurableEvidence
      }>,
  ): Reply<CommandReceipt>
}
/** The role group that ends an execution under an authorization; see SPEC "条件终结". */
export interface AgentJournalFinishing<P> {
  tryFinish(
    input: ExecutionMutation<P> &
      Readonly<{
        authorization: FinishAuthorization
        expected: ExecutionRevision
        intent: FinishIntent
      }>,
  ): Reply<FinishResult>
}
/** The role group that records what a post-terminal observer saw; see SPEC "条件终结". */
export interface AgentJournalObservation<P> {
  recordTerminalObservation(
    input: ExecutionMutation<P> &
      Readonly<{
        terminal: DurableEvidence
        passage: PassageId
        implementation: Adoption
        observed: DurableEvidence
      }>,
  ): Reply<CommandReceipt>
}
/** The read-only role group: snapshot, inputs, reply admissions, outcome query and event reads; see SPEC "托管协调与运行实例". */
export interface AgentJournalReading<P> {
  load(input: Access<P> & Readonly<{ execution: AgentExecutionId }>): Reply<ExecutionSnapshot>
  inputs(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; watermark: DurableEvidence }>,
  ): Reply<Readonly<{ batch: InputBatch; messages: readonly Message[] }>>
  readReplyAdmissions(
    input: Access<P> &
      Readonly<{
        execution: AgentExecutionId
        through: DurableEvidence
        after: string | null
        limit: number
      }>,
  ): Reply<ReplyAdmissionPage>
  query(input: ExecutionMutation<P>): ReturnType<AgentExecutionRecovery<P>['query']>
  readonly output: Pick<AgentExecutionEvents<P>, 'read' | 'events'>
}
export type JournalCapabilities = Readonly<{
  participants: ReadonlySet<Exclude<CallerCommit['kind'], 'none'>>
}>
/** The durable port of Agent, the union of its five role groups and its joint-commit capabilities; see SPEC "托管协调与运行实例" and "提交参加者协议". */
export interface AgentJournal<P>
  extends
    AgentJournalAttachment<P>,
    AgentJournalRecording<P>,
    AgentJournalFinishing<P>,
    AgentJournalObservation<P>,
    AgentJournalReading<P> {
  readonly capabilities: JournalCapabilities
}
