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
  HandoffOutcome,
  HandoffReference,
  HandoffRequest,
  HandoffResolution,
  InputEntry,
  InvokeRuntimeContext,
  PendingHandoff,
} from './passages.ts'
import type {
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
/**
 * The handoff part of one commit (SPEC "消息准入"): `prepare` is P, which saves the complete
 * PendingHandoff and sets `checkpoint.currentHandoff` to H; `resolve` is Ja, which commits the
 * fixed outcome of H with the real history of this source; `retire` is the Ja variant that retires
 * a trusted excluded internal H without publishing anything.
 */
export type HandoffChange =
  | Readonly<{ kind: 'prepare'; request: PendingHandoff }>
  | Readonly<{ kind: 'resolve'; outcome: HandoffOutcome }>
  | Readonly<{
      kind: 'retire'
      excluded: Extract<HandoffResolution, { kind: 'excluded' }>
      reason: DurableEvidence
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
    handoff: HandoffChange | null
  }>
/**
 * Whether the history of one H was published (SPEC "真实历史的提交点"): pending until a Ja applies
 * it, committed by that Ja, not applicable for a rejected or retired H, or retained by the terminal
 * disposition when the execution ended before the Ja.
 */
export type HandoffHistory =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'committed'; operation: AgentOperationId; revision: ExecutionRevision }>
  | Readonly<{ kind: 'not-applicable' }>
  | Readonly<{ kind: 'retained'; disposition: DurableEvidence }>
/** The retirement of an excluded internal H: the retire Ja, its revision and its reason. */
export type HandoffRetirement = Readonly<{
  operation: AgentOperationId
  revision: ExecutionRevision
  reason: DurableEvidence
}>
/** One attempt of the Rh custody chain of an H, as the snapshot projects it. */
export type HandoffCustodyAttempt = Readonly<{
  operation: AgentOperationId
  predecessor: AgentOperationId | null
  state: 'committed' | 'excluded'
}>
/**
 * One handoff responsibility of an execution, an element of `load.handoffs` (SPEC "消息准入" and
 * "准入结果保管"): the complete request, the P basis for an internal request, the resolution the
 * Journal holds, the history disposition, the retirement and the Rh custody chain.
 */
export type ExecutionHandoff = Readonly<{
  handoff: HandoffReference
  request: HandoffRequest
  prepared: DurableEvidence | null
  resolution: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }> | null
  history: HandoffHistory
  retirement: HandoffRetirement | null
  custody: Readonly<{
    root: AgentOperationId
    chain: readonly HandoffCustodyAttempt[]
    committed: AgentOperationId | null
  }> | null
}>
/**
 * The original acceptance of an external input, as `open` and `submit` receive it: the complete
 * entry, the H reference and the outcome that `prepare` fixed for it.
 */
export type OriginalInputAcceptance = Readonly<{
  entry: InputEntry
  handoff: Extract<HandoffReference, { kind: 'input' }>
  outcome: HandoffOutcome
}>
/**
 * The lineage of one `Journal.submit` (SPEC "输入内容与水位线"): `new-input` accepts the original
 * submit entry for the first time; `recognize-input` expresses a new operation B that recognizes
 * the acceptance of the same InputId by an original operation A.
 */
export type JournalSubmitLineage =
  | Readonly<{ kind: 'new-input'; original: OriginalInputAcceptance }>
  | Readonly<{ kind: 'recognize-input'; original: OriginalInputAcceptance }>
/** The fixed fact source of an Rh root: the owner, exact adoption, immutable record and version. */
export type HandoffFactSource = Readonly<{
  owner: string
  adoption: Adoption
  record: string
  version: string
}>
/** One link of the authoritative exclusion chain from the custody root to a predecessor. */
export type HandoffExclusionRecord = Readonly<{
  operation: AgentOperationId
  method: 'recordHandoff'
  request: DurableEvidence
  predecessor: AgentOperationId | null
  authority: DurableEvidence
  fence: DurableEvidence
}>
/**
 * The narrow successor branch of `recordHandoff` (SPEC "准入结果保管"): the root, its fixed request
 * and fact source, the direct predecessor and the ordered chain of permanent exclusions.
 */
export type HandoffCustody = Readonly<{
  protocol: 'hand-off-custody-successor/1'
  custodyRoot: AgentOperationId
  rootRequest: DurableEvidence
  factSource: HandoffFactSource
  predecessor: Readonly<{ operation: AgentOperationId; request: DurableEvidence }>
  priorExcluded: readonly HandoffExclusionRecord[]
}>
/** The role group that opens an execution, attaches to it and detaches; see SPEC "托管协调与运行实例". */
export interface AgentJournalAttachment<P> {
  /**
   * The instance, the grant and the initial checkpoint come only from the two parts: the runtime
   * context and the invoke entry of the original acceptance (SPEC "逐操作及输入分类").
   */
  open(
    input: ExecutionMutation<P> &
      Readonly<{ original: OriginalInputAcceptance; runtime: InvokeRuntimeContext }>,
  ): Reply<Readonly<{ receipt: CommandReceipt; authority: Authority }>>
  attach(
    input: ExecutionMutation<P> &
      Readonly<{
        instance: InvokeRuntimeContext['instance']
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
  /** The public submit value with its lineage; the lineage is an internal input, not a public parameter. */
  submit(
    input: Parameters<AgentExecutionInput<P>['submit']>[0] &
      Readonly<{ lineage: JournalSubmitLineage }>,
  ): Reply<CommandReceipt>
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
  /**
   * Rh: merges the original admission result or exclusion of an H into the existing execution
   * without publishing history (SPEC "准入结果保管"). The root carries `custody: null`; a successor
   * carries the custody chain of its permanently excluded predecessors.
   */
  recordHandoff(
    input: ExecutionMutation<P> &
      Readonly<{
        original: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }>
        custody: HandoffCustody | null
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
/**
 * What one Journal binding declares (SPEC "提交参加者协议"): its coordination mode, which the factory
 * compares with the configured one and which has no implicit default, and the CallerCommit kinds
 * whose participant it can serve.
 */
export type JournalCapabilities = Readonly<{
  coordination: 'standalone' | 'coordinated'
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
