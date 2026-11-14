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
  ReplyAdmissionFrom,
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
  ReplyAdmissionPageCursor,
} from './identity.ts'
import type { FinishCandidateContent, SettlementRequest, SettlementResult } from './finishing.ts'

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
export type HandoffChange =
  | Readonly<{ kind: 'prepare'; request: PendingHandoff }>
  | Readonly<{ kind: 'resolve'; outcome: HandoffOutcome }>
  | Readonly<{
      kind: 'retire'
      excluded: Extract<HandoffResolution, { kind: 'excluded' }>
      reason: DurableEvidence
    }>
export type JournalCommitState =
  | Exclude<ExecutionState, { kind: 'ended' | 'settling' }>
  | Readonly<{ kind: 'settling' }>
export type JournalCommit<P> = ExecutionMutation<P> &
  Readonly<{
    authority: Authority
    expected: ExecutionRevision
    checkpoint: AgentCheckpoint
    state: JournalCommitState
    finish: FinishCandidateContent | null
    events: readonly Exclude<AgentEventBody, { kind: 'ended' | 'entry' }>[]
    effects: readonly EffectIntent[]
    caller: CallerCommit
    replyAdmission: ModelReplyAdmission | null
    handoff: HandoffChange | null
  }>
export type HandoffHistory =
  | Readonly<{ kind: 'pending' }>
  | Readonly<{ kind: 'committed'; operation: AgentOperationId; revision: ExecutionRevision }>
  | Readonly<{ kind: 'not-applicable' }>
  | Readonly<{ kind: 'retained'; disposition: DurableEvidence }>
export type HandoffRetirement = Readonly<{
  operation: AgentOperationId
  revision: ExecutionRevision
  reason: DurableEvidence
}>
export type HandoffCustodyAttempt = Readonly<{
  operation: AgentOperationId
  predecessor: AgentOperationId | null
  state: 'committed' | 'excluded'
}>
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
export type OriginalInputAcceptance = Readonly<{
  entry: InputEntry
  handoff: Extract<HandoffReference, { kind: 'input' }>
  outcome: HandoffOutcome
}>
export type JournalSubmitLineage =
  | Readonly<{ kind: 'new-input'; original: OriginalInputAcceptance }>
  | Readonly<{ kind: 'recognize-input'; original: OriginalInputAcceptance }>
export type HandoffFactSource = Readonly<{
  owner: string
  adoption: Adoption
  record: string
  version: string
}>
export type HandoffExclusionRecord = Readonly<{
  operation: AgentOperationId
  method: 'recordHandoff'
  request: DurableEvidence
  predecessor: AgentOperationId | null
  authority: DurableEvidence
  fence: DurableEvidence
}>
export type HandoffCustody = Readonly<{
  protocol: 'hand-off-custody-successor/1'
  custodyRoot: AgentOperationId
  rootRequest: DurableEvidence
  factSource: HandoffFactSource
  predecessor: Readonly<{ operation: AgentOperationId; request: DurableEvidence }>
  priorExcluded: readonly HandoffExclusionRecord[]
}>
export interface AgentJournalAttachment<P> {
  open(
    input: ExecutionMutation<P> &
      Readonly<{
        original: OriginalInputAcceptance
        runtime: InvokeRuntimeContext
        checkpoint: AgentCheckpoint
      }>,
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
export interface AgentJournalRecording<P> {
  commit(input: JournalCommit<P>): Reply<CommandReceipt>
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
  recordHandoff(
    input: ExecutionMutation<P> &
      Readonly<{
        original: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }>
        custody: HandoffCustody | null
      }>,
  ): Reply<CommandReceipt>
}
export interface AgentJournalFinishing<P> {
  prepareFinish(
    input: ExecutionMutation<P> &
      Readonly<{
        authorization: FinishAuthorization
        expected: ExecutionRevision
        candidate: AgentOperationId
      }>,
  ): Reply<Readonly<{ receipt: CommandReceipt; obligations: DurableEvidence }>>
  tryFinish(
    input: ExecutionMutation<P> &
      Readonly<{
        authorization: FinishAuthorization
        expected: ExecutionRevision
        intent: FinishIntent
      }>,
  ): Reply<FinishResult>
  commitSettlement(input: SettlementRequest<P>): Reply<SettlementResult>
}
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
export interface AgentJournalReading<P> {
  load(input: Access<P> & Readonly<{ execution: AgentExecutionId }>): Reply<ExecutionSnapshot>
  readCancellationInstallation?(
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
  ): Reply<DurableEvidence>
  inputs(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; watermark: DurableEvidence }>,
  ): Reply<Readonly<{ batch: InputBatch; messages: readonly Message[] }>>
  readReplyAdmissions(
    input: Access<P> &
      Readonly<{
        execution: AgentExecutionId
        from: ReplyAdmissionFrom
        through: DurableEvidence
        after: ReplyAdmissionPageCursor | null
        limit: number
      }>,
  ): Reply<ReplyAdmissionPage>
  query(input: ExecutionMutation<P>): ReturnType<AgentExecutionRecovery<P>['query']>
  readFinish?(
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
  ): Reply<FinishIntent | null>
  readonly output: Pick<AgentExecutionEvents<P>, 'read' | 'events'>
}
export type JournalCapabilities = Readonly<{
  coordination: 'standalone' | 'coordinated'
  participants: ReadonlySet<Exclude<CallerCommit['kind'], 'none'>>
}>
export interface AgentJournal<P>
  extends
    AgentJournalAttachment<P>,
    AgentJournalRecording<P>,
    AgentJournalFinishing<P>,
    AgentJournalObservation<P>,
    AgentJournalReading<P> {
  readonly capabilities: JournalCapabilities
}
