import { pendingCalls } from './pending.ts'
import { createHash } from 'node:crypto'
import { canonical } from './canonical.ts'
import type { JournalCell, TransactionAnswer } from './root.ts'
import type {
  AcceptedInput,
  AgentCheckpoint,
  ProducedResult,
  AgentEvent,
  AgentEventBody,
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  Authority,
  CallerCommit,
  CommandReceipt,
  ConsumerRef,
  ControlRecord,
  ControlStage,
  EffectIntent,
  EventPage,
  DurableEvidence,
  ExecutionControl,
  ExecutionHandoff,
  ExecutionMutation,
  ExecutionRevision,
  ExecutionSnapshot,
  ExecutionState,
  Failure,
  FinishResult,
  HandoffCustody,
  HandoffReference,
  HandoffRequest,
  HandoffResolution,
  InputBatchId,
  InputId,
  JournalCommit,
  ModelReplyAdmission,
  OriginalInputAcceptance,
  PendingCall,
  ReplyAdmissionFrom,
  ReplyAdmissionGapReason,
  ReplyAdmissionItem,
  ReplyAdmissionPage,
  ReplyAdmissionPageCursor,
  ReplyAdmissionPrefix,
  ReplyAdmissionProjection,
  ReplyAdmissionRead,
  ReplyAdmissionSequence,
  ResultResponsibility,
  TerminalObservation,
  Adoption,
  Access,
  AgentJournalEntry,
  AgentReceivedProvider,
  CancellationJudgmentInput,
  CancellationJudgmentRecord,
  CancellationPolicy,
  CancellationPolicyInstallation,
  CardReconciliationRecord,
  FinishAuthorization,
  FinishCandidate,
  FinishObligation,
  FinishRoute,
  JournalCommitState,
  LegacyF2Entry,
  LegacyInvocationReturn,
  MigrationRecord,
  SettlementRequest,
  SettlementResult,
  ObligationDisposition,
  RecoveryContinuation,
  StepId,
  TerminalParticipantFact,
  ToolAssociationRecord,
} from '@omne-harness/agent-contract'
import type { TestHostRecord } from './host-record.ts'
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentOperationId,
  decodeReplyAdmissionPageCursor,
  decodeReplyAdmissionSequence,
} from '@omne-harness/agent-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { decodeModelCallId, resolveModelInvocationRef } from '@omne-harness/model-contract'
import {
  resolveToolInvocationRef,
  resolveToolOperationRef,
  type ToolInvocationParts,
  type ToolInvocationRef,
  type ToolOperationParts,
  type ToolOperationRef,
} from '@omne-harness/tool-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelReceptionTargets, ToolReceptionTargets } from './reception-targets.ts'
import { createJournalReceiving, type JournalReceivingControls } from './journal-receiving.ts'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  completeEvidence,
  attachmentIdOf,
  batchIdOf,
  frozenSet,
  journalEvidence,
  revisionOf,
  semanticKey,
  sequenceOf,
  JOURNAL_OWNER,
} from './journal-values.ts'
import {
  advances,
  answer as answerOf,
  batchEvidence,
  batchOf as buildBatch,
  blobOf,
  blobsOf,
  checkpointOf,
  cursorMoved,
  cursorOf as cursorMembersOf,
  emptyExecutionView,
  fold,
  receiptOf as batchReceiptOf,
  BATCH_MAX_FACTS,
  refOf,
  type Answer,
  type Blob,
  type ExclusionReason,
  type ExecutionView,
  type FactBody,
  type ParticipationKind,
  type ProducerCall,
  type PublishedBatch,
  type ResultStage,
} from '../journal/index.ts'
import { listKey } from '../journal/fold.ts'
import {
  beforeTerminalOpen,
  buildObligations,
  candidateOf,
  currentCandidate,
  currentObligations,
  currentRoute,
  emptyFinishing,
  finishCheck,
  intentOf,
  projectionOf,
  routeOf,
  sameContent,
  settlementOf,
  type FinishingRecords,
  applyCandidate,
  applySettlement,
  candidateFact,
  candidateOfView,
  listOfView,
  listsIssued,
  issueFacts,
  obligationChanges,
  callObligations,
  resultObligations,
  LEDGER_KINDS,
  touchedBy,
  routeOfView,
  settlementBlock,
  settlementOfFact,
  supersessionOf,
  type RecordedSettlement,
} from './journal-finishing.ts'

export type JointCommitKind = Exclude<CallerCommit['kind'], 'none'>

export type JournalWrite =
  | 'open'
  | 'attach'
  | 'detach'
  | 'commit'
  | 'submit'
  | 'control'
  | 'acknowledge'
  | 'recordResult'
  | 'recordControl'
  | 'recordHandoff'
  | 'prepareFinish'
  | 'tryFinish'
  | 'commitSettlement'
  | 'recordTerminalObservation'
  | 'received'
  | 'record'
  | 'preserve'

export type JournalRead = 'load' | 'inputs' | 'readReplyAdmissions' | 'query' | 'read'

export type WriteFault =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'commit-unknown'; outcome: 'applied' | 'dropped' | 'pending' }>

export type ParticipantResponse =
  | 'participate'
  | 'fail'
  | 'fail-unknown'
  | 'conflict'
  | 'unsupported'

export type JointFact = Readonly<{
  execution: AgentExecutionId
  operation: AgentOperationId
  caller: Exclude<CallerCommit, { kind: 'none' }>
}>

type Qualification<P, X> = (input: Access<P> & X) => boolean

/**
 * The current decision of the joint participation one public `commit` or `recordResult` derives:
 * the evidence of the allowed decision and the digest of the command it decided. The journal
 * hands it to the participant of the same call only.
 */
export type JointDecision = Readonly<{ evidence: DurableEvidence; digest: string }>

/**
 * The answer of a public write whose participation was decided for a revision that a concurrent
 * write of the same execution has since passed: nothing of this call is committed, the decision is
 * not asked again within the call, and a retry decides the participation at the current revision.
 */
export const outrunParticipation: Failure = {
  kind: 'unavailable',
  owner: 'session-qualification',
  diagnostic:
    'the execution revision advanced after the Session decision; this call committed nothing and can be retried',
}

export type MemoryAgentJournalOptions<P> = Readonly<{
  prepareResult?: (
    input: ExecutionMutation<P>,
    method: 'commit' | 'recordResult',
  ) => Promise<Failure | undefined>

  /**
   * Asked once per public `commit` or `recordResult` whose caller participates, after the Agent
   * qualification and before any Session preparation or the joint publication. `receipt` is the
   * receipt this call will issue: the same operation at the same revision issues the same evidence,
   * so the decided command and the published command carry the same participation.
   */
  qualifyParticipation?: (
    input: ExecutionMutation<P>,
    method: 'commit' | 'recordResult',
    receipt: CommandReceipt,
  ) => Promise<Outcome<JointDecision, Failure>>

  /**
   * Whether one public `commit` or `recordResult` derives a Session participation, so that
   * `qualifyParticipation` decides it. Absent: the call participates when its caller is not none.
   * A binding whose fixed history combination also writes the main reply of a caller-none Ja
   * (Agent SPEC "真实历史的提交点") says so here.
   */
  participates?: (input: ExecutionMutation<P>, method: 'commit' | 'recordResult') => boolean

  retainedToolInvocationFaults?: boolean

  participants?: Iterable<JointCommitKind>

  /**
   * The Session co-check of the grant of `open` or `attach` (PA-01 items 1 and 3), run in the same
   * write. This binding is coordinated: a null grant, or a grant the check refuses, is denied.
   */
  grant?: Qualification<
    P,
    Readonly<{ execution: AgentExecutionId; grant: DurableEvidence; method: 'open' | 'attach' }>
  >

  custodian?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>

  observer?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>

  readLimit?: number

  eventSchema?: Adoption

  replyAdmissionRule?: Adoption

  /**
   * The trusted cancellation judgment this binding holds (Agent SPEC "安装记录与资格"): the
   * installation governance issued and the pure implementation it names, taken at the assembly
   * entry, never from a caller. Absent: the candidate, migration and judgment variants of
   * commitSettlement answer `unavailable`.
   */
  cancellation?: Readonly<{
    installation: CancellationPolicyInstallation
    policy: CancellationPolicy
  }>

  /**
   * The trusted host reads the three custody variants of commitSettlement resolve a source to,
   * by the record text of the source evidence; read at each call. A source no record answers is
   * unreadable: the variant answers `unavailable`.
   */
  hostRecords?: ReadonlyMap<string, TestHostRecord>

  /**
   * The read-only terminal condition of the Session participant of this coordinated binding
   * (AD-01, PA-02) for the cancel `control`: the participant fact of a judgment input, read again
   * by tryFinish on the cancellation route. Absent: a judgment carries no participant fact.
   */
  terminalParticipant?: (
    input: Readonly<{ execution: AgentExecutionId; control: AgentOperationId }>,
  ) => TerminalParticipantFact
}>

export type MemoryAgentJournal<P> = Readonly<{
  port: AgentJournal<P>
  provider: AgentReceivedProvider<P, ContentBlock> & {
    received: NonNullable<AgentReceivedProvider<P, ContentBlock>['received']>
  }
  targets: ModelReceptionTargets<P>
  toolTargets: ToolReceptionTargets<P>
  receiving: JournalReceivingControls<P>
  durability: 'none'

  setRetainedToolInvocationFault(
    input: Readonly<{
      tenant: TenantId
      execution: AgentExecutionId
      control: AgentOperationId
      fault: Readonly<{ kind: 'malformed' }> | null
    }>,
  ):
    | Readonly<{ kind: 'applied' }>
    | Readonly<{ kind: 'cleared' }>
    | Readonly<{
        kind: 'rejected'
        reason: 'disabled' | 'invalid-input' | 'target-unavailable' | 'not-tool-control'
      }>

  failNext(method: JournalWrite, fault: WriteFault): void

  failNextRead(method: JournalRead): void

  respond(kind: JointCommitKind, response: ParticipantResponse): void

  settle(
    execution: AgentExecutionId,
    operation: AgentOperationId,
    outcome: 'applied' | 'dropped',
    tenant?: TenantId,
  ): boolean

  joint(): readonly JointFact[]

  /**
   * Seeds a legacy cancelled candidate as a writer of the old protocol left it (Agent SPEC
   * "旧取消记录的迁移"): a candidate whose conclusion is cancelled, on an author route whose
   * before-terminal proof is set, with one new revision. It writes the Journal records directly,
   * not through `commit`: the protocol fence does not accept such an F1 any more. Answers false
   * when the execution is not held or already ended.
   */
  seedLegacyCandidate(
    execution: AgentExecutionId,
    candidate: AgentOperationId,
    tenant?: TenantId,
  ): boolean

  applyRetention(execution: AgentExecutionId, tenant?: TenantId): number

  /** The reply admission controls of the Agent D5 tests (Agent SPEC "回复准入的已核实前缀"). */
  replyAdmissions: SessionReplyAdmissionControls
}>

/** The reply admission controls of this Journal; `tenant` names the tenant when two could match. */
export type SessionReplyAdmissionControls = Readonly<{
  /**
   * Admits `count` admitted model reply facts in one new revision, as original Ja commits would:
   * each with its sequence, basis, publication and the incremental projection. Answers false
   * when the execution is not held or ended.
   */
  seed(execution: AgentExecutionId, count: number, tenant?: TenantId): boolean
  /** Removes ledger material as a storage fault would. Answers false when it names nothing. */
  damage(execution: AgentExecutionId, damage: AdmissionDamage, tenant?: TenantId): boolean
  /** Sets this Journal's own page bounds; null leaves a bound out. Default: none. */
  limitPages(limits: AdmissionPageLimits): void
  /** The read counters of this Journal since it was created. */
  statistics(): Readonly<AdmissionCounters>
  /**
   * Changes the projection rule. `rebuild` converts the projection of the execution by folding
   * its facts from the origin; `none` leaves it, so `load` answers `unavailable`.
   */
  changeRule(
    execution: AgentExecutionId,
    rule: Adoption,
    conversion: 'rebuild' | 'none',
    tenant?: TenantId,
  ): boolean
}>

type Attachment = {
  authority: Authority
  /** The grant the Session handed out for this attachment (`exec.attached.grant`), as given. */
  grant: DurableEvidence | null
  status: 'active' | 'detached' | 'superseded'
  handoff: DurableEvidence | null
  /** The revision at which the handoff was established, for a later detach that recognizes it. */
  handoffRevision: number
}

type Range = Readonly<{ from: number; to: number }>

/**
 * The input range of a batch that an execution took, when the in-process index is rebuilt from the
 * events: from the position of its first input, or, for an empty batch (a step that took no input),
 * the range its identity names, which `inputs` issued as `batchIdOf(execution, from, to)`.
 */
function takenRange(
  execution: Readonly<{ id: AgentExecutionId; inputs: readonly Readonly<{ id: InputId }>[] }>,
  batch: Readonly<{ id: InputBatchId; ordered: readonly InputId[] }>,
): Range | undefined {
  const [first] = batch.ordered
  if (first !== undefined) {
    const from = execution.inputs.findIndex(input => input.id === first)
    return from < 0 ? undefined : { from, to: from + batch.ordered.length }
  }
  const named = /\/batch\/(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/u.exec(String(batch.id))
  if (named === null) return undefined
  const from = Number(named[1])
  const to = Number(named[2])
  return from === to &&
    to <= execution.inputs.length &&
    batchIdOf(execution.id, from, to) === batch.id
    ? { from, to }
    : undefined
}

/** The schema the Journal stamps on every event unless the options name one. */
export const DEFAULT_EVENT_SCHEMA: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'agent-event',
  revision: '1',
  digest: 'memory:agent-event',
})

/** The reply admission rule of the Journal unless the options name one. */
export const DEFAULT_REPLY_ADMISSION_RULE: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'reply-admission-projection',
  revision: '1',
  digest: 'memory:reply-admission-projection',
})

export type MemoryExecution = {
  id: AgentExecutionId
  tenant: TenantId
  revision: number
  /** The committed state; the FinishIntent of a settling execution is projected from `finishing`. */
  state: JournalCommitState | Extract<ExecutionState, { kind: 'ended' }>
  checkpoint: AgentCheckpoint
  attachments: Attachment[]
  inputs: AcceptedInput[]
  /** The revision at which each input was accepted, for a later submit that recognizes it. */
  inputRevisions: Map<InputId, number>

  events: AgentEvent[]
  retainedFrom: number
  acknowledged: number
  /** The revision at which the acknowledged prefix last advanced. */
  acknowledgedAt: number
  controls: ControlRecord[]
  results: ResultResponsibility[]
  /** The revision at which each result responsibility was last established, by result and consumption. */
  resultRevisions: Map<string, number>
  effects: EffectIntent[]
  observations: TerminalObservation[]

  stageReceipts: Map<string, CommandReceipt>

  observed: Map<TerminalObservation['passage'], CommandReceipt>
  /** The reply admission facts: index i holds the sequence i + 1. */
  admissions: AdmissionRecord[]
  admissionLedger: AdmissionLedger
  entries: AgentJournalEntry[]
  /** The handoff responsibilities of the execution, as `load.handoffs` projects them (SPEC "消息准入"). */
  handoffs: HandoffRecord[]
  /** Every Rh attempt that reached the write step, by operation, for the custody chain of its H. */
  custodyAttempts: Map<AgentOperationId, CustodyAttempt>
  /** The candidate, route, obligation, judgment and custody records (Agent SPEC "条件终结"). */
  finishing: FinishingRecords
  serial: number
}

/** One handoff responsibility; a write of the common root changes it in place on its draft copy. */
export type HandoffRecord = {
  handoff: HandoffReference
  request: HandoffRequest
  prepared: DurableEvidence | null
  resolution: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }> | null
  history: ExecutionHandoff['history']
  retirement: ExecutionHandoff['retirement']
}

type CustodyAttempt = Readonly<{
  handoff: HandoffReference
  original: Extract<HandoffResolution, { kind: 'recorded' | 'excluded' }>
  custody: HandoffCustody | null
}>

type Execution = MemoryExecution

type Committed = Readonly<{
  kind: 'committed'
  key: string
  value: unknown
  receipt: CommandReceipt
}>
/**
 * An excluded operation. The record names its execution, operation and reason so that the next
 * batch of the execution carries the exclusion as an `op.excluded` fact when the view does not
 * hold it yet (a held write the storage dropped, a re-run that answered without writing).
 */
type Excluded = Readonly<{
  kind: 'excluded'
  key: string
  execution: AgentExecutionId
  operation: AgentOperationId
  reason: ExclusionReason
  evidence: DurableEvidence
}>
/** The persistent rejection of a recordControl (Agent SPEC "查询的四种结论与持久拒绝"). */
type Rejected = Readonly<{
  kind: 'rejected'
  key: string
  failure: Extract<Failure, { kind: 'conflict' }>
  audit: DurableEvidence
  revision: ExecutionRevision
}>
type Pending = Readonly<{
  kind: 'pending'
  key: string
  tenant: TenantId
  execution: AgentExecutionId
  operation: AgentOperationId
  run: () => void
  /** What a drop of the held write records besides the exclusion; the attempt reached the write. */
  drop?: () => void
}>
export type OperationRecord = Committed | Rejected | Excluded | Pending

export type Attempt<R> =
  | Readonly<{ kind: 'answer'; value: Outcome<R, Failure> }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'write'; value: R; receipt: CommandReceipt; apply: () => void }>
  /**
   * A command of the fact family (SPEC "事实族与折叠核"): the facts its judgement produced, the
   * blocks they refer to, the participation kinds of the batch, the answer derived from the
   * appended batch, and the projection of the batch onto the reader view of the execution.
   */
  | Readonly<{
      kind: 'batch'
      facts: readonly FactBody[]
      blobs: readonly Blob[]
      kinds: readonly ParticipationKind[]
      derive: (answer: Answer) => R
      project: (batch: PublishedBatch, view: ExecutionView) => void
      /** The state the receipt names: `applied` unless the command accepts (submit, control). */
      receiptState?: CommandReceipt['state']
    }>
  /**
   * Contradicting evidence: the audit is a fact of one batch with one new revision, and the
   * conflict is fixed under the operation.
   */
  | Readonly<{
      kind: 'reject'
      failure: Extract<Failure, { kind: 'conflict' }>
      audit: DurableEvidence
      facts: readonly FactBody[]
      project: (batch: PublishedBatch, view: ExecutionView) => void
    }>

const STAGES: Readonly<Record<ExecutionControl['kind'], ReadonlySet<ControlStage>>> = {
  'interrupt-model': new Set([
    'intent-established',
    'producer-confirmed',
    'physically-stopped',
    'duty-released',
  ]),
  'interrupt-tool': new Set([
    'intent-established',
    'producer-confirmed',
    'physically-stopped',
    'duty-released',
  ]),
  'background-tool': new Set([
    'intent-established',
    'producer-confirmed',
    'physically-stopped',
    'duty-released',
  ]),
  cancel: new Set([
    'intent-established',
    'qualification-revoked',
    'producer-confirmed',
    'physically-stopped',
    'duty-released',
  ]),
  suspend: new Set(['intent-established', 'qualification-revoked', 'duty-released']),
}

const answer = <R>(value: Outcome<R, Failure>): Attempt<R> => ({ kind: 'answer', value })
const denied = (action: string): Failure => ({ kind: 'denied', action })
const conflict = (operation: AgentOperationId): Extract<Failure, { kind: 'conflict' }> => ({
  kind: 'conflict',
  operation,
})
const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })

function copy<T>(value: T): T {
  return structuredClone(value)
}

function sameResultKey(
  left: ResultResponsibility['result'],
  right: ResultResponsibility['result'],
) {
  return (
    left.producer.kind === right.producer.kind &&
    left.producer.call === right.producer.call &&
    left.version === right.version
  )
}

type ToolControlRecord = Extract<ControlRecord, { toolInvocation: ToolInvocationRef }>
type ControlTarget =
  | Pick<ToolControlRecord, 'command' | 'toolInvocation' | 'toolOperation'>
  | Pick<Exclude<ControlRecord, ToolControlRecord>, 'command'>

function controlTarget(
  command: ExecutionControl,
  calls: readonly PendingCall[],
  tenant: TenantId,
): Outcome<ControlTarget, Failure> {
  if (command.kind === 'cancel' || command.kind === 'suspend') return succeed({ command })
  if (command.kind === 'interrupt-model') {
    const matches = calls.some(pending => {
      if (pending.kind !== 'model') return false
      const parts = resolveModelInvocationRef(pending.reference, tenant)
      return 'ok' in parts && parts.ok.call === command.call
    })
    return matches
      ? succeed({ command })
      : fail(invalid('command.call', 'not a call of this execution'))
  }
  let matched: Extract<PendingCall, { association: 'associated' }> | undefined
  let admission: ToolOperationParts['admission'] | undefined
  let ambiguous = false
  for (const pending of calls) {
    if (pending.kind !== 'tool' || pending.association !== 'associated') continue
    const parts = resolveToolInvocationRef(pending.reference, tenant)
    if ('failure' in parts)
      return fail(invalid('command.call', 'invalid-tool-invocation-reference'))
    if (parts.ok.call !== command.call) continue
    if (matched !== undefined && admission !== parts.ok.admission) ambiguous = true
    matched = pending
    admission = parts.ok.admission
  }
  if (ambiguous) return fail(invalid('command.call', 'ambiguous-associated-tool-call'))
  if (matched === undefined) return fail(invalid('command.call', 'no-associated-tool-call'))
  return succeed({ command, toolInvocation: matched.reference, toolOperation: null })
}

/** The interrupt and background controls that name the call of `effect`, by their operations. */
function interruptionsOf(
  effect: EffectIntent,
  controls: readonly ControlRecord[],
  tenant: TenantId,
): AgentOperationId[] {
  const pending = effect.pending
  return controls
    .filter(control => {
      const command = control.command
      if (command.kind === 'interrupt-model') {
        if (pending.kind !== 'model') return false
        const parts = resolveModelInvocationRef(pending.reference, tenant)
        return 'ok' in parts && parts.ok.call === command.call
      }
      if (isToolControl(control))
        return (
          pending.kind === 'tool' &&
          pending.association === 'associated' &&
          control.toolInvocation === pending.reference
        )
      return false
    })
    .map(control => control.operation)
}

function isToolControl(record: ControlRecord): record is ToolControlRecord {
  return record.command.kind === 'interrupt-tool' || record.command.kind === 'background-tool'
}
const MALFORMED_RETAINED_TOOL_INVOCATION =
  'memory-journal:malformed-retained-tool-invocation' as ToolInvocationRef

function exactDataFields(value: unknown, fields: readonly string[]): boolean {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  const keys = Reflect.ownKeys(value)
  return (
    keys.length === fields.length &&
    fields.every(field => {
      const descriptor = Object.getOwnPropertyDescriptor(value, field)
      return descriptor !== undefined && 'value' in descriptor
    })
  )
}

type RetainedFaultInput = Parameters<
  MemoryAgentJournal<unknown>['setRetainedToolInvocationFault']
>[0]

/** The key of one operation record: the encoded tenant, the execution and the operation. */
export function operationText(
  tenant: string,
  execution: AgentExecutionId,
  operation: AgentOperationId,
) {
  return JSON.stringify([tenant, execution, operation])
}

function retainedFaultKey(input: RetainedFaultInput): string | undefined {
  if (!exactDataFields(input, ['tenant', 'execution', 'control', 'fault'])) return undefined
  const tenant = tenantCodec.encode(input.tenant)
  if (
    !tenant.ok ||
    'failure' in decodeAgentExecutionId(input.execution) ||
    'failure' in decodeAgentOperationId(input.control)
  )
    return undefined
  const key = operationText(tenant.value, input.execution, input.control)
  const fault = input.fault
  if (fault === null) return key
  return exactDataFields(fault, ['kind']) && fault.kind === 'malformed' ? key : undefined
}

type LocalAttachment = Readonly<{
  kind: 'local'
  reference: ToolOperationRef
  parts: ToolOperationParts
}>
type SuppliedAttachment =
  | LocalAttachment
  | Readonly<{ kind: 'malformed'; reference: ToolOperationRef }>

function suppliedAttachment(
  request: Readonly<{ tenant: TenantId; toolOperation?: ToolOperationRef }>,
): SuppliedAttachment | undefined {
  const reference = request.toolOperation
  if (reference === undefined) return undefined
  const resolved = resolveToolOperationRef(reference, request.tenant)
  return 'ok' in resolved
    ? { kind: 'local', reference, parts: resolved.ok }
    : { kind: 'malformed', reference }
}

type Attached =
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'attached'; record: ToolControlRecord }>

const damaged = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'AgentJournal',
  diagnostic,
})

function retainedOperation(
  record: ToolControlRecord,
  invocation: ToolInvocationParts,
  tenant: TenantId,
): Outcome<ToolOperationParts | null, Failure> {
  if (record.toolOperation === null) return succeed(null)
  const diagnostic = 'invalid-retained-tool-operation'
  const retained = resolveToolOperationRef(record.toolOperation, tenant)
  if ('failure' in retained) return fail(damaged(diagnostic))
  return retained.ok.call === invocation.call && retained.ok.admission === invocation.admission
    ? succeed(retained.ok)
    : fail(damaged(diagnostic))
}

function attachToolOperation(
  record: ControlRecord,
  tenant: TenantId,
  recording: AgentOperationId,
  attachment: LocalAttachment | undefined,
): Outcome<Attached, Failure> {
  if (!isToolControl(record)) {
    return attachment === undefined
      ? succeed({ kind: 'unchanged' })
      : fail(invalid('toolOperation', 'not-applicable-to-control'))
  }
  const invocation = resolveToolInvocationRef(record.toolInvocation, tenant)
  if ('failure' in invocation) return fail(damaged('invalid-retained-tool-invocation'))
  const retained = retainedOperation(record, invocation.ok, tenant)
  if ('failure' in retained) return retained
  if (attachment === undefined) return succeed({ kind: 'unchanged' })
  const supplied = attachment.parts
  if (supplied.call !== invocation.ok.call || supplied.admission !== invocation.ok.admission) {
    return fail(conflict(recording))
  }
  if (retained.ok === null) {
    return succeed({
      kind: 'attached',
      record: { ...record, toolOperation: attachment.reference },
    })
  }
  return retained.ok.operation === supplied.operation
    ? succeed({ kind: 'unchanged' })
    : fail(conflict(recording))
}

function attachedRecord(
  record: ControlRecord,
  attached: Attached,
): Readonly<{ updated: ControlRecord; referenceAdded: boolean }> {
  switch (attached.kind) {
    case 'unchanged':
      return { updated: record, referenceAdded: false }
    case 'attached':
      return { updated: attached.record, referenceAdded: true }
  }
}

// ---------------------------------------------------------------------------------------------
// The reply admission ledger (Agent SPEC "回复准入的已核实前缀"): the same rules as the ledger of
// the Agent memory Journal (packages/agent/agent/src/testing/journal-admissions.ts), kept here so
// that this provider answers the Agent conformance suite on its own. A write replaces the records
// list and the ledger value; it never changes one in place, so the copy of an execution in a
// common-root draft stays apart from the published one.

/** One reply admission fact as the Journal keeps it, at index `sequence - 1`. */
export type AdmissionRecord = Readonly<{
  fact: ModelReplyAdmission
  /** The receipt evidence of the original Ja that published the fact. */
  publication: DurableEvidence
  /** The basis of the prefix that ends with this fact; null when a test removed it. */
  basis: DurableEvidence | null
  /** False when a test removed the fact itself. */
  present: boolean
}>

/** The projection the original Ja maintains: the counts under `rule` and the end prefix. */
export type AdmissionProjection = Readonly<{
  rule: Adoption
  consecutive: number
  total: number
  last: DurableEvidence | null
  sequence: number
  basis: DurableEvidence
}>

/** The per-execution state of the ledger besides the facts. A write replaces it whole. */
export type AdmissionLedger = Readonly<{
  /** The basis of the zero prefix, formed by the original open; null when a test removed it. */
  origin: DurableEvidence | null
  /** The first sequence whose fact is still kept; 1 keeps every fact. */
  retainedFrom: number
  /** The smallest `through` sequence that still resolves; 0 resolves every range. */
  rangesFrom: number
  projection: AdmissionProjection
}>

/**
 * Where a ledger belongs: `parts` are the tenant text first, then the scope texts of the provider,
 * then the execution. Every basis, range and cursor the ledger mints names them.
 */
export type AdmissionScope = Readonly<{
  parts: readonly string[]
  owner: string
  mint(record: string, revision: number): DurableEvidence
}>

/** What the reads of one Journal did, for the complexity tests (Agent SPEC D5 第 8 节). */
export type AdmissionCounters = {
  /** Range positions: one per page that reads at least one row. */
  seeks: number
  /** Rows a read touched, including rows it then skipped. */
  scanned: number
  /** Facts a read decoded into a page. */
  decoded: number
  pages: number
  /** Facts a projection rebuild folded. */
  folds: number
  loads: number
  /** Commits that wrote a checkpoint. */
  checkpointWrites: number
}

function admissionCounters(): AdmissionCounters {
  return { seeks: 0, scanned: 0, decoded: 0, pages: 0, folds: 0, loads: 0, checkpointWrites: 0 }
}

/** A test removal of ledger material, as a storage fault or an operator error would leave it. */
export type AdmissionDamage =
  | Readonly<{ kind: 'missing-fact'; sequence: number }>
  | Readonly<{ kind: 'missing-basis'; sequence: number }>
  | Readonly<{ kind: 'retention'; from: number }>
  | Readonly<{ kind: 'range-unavailable'; below: number }>

/** How the provider limits one page by itself, besides the caller's `limit`. */
export type AdmissionPageLimits = Readonly<{ items: number | null; bytes: number | null }>

const PREFIX = 'reply-admission-prefix'
const RANGE = 'reply-admissions'
const CURSOR = 'rac1.'

function sequenceText(value: number): ReplyAdmissionSequence {
  const decoded = decodeReplyAdmissionSequence(String(value))
  if ('failure' in decoded) throw new Error(`memory Journal minted an invalid sequence: ${value}`)
  return decoded.ok
}

/** The record text of a basis or range: the scope parts, the kind and the sequence. */
function recordOf(scope: AdmissionScope, kind: string, sequence: number): string {
  return `${JSON.stringify(scope.parts)}/${kind}/${sequence}`
}

/** The scope parts and the sequence a record text names, or undefined when it is not one. */
function parseRecord(
  record: string,
  kind: string,
): Readonly<{ parts: readonly string[]; sequence: bigint }> | undefined {
  const marker = `/${kind}/`
  const at = record.lastIndexOf(marker)
  if (at < 0) return undefined
  const decoded = decodeReplyAdmissionSequence(record.slice(at + marker.length))
  if ('failure' in decoded) return undefined
  try {
    const parts: unknown = JSON.parse(record.slice(0, at))
    if (!Array.isArray(parts) || !parts.every(part => typeof part === 'string')) return undefined
    return { parts, sequence: BigInt(decoded.ok) }
  } catch {
    return undefined
  }
}

/** Another tenant is `denied`, any other scope `invalid` (Agent SPEC "判定次序与失败映射" 1). */
function scopeFailure(
  scope: AdmissionScope,
  parts: readonly string[],
  field: string,
  action: string,
): Failure | undefined {
  if (parts[0] !== scope.parts[0]) return { kind: 'denied', action }
  if (canonical(parts) !== canonical(scope.parts))
    return { kind: 'invalid', field, reason: 'not of this execution' }
  return undefined
}

/** The ledger of a new execution: the zero prefix formed by the original open at `revision`. */
function originLedger(scope: AdmissionScope, rule: Adoption, revision: number) {
  const origin = scope.mint(recordOf(scope, PREFIX, 0), revision)
  const ledger: AdmissionLedger = {
    origin,
    retainedFrom: 1,
    rangesFrom: 0,
    projection: { rule, consecutive: 0, total: 0, last: null, sequence: 0, basis: origin },
  }
  return ledger
}

/** The projection after one more fact: the incremental step of the original Ja. */
function stepProjection(
  projection: AdmissionProjection,
  fact: ModelReplyAdmission,
  basis: DurableEvidence,
): AdmissionProjection {
  return fact.decision === 'rejected'
    ? {
        ...projection,
        consecutive: projection.consecutive + 1,
        total: projection.total + 1,
        sequence: projection.sequence + 1,
        basis,
      }
    : {
        ...projection,
        consecutive: 0,
        last: fact.source,
        sequence: projection.sequence + 1,
        basis,
      }
}

/**
 * The record and the next ledger of one new fact, published by the Ja at `revision` with the
 * receipt evidence `publication`. The caller writes both in the same write as the Ja.
 */
function admit(
  scope: AdmissionScope,
  ledger: AdmissionLedger,
  fact: ModelReplyAdmission,
  revision: number,
  publication: DurableEvidence,
): Readonly<{ record: AdmissionRecord; ledger: AdmissionLedger }> {
  const sequence = ledger.projection.sequence + 1
  const basis = scope.mint(recordOf(scope, PREFIX, sequence), revision)
  return {
    record: { fact, publication, basis, present: true },
    ledger: { ...ledger, projection: stepProjection(ledger.projection, fact, basis) },
  }
}

/** The key of the deduplication of SPEC:598: the original call and result version. */
function admissionKey(fact: ModelReplyAdmission): string {
  return JSON.stringify([fact.call, fact.resultVersion])
}

/** The fixed range of the current facts, as `load` names it. */
function throughOf(scope: AdmissionScope, ledger: AdmissionLedger): DurableEvidence {
  const sequence = ledger.projection.sequence
  return scope.mint(recordOf(scope, RANGE, sequence), sequence)
}

/** The projection `load` returns, or a failure when the rule changed without a conversion. */
function admissionProjectionOf(
  scope: AdmissionScope,
  ledger: AdmissionLedger,
  rule: Adoption,
): Outcome<ReplyAdmissionProjection, Failure> {
  const projection = ledger.projection
  if (canonical(projection.rule) !== canonical(rule))
    return fail({
      kind: 'unavailable',
      owner: scope.owner,
      diagnostic: 'the reply admission rule changed without a conversion of the projection',
    })
  return succeed({
    through: throughOf(scope, ledger),
    rule: projection.rule,
    lastAdmission: projection.last,
    consecutiveDenials: String(projection.consecutive),
    totalDenials: String(projection.total),
    prefix: { sequence: sequenceText(projection.sequence), basis: projection.basis },
  })
}

/** Every row from index `start`, `count` rows; each row touched is counted. */
function rowsOf(
  records: readonly (AdmissionRecord | undefined)[],
  start: number,
  count: number,
  counters: AdmissionCounters,
): (AdmissionRecord | undefined)[] {
  if (count > 0) counters.seeks += 1
  const rows: (AdmissionRecord | undefined)[] = []
  for (let index = start; index < start + count && index < records.length; index += 1) {
    counters.scanned += 1
    rows.push(records[index])
  }
  return rows
}

/**
 * The projection of every fact under `rule`, folded from the origin: the cold path of a rule
 * change (Agent SPEC D5 第 4 节). Undefined when a fact is missing: there is no trusted start.
 */
function rebuild(
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  rule: Adoption,
  counters: AdmissionCounters,
): AdmissionProjection | undefined {
  if (ledger.origin === null || ledger.retainedFrom > 1) return undefined
  let projection: AdmissionProjection = {
    rule,
    consecutive: 0,
    total: 0,
    last: null,
    sequence: 0,
    basis: ledger.origin,
  }
  for (const row of rowsOf(records, 0, records.length, counters)) {
    counters.folds += 1
    if (row === undefined || !row.present || row.basis === null) return undefined
    projection = stepProjection(projection, row.fact, row.basis)
  }
  return projection
}

/** The resolution of a basis: its sequence, a refusal, or material the Journal lost. */
type Resolved =
  | Readonly<{ kind: 'resolved'; sequence: number }>
  | Readonly<{ kind: 'refused'; failure: Failure }>
  | Readonly<{ kind: 'missing'; sequence: number }>

/**
 * Resolves `prefix` by a point read of its basis: another tenant is `denied`, another execution,
 * an unknown or forged basis, or a sequence that does not match is `invalid`, a lawful basis whose
 * material the Journal lost is `missing`.
 */
function resolvePrefix(
  scope: AdmissionScope,
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  prefix: ReplyAdmissionPrefix,
  field: string,
  action: string,
  counters: AdmissionCounters,
): Resolved {
  const refused = (reason: string): Resolved => ({
    kind: 'refused',
    failure: { kind: 'invalid', field, reason },
  })
  if (prefix.basis.owner !== scope.owner) return refused('not a basis of this Journal')
  const parsed = parseRecord(prefix.basis.record, PREFIX)
  if (parsed === undefined) return refused('not a prefix basis')
  const scoped = scopeFailure(scope, parsed.parts, field, action)
  if (scoped !== undefined) return { kind: 'refused', failure: scoped }
  if (String(parsed.sequence) !== prefix.sequence)
    return refused('the sequence is not the one of the basis')
  if (parsed.sequence > BigInt(ledger.projection.sequence))
    return refused('beyond the published facts')
  const sequence = Number(parsed.sequence)
  counters.seeks += 1
  const stored = sequence === 0 ? ledger.origin : (records[sequence - 1]?.basis ?? null)
  if (stored === null) return { kind: 'missing', sequence }
  if (!sameEvidence(stored, prefix.basis)) return refused('not the basis of this prefix')
  return { kind: 'resolved', sequence }
}

/** A short digest of a text, so that a cursor stays within the identity length. */
function digestOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

/**
 * The cursor of the next page: digests of the tenant and of the full scope with the execution
 * origin, the lower bound, the range and the end of the page before. It carries no grant.
 */
function cursorOf(
  scope: AdmissionScope,
  origin: DurableEvidence | null,
  from: number,
  through: number,
  at: number,
): ReplyAdmissionPageCursor {
  const tenant = digestOf(scope.parts[0] ?? '')
  const bound = digestOf(JSON.stringify([scope.parts, origin?.digest ?? null]))
  const decoded = decodeReplyAdmissionPageCursor(
    `${CURSOR}${tenant}.${bound}.${from}.${through}.${at}`,
  )
  if ('failure' in decoded) throw new Error('memory Journal minted an invalid cursor')
  return decoded.ok
}

/** The end of the page before that a cursor names, after checking it against the request. */
function cursorPosition(
  scope: AdmissionScope,
  origin: DurableEvidence | null,
  cursor: string,
  from: number,
  through: number,
  action: string,
): Outcome<number, Failure> {
  const refused = (reason: string) => fail<Failure>({ kind: 'invalid', field: 'after', reason })
  const fields = cursor.startsWith(CURSOR) ? cursor.slice(CURSOR.length).split('.') : []
  if (fields.length !== 5) return refused('not a cursor of this Journal')
  const [tenant, bound, start, end, at] = fields
  if (tenant !== digestOf(scope.parts[0] ?? '')) return fail({ kind: 'denied', action })
  if (bound !== digestOf(JSON.stringify([scope.parts, origin?.digest ?? null])))
    return refused('another execution or execution origin')
  if (start !== String(from)) return refused('another lower bound')
  if (end !== String(through)) return refused('another range')
  const position = Number(at)
  if (!/^[1-9][0-9]*$/u.test(at ?? '') || !Number.isSafeInteger(position))
    return refused('not a position')
  if (position <= from || position >= through) return refused('outside the range')
  return succeed(position)
}

/** The fixed range a `through` names, a refusal, or the gap of a range no longer resolvable. */
function resolveThrough(
  scope: AdmissionScope,
  ledger: AdmissionLedger,
  through: DurableEvidence,
  action: string,
): Outcome<number, Failure> | Readonly<{ gap: ReplyAdmissionGapReason }> {
  const refused = fail<Failure>({ kind: 'invalid', field: 'through', reason: 'not a range' })
  if (through.owner !== scope.owner) return refused
  const parsed = parseRecord(through.record, RANGE)
  if (parsed === undefined) return refused
  const scoped = scopeFailure(scope, parsed.parts, 'through', action)
  if (scoped !== undefined) return fail(scoped)
  if (parsed.sequence > BigInt(ledger.projection.sequence)) return refused
  const sequence = Number(parsed.sequence)
  if (!sameEvidence(through, scope.mint(recordOf(scope, RANGE, sequence), sequence))) return refused
  if (sequence < ledger.rangesFrom) return { gap: 'range-unavailable' }
  return succeed(sequence)
}

export type AdmissionReadRequest = Readonly<{
  from: ReplyAdmissionFrom
  through: DurableEvidence
  after: ReplyAdmissionPageCursor | null
  limit: number
}>

/**
 * One page of the fixed range `(from, through]` (Agent SPEC "回复准入的已核实前缀", 3.3): at most
 * `limit` facts and at most the provider's own item and byte limits, at least one fact unless the
 * range is complete, a gap for a missing fact, a missing basis, retention or a range that no
 * longer resolves.
 */
function readAdmissionPage(
  scope: AdmissionScope,
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  request: AdmissionReadRequest,
  limits: AdmissionPageLimits,
  revision: number,
  action: string,
  counters: AdmissionCounters,
): Outcome<ReplyAdmissionPage, Failure> {
  const gap = (reason: ReplyAdmissionGapReason) =>
    succeed<ReplyAdmissionPage>({
      kind: 'gap',
      reason,
      recovery: scope.mint(`${JSON.stringify(scope.parts)}/reply-admission-recovery`, revision),
    })
  if (!Number.isSafeInteger(request.limit) || request.limit < 1)
    return fail({ kind: 'invalid', field: 'limit', reason: 'not a positive integer' })
  const through = resolveThrough(scope, ledger, request.through, action)
  if ('gap' in through) return gap(through.gap)
  if ('failure' in through) return through
  const target = through.ok
  let from: number
  if (request.from.kind === 'origin') {
    if (ledger.origin === null)
      return fail({
        kind: 'unavailable',
        owner: scope.owner,
        diagnostic: 'no trusted origin of the reply admission facts',
      })
    from = 0
  } else {
    const resolved = resolvePrefix(
      scope,
      records,
      ledger,
      request.from.prefix,
      'from',
      action,
      counters,
    )
    if (resolved.kind === 'refused') return fail(resolved.failure)
    if (resolved.kind === 'missing') return gap('missing-basis')
    from = resolved.sequence
  }
  if (from > target)
    return fail({ kind: 'invalid', field: 'from', reason: 'after the end of the range' })
  let start = from
  if (request.after !== null) {
    const position = cursorPosition(scope, ledger.origin, request.after, from, target, action)
    if ('failure' in position) return position
    start = position.ok
  }
  const startBasis = start === 0 ? ledger.origin : (records[start - 1]?.basis ?? null)
  if (startBasis === null) return gap('missing-basis')
  const startPrefix = { sequence: sequenceText(start), basis: startBasis }
  counters.pages += 1
  if (start === target)
    return succeed({
      kind: 'page',
      through: request.through,
      start: startPrefix,
      end: startPrefix,
      items: [],
      tail: { kind: 'complete' },
    })
  if (start + 1 < ledger.retainedFrom) return gap('retention')
  const count = Math.min(request.limit, limits.items ?? request.limit, target - start)
  const items: ReplyAdmissionItem[] = []
  let bytes = 0
  // The basis of each row, for the end of the page: only the last fact of a page needs one.
  const bases: (DurableEvidence | null)[] = []
  for (const [offset, row] of rowsOf(records, start, count, counters).entries()) {
    if (row === undefined || !row.present) {
      if (items.length === 0) return gap('missing-fact')
      break
    }
    const size = canonical(row.fact).length
    // A fact larger than the provider's byte limit still gets a page of its own.
    if (limits.bytes !== null && items.length > 0 && bytes + size > limits.bytes) break
    bytes += size
    counters.decoded += 1
    items.push({
      sequence: sequenceText(start + offset + 1),
      fact: row.fact,
      publication: row.publication,
    })
    bases.push(row.basis)
  }
  // A page ends at its last fact whose prefix basis the Journal still holds.
  while (items.length > 0 && bases.at(-1) === null) {
    items.pop()
    bases.pop()
  }
  if (items.length === 0) return gap('missing-basis')
  const last = items.at(-1)!
  const end: ReplyAdmissionPrefix = { sequence: last.sequence, basis: bases.at(-1)! }
  const reached = start + items.length
  return succeed({
    kind: 'page',
    through: request.through,
    start: startPrefix,
    end,
    items,
    tail:
      reached === target
        ? { kind: 'complete' }
        : { kind: 'more', next: cursorOf(scope, ledger.origin, from, target, reached) },
  })
}

/**
 * The commit-time check of a checkpoint's read position (Agent SPEC D5 5.1, 预防): when it changes,
 * the new value is verified, its basis resolves to this execution, it does not pass the published
 * facts and it does not go back. Another tenant's basis is `denied`; a lawful basis whose material
 * the Journal lost is `unavailable` with the diagnostic `missing-basis`. A point read; no scan.
 */
function checkReadPosition(
  scope: AdmissionScope,
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  saved: ReplyAdmissionRead,
  next: ReplyAdmissionRead,
  action: string,
  counters: AdmissionCounters,
): Failure | undefined {
  const field = 'checkpoint.replyAdmissionRead'
  if (canonical(saved) === canonical(next)) return undefined
  if (next.kind !== 'verified')
    return { kind: 'invalid', field, reason: 'a verified read position does not go back' }
  const resolved = resolvePrefix(scope, records, ledger, next.prefix, field, action, counters)
  if (resolved.kind === 'refused') return resolved.failure
  if (resolved.kind === 'missing')
    return {
      kind: 'unavailable',
      owner: scope.owner,
      diagnostic: `missing-basis: the basis of the prefix ${resolved.sequence} cannot be resolved`,
    }
  if (saved.kind === 'verified' && BigInt(next.prefix.sequence) < BigInt(saved.prefix.sequence))
    return { kind: 'invalid', field, reason: 'the read position goes back' }
  return undefined
}

/** The records and ledger after `damage`; the records are replaced, never changed in place. */
function damagedLedger(
  records: readonly (AdmissionRecord | undefined)[],
  ledger: AdmissionLedger,
  damage: AdmissionDamage,
): Readonly<{ records: (AdmissionRecord | undefined)[]; ledger: AdmissionLedger }> | undefined {
  const next = [...records]
  switch (damage.kind) {
    case 'missing-fact':
    case 'missing-basis': {
      if (damage.kind === 'missing-basis' && damage.sequence === 0)
        return { records: next, ledger: { ...ledger, origin: null } }
      const row = next[damage.sequence - 1]
      if (row === undefined) return undefined
      next[damage.sequence - 1] =
        damage.kind === 'missing-fact' ? { ...row, present: false } : { ...row, basis: null }
      return { records: next, ledger }
    }
    case 'retention':
      return { records: next, ledger: { ...ledger, retainedFrom: damage.from } }
    case 'range-unavailable':
      return { records: next, ledger: { ...ledger, rangesFrom: damage.below } }
    default: {
      const _exhaustive: never = damage
      return _exhaustive
    }
  }
}

function sameEvidence(left: DurableEvidence | null, right: DurableEvidence | null): boolean {
  if (left === null || right === null) return left === right
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

/** Whether two data values are the same content, by their canonical text. */
/**
 * A checkpoint with its optional `adoptedRequest` spelled out: the cursor folds an absent one as
 * null (`checkpointOf`), so two checkpoints are compared in this one shape.
 */
function sameShape(checkpoint: AgentCheckpoint): AgentCheckpoint {
  return { ...checkpoint, adoptedRequest: checkpoint.adoptedRequest ?? null }
}

/** The producer call of a produced result: the identities a result fact refers to it by. */
function producerCallOf(result: ProducedResult): ProducerCall {
  return {
    producer: result.producer.kind,
    call: String(result.producer.call),
    version: result.version,
    delivery: result.delivery,
    source: copy(result.source),
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}

/** The handoff record of `reference` in the execution, or `undefined`. */
function handoffRecord(
  execution: Execution,
  reference: HandoffReference,
): HandoffRecord | undefined {
  return execution.handoffs.find(record => sameValue(record.handoff, reference))
}

/** Whether the handoff is still undetermined: no history applied and no retirement (SPEC "消息准入"). */
function undetermined(record: HandoffRecord): boolean {
  return record.history.kind === 'pending' && record.retirement === null
}

/** The `load.handoffs` projection: every record with the custody chain `custody` derives. */
function handoffsOf(
  execution: Execution,
  custody: (handoff: HandoffReference) => ExecutionHandoff['custody'],
): readonly ExecutionHandoff[] {
  // A record's members are replaced, never changed in place: one level of copy keeps a snapshot
  // apart from the later writes of the record.
  return execution.handoffs.map(record => ({ ...record, custody: custody(record.handoff) }))
}

/** The original acceptance that `open` or a new-input `submit` carries, checked against the method. */
function acceptanceFailure(
  method: 'open' | 'submit',
  input: ExecutionMutation<unknown>,
  original: OriginalInputAcceptance,
): Failure | undefined {
  const { entry, handoff, outcome } = original
  if (entry.kind !== (method === 'open' ? 'invoke' : 'submit'))
    return invalid(
      'original.entry',
      `not the entry of ${method === 'open' ? 'an invoke' : 'a submit'}`,
    )
  if (entry.operation !== input.operation)
    return invalid('original.entry', 'not the entry of this operation')
  if (entry.execution !== input.execution)
    return invalid('original.entry', 'not an entry of this execution')
  if (
    handoff.execution !== input.execution ||
    handoff.entry !== entry.operation ||
    handoff.input !== (entry.kind === 'invoke' ? entry.initial : entry.value).id
  )
    return invalid('original.handoff', 'not the handoff of this entry')
  if (outcome.request.kind !== 'input' || !sameValue(outcome.request.reference, handoff))
    return invalid('original.outcome', 'not the outcome of this handoff')
  if (!sameValue(outcome.request.entry, entry))
    return invalid('original.outcome', 'the outcome names another entry')
  if (outcome.decision.kind !== 'prepared')
    return invalid('original.outcome', 'the handoff is not prepared')
  if (outcome.origin !== null && outcome.origin.kind !== entry.kind)
    return invalid(
      'original.outcome',
      `the origin is not ${entry.kind === 'invoke' ? 'an invoke' : 'a submit'}`,
    )
  return undefined
}

/** The record of an external H that the original open or submit publishes as its real history. */
function inputHandoff(
  acceptance: OriginalInputAcceptance,
  operation: AgentOperationId,
  revision: number,
): HandoffRecord {
  return {
    handoff: copy(acceptance.handoff),
    request: copy(acceptance.outcome.request),
    prepared: null,
    resolution: { kind: 'recorded', outcome: copy(acceptance.outcome) },
    history: { kind: 'committed', operation, revision: revisionOf(revision) },
    retirement: null,
  }
}

export function createJournal<P>(
  cell: JournalCell<P>,
  options: MemoryAgentJournalOptions<P> = {},
): MemoryAgentJournal<P> {
  const retainedToolInvocationFaults = options.retainedToolInvocationFaults === true
  const retainedToolInvocationBaselines = new Map<string, ToolInvocationRef>()
  const participants = frozenSet(options.participants ?? [])
  const readLimit = options.readLimit ?? 100
  const eventSchema: Adoption = options.eventSchema ?? DEFAULT_EVENT_SCHEMA
  let admissionRule: Adoption = options.replyAdmissionRule ?? DEFAULT_REPLY_ADMISSION_RULE
  const state = () => cell.state().agent
  const caches = new WeakMap<
    Execution,
    {
      batches: Map<InputBatchId, Range>
      watermarks: Map<string, Range>
    }
  >()
  const admissionStatistics = admissionCounters()
  let pageLimits: AdmissionPageLimits = { items: null, bytes: null }
  const cache = (execution: Execution) => {
    let value = caches.get(execution)
    if (!value) {
      const original = cell.original(execution)
      const prior = original === undefined ? undefined : caches.get(original)
      if (prior) {
        value = {
          batches: new Map(prior.batches),
          watermarks: new Map(prior.watermarks),
        }
        caches.set(execution, value)
        return value
      }
      value = { batches: new Map(), watermarks: new Map() }
      for (const event of execution.events)
        if (event.body.kind === 'input-taken') {
          const range = takenRange(execution, event.body.batch)
          if (range !== undefined) value.batches.set(event.body.batch.id, range)
        }
      caches.set(execution, value)
    }
    return value
  }
  const executionKey = (tenant: TenantId, id: AgentExecutionId) => {
    const encoded = tenantCodec.encode(tenant)
    return JSON.stringify([encoded.ok ? encoded.value : null, id])
  }

  const writeFaults = new Map<JournalWrite, WriteFault[]>()
  const readFaults = new Map<JournalRead, number>()
  const responses = new Map<JointCommitKind, ParticipantResponse[]>()

  const operationKey = (
    tenant: TenantId,
    execution: AgentExecutionId,
    operation: AgentOperationId,
  ): string | undefined => {
    const text = tenantCodec.encode(tenant)
    return text.ok ? operationText(text.value, execution, operation) : undefined
  }

  /**
   * The qualification names one call is checked under (Agent SPEC "commitSettlement 的变体"): the
   * candidate and judgment variants need settle, a migration needs settle and
   * migrate-cancellation, the custody variants need reconcile; every other call its own method.
   */
  function qualificationsOf(action: string, input: object): readonly string[] {
    if (action === 'preserve') return ['materials.preserve']
    if (action !== 'commitSettlement' || !('kind' in input)) return [action]
    switch (input.kind) {
      case 'establish-cancellation':
      case 'judge-cancellation':
        return ['settle']
      case 'migrate-cancellation':
        return ['settle', 'migrate-cancellation']
      default:
        // The request type closes the six kinds, so the rest are the three custody variants.
        return ['reconcile']
    }
  }

  function owned(
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
    action: string,
  ): Outcome<Execution, Failure> {
    for (const name of qualificationsOf(action, input)) {
      const rejected = cell.authorize(input, name)
      if (rejected) return fail(rejected)
    }
    if (cell.gate() !== null)
      return fail({ kind: 'unavailable', owner: 'session-history', diagnostic: cell.gate()! })
    const execution = state().executions.get(executionKey(input.tenant, input.execution))
    if (execution === undefined || !tenantEquals(execution.tenant, input.tenant)) {
      return fail(denied(action))
    }
    return succeed(execution)
  }

  function recognized<R>(
    input: ExecutionMutation<P>,
    key: string,
  ): Outcome<R, Failure> | undefined {
    const at = operationKey(input.tenant, input.execution, input.operation)
    const record = at === undefined ? undefined : state().operations.get(at)
    if (record?.kind === 'rejected') {
      // A persistent rejection answers its fixed conflict again; another input conflicts too, and
      // neither writes a second audit.
      return fail(record.key === key ? copy(record.failure) : conflict(input.operation))
    }
    if (record?.kind !== 'committed') return undefined
    return record.key === key ? succeed(copy(record.value) as R) : fail(conflict(input.operation))
  }

  /**
   * The evidence of the next write of `execution`. Inside a common-root transaction it advances the
   * serial of the transaction's copy, which a refused transaction discards. Outside one (the
   * reservation and the preview before a result preparation) it only reads: the published root
   * is not written.
   */
  function nextEvidence(execution: Execution, what: string, revision: number): DurableEvidence {
    const serial = execution.serial + 1
    if (cell.writing()) execution.serial = serial
    return cell.issueEvidence(
      journalEvidence(`${cell.namespace}/${execution.id}/${what}/${serial}`, revision),
    )
  }

  /**
   * The receipt a public write would issue if it committed now, or the one it recognizes, before
   * its transaction. It runs outside any transaction, so it only reads the published root; the
   * transaction's own preparation advances the serial, and a refused or outrun call leaves
   * nothing behind.
   */
  function reservedReceipt(
    method: 'commit' | 'recordResult',
    input: ExecutionMutation<P>,
    key: string,
  ): CommandReceipt | undefined {
    const at = operationKey(input.tenant, input.execution, input.operation)
    const record = at === undefined ? undefined : state().operations.get(at)
    if (record?.kind === 'committed' && record.key === key) return copy(record.receipt)
    const execution = state().executions.get(executionKey(input.tenant, input.execution))
    if (execution === undefined) return undefined
    const revision = execution.revision + 1
    // The write appends a batch: its receipt is minted from the batch it would append now.
    return receiptOf(
      execution,
      input.operation,
      revision,
      ownEvidence(execution.id, key, revision),
      'applied',
    )
  }

  function receiptOf(
    execution: Execution,
    operation: AgentOperationId,
    revision: number,
    evidence: DurableEvidence,
    state: CommandReceipt['state'],
  ): CommandReceipt {
    return {
      operation,
      execution: execution.id,
      revision: revisionOf(revision),
      evidence,
      state,
    }
  }

  function latestAttachment(execution: Execution): Attachment | undefined {
    return execution.attachments.at(-1)
  }

  function activeAttachment(execution: Execution): Attachment | undefined {
    const latest = latestAttachment(execution)
    return latest?.status === 'active' ? latest : undefined
  }

  function holds(execution: Execution, authority: Authority): boolean {
    const active = activeAttachment(execution)
    return (
      cell.advances(execution.id, authority) &&
      active !== undefined &&
      active.authority.executionAttachment === authority.executionAttachment &&
      active.authority.generation === authority.generation &&
      active.authority.instance === authority.instance
    )
  }

  function appendEvents(
    execution: Execution,
    bodies: readonly AgentEventBody[],
    cause: DurableEvidence,
  ): void {
    const attachment = latestAttachment(execution)
    // `open` establishes the first attachment before anything is written, so an execution without
    // one is a defect of this Journal, not a case to pass over in silence.
    if (attachment === undefined) {
      throw new TypeError('the session Journal has an execution without an attachment')
    }
    // The ended event is the last event of an execution; nothing is appended after it.
    if (execution.events.at(-1)?.body.kind === 'ended') return
    for (const body of bodies) {
      execution.events.push({
        execution: execution.id,
        sequence: String(execution.events.length + 1),
        executionAttachment: attachment.authority.executionAttachment,
        schema: eventSchema,
        cause,
        body: copy(body),
      })
    }
    if (bodies.length > 0) {
      cell.notify(execution.id)
    }
  }

  async function write<R>(
    method: JournalWrite,
    input: ExecutionMutation<P>,
    key: string,
    prepare: () => Attempt<R>,
    beforeRecognition?: () => Failure | undefined,
    onDropped?: () => void,
  ): Promise<Outcome<R, Failure>> {
    const entered = enter(method, input)
    if ('failure' in entered) return entered
    // The pause point of the testing controls: everything this call does on the Session side
    // (the participation decision, result preparation, the joint publication) comes after it.
    await cell.wait(input, method)
    let decision: JointDecision | null = null
    if (method === 'commit' || method === 'recordResult') {
      const caller =
        method === 'commit'
          ? (input as Parameters<AgentJournal<P>['commit']>[0]).caller
          : (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
      const participates = options.participates?.(input, method) ?? caller.kind !== 'none'
      if (participates && options.qualifyParticipation) {
        // The Session decision of the derived participation: once per public call, before any
        // Session preparation, the pause point and the joint publication; a recognized operation
        // is decided again with its original receipt.
        const receipt = reservedReceipt(method, input, key)
        if (receipt === undefined) return fail(denied(method))
        const qualified = await options.qualifyParticipation(input, method, receipt)
        if ('failure' in qualified) return qualified
        // A write of the same execution committed while the decision was outstanding: stop before
        // any Session preparation. The joint publication checks the decided command again.
        const current = reservedReceipt(method, input, key)
        if (
          current === undefined ||
          current.revision !== receipt.revision ||
          !sameEvidence(current.evidence, receipt.evidence)
        )
          return fail(outrunParticipation)
        decision = qualified.ok
      }
      if (options.prepareResult && (caller.kind === 'custody' || caller.kind === 'processed')) {
        const refused = beforeRecognition?.()
        if (refused) return fail(refused)
        // The same validator handles both initial requests and retries. A held answer never prepares history.
        const preview = prepare()
        if (preview.kind === 'answer')
          return cell.transact(input, method, () =>
            run(
              method,
              entered.ok.fault,
              input,
              key,
              prepare,
              beforeRecognition,
              decision,
              onDropped,
            ),
          )
        if (preview.kind === 'unknown')
          return fail({ kind: 'commit-unknown', operation: input.operation })
        const failure = await options.prepareResult(input, method)
        if (failure) return fail(failure)
      }
    }
    return cell.transact(input, method, () =>
      run(method, entered.ok.fault, input, key, prepare, beforeRecognition, decision, onDropped),
    )
  }

  function enter(
    method: JournalWrite,
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
  ): Outcome<Readonly<{ fault: WriteFault | undefined }>, Failure> {
    const fault = writeFaults.get(method)?.shift()
    // Another tenant's write, or a write on an execution that does not exist (other than `open`),
    // is denied with the method before any qualification is asked for: the answer is the same for
    // an existing and a missing execution (Agent SPEC "判定次序与失败映射" 1).
    const target = state().executions.get(executionKey(input.tenant, input.execution))
    const foreign =
      target === undefined ? method !== 'open' : !tenantEquals(target.tenant, input.tenant)
    if (foreign) return fail(denied(method))
    for (const name of qualificationsOf(method, input)) {
      const refused = cell.authorize(input, name)
      if (refused) return fail(refused)
    }
    return succeed({ fault })
  }

  function run<R>(
    method: JournalWrite,
    fault: WriteFault | undefined,
    input: ExecutionMutation<P>,
    key: string,
    prepare: () => Attempt<R>,
    beforeRecognition?: () => Failure | undefined,
    decision: JointDecision | null = null,
    onDropped?: () => void,
  ): TransactionAnswer<R> {
    const answered = (outcome: Outcome<R, Failure>): TransactionAnswer<R> => ({
      kind: 'answered',
      outcome,
    })
    const at = operationKey(input.tenant, input.execution, input.operation)
    if (at === undefined) return answered(fail(denied(method)))
    const commitUnknown = fail<Failure>({ kind: 'commit-unknown', operation: input.operation })
    const scriptedUnavailable = fail<Failure>({
      kind: 'unavailable',
      owner: JOURNAL_OWNER,
      diagnostic: `${method} is scripted unavailable`,
    })
    const check = (): Failure | undefined => {
      if (beforeRecognition === undefined) return undefined
      const found = owned(input, method)
      return 'failure' in found ? found.failure : beforeRecognition()
    }
    const pending = state().operations.get(at)
    if (pending?.kind === 'pending') {
      if (fault !== undefined)
        return answered(fault.kind === 'unavailable' ? scriptedUnavailable : commitUnknown)
      const rejected = check()
      if (rejected !== undefined) return answered(fail(rejected))
      return answered(pending.key === key ? commitUnknown : fail(conflict(input.operation)))
    }
    const exclude = (reason: 'dropped' | 'no-write') => {
      const fixed = state().operations.get(at)?.kind
      if (fixed === 'committed' || fixed === 'rejected') return
      cell.touch()
      state().operations.set(at, {
        kind: 'excluded',
        key,
        execution: input.execution,
        operation: input.operation,
        reason,
        evidence: journalEvidence(
          `${cell.namespace}/${input.execution}/excluded/${input.operation}/${reason}`,
          0,
        ),
      })
    }
    type Run =
      | Readonly<{ kind: 'wrote'; value: R }>
      | Readonly<{ kind: 'answered'; value: Outcome<R, Failure> }>
      /** The persistent rejection saved its audit: the transaction publishes it. */
      | Readonly<{ kind: 'rejected'; failure: Extract<Failure, { kind: 'conflict' }> }>
      | Readonly<{ kind: 'unknown' }>
    const attempt = (): Run => {
      const rejected = check()
      if (rejected !== undefined) return { kind: 'answered', value: fail(rejected) }
      const prepared = prepare()
      if (prepared.kind === 'answer') return { kind: 'answered', value: prepared.value }
      if (prepared.kind === 'unknown') return prepared
      if (prepared.kind === 'reject') {
        const appended = append(input, key, {
          kind: 'batch',
          facts: prepared.facts,
          blobs: [],
          kinds: [],
          derive: receiptIn,
          project: prepared.project,
        })
        if ('failure' in appended) return { kind: 'answered', value: appended }
        cell.touch()
        state().operations.set(at, {
          kind: 'rejected',
          key,
          failure: prepared.failure,
          audit: prepared.audit,
          revision: appended.ok.receipt.revision,
        })
        return { kind: 'rejected', failure: prepared.failure }
      }
      if (prepared.kind === 'batch') {
        const appended = append(input, key, prepared)
        if ('failure' in appended) return { kind: 'answered', value: appended }
        const { value, receipt, advanced } = appended.ok
        // A batch that advances no revision (a recognition, or the envelope alone) changes no
        // reader record and carries no participation: it is saved as the operation's answer only.
        if (advanced) {
          const captured = cell.committed(input, method, receipt)
          if (captured) return { kind: 'answered', value: fail(captured) }
          // tryFinish asked the participant before preparing its batch (see the port).
          if (method !== 'tryFinish') {
            const participation = cell.participate(input, method, receipt, decision)
            if (participation !== undefined) return { kind: 'answered', value: fail(participation) }
          }
        }
        cell.touch()
        state().operations.set(at, { kind: 'committed', key, value: copy(value), receipt })
        return { kind: 'wrote', value }
      }
      prepared.apply()
      const captured = cell.committed(input, method, prepared.receipt)
      if (captured) return { kind: 'answered', value: fail(captured) }
      // tryFinish asked the participant before preparing its write (see the port).
      if (method !== 'tryFinish') {
        const participation = cell.participate(input, method, prepared.receipt, decision)
        if (participation !== undefined) return { kind: 'answered', value: fail(participation) }
      }
      cell.touch()
      state().operations.set(at, {
        kind: 'committed',
        key,
        value: copy(prepared.value),
        receipt: prepared.receipt,
      })
      return { kind: 'wrote', value: prepared.value }
    }

    const decide = (run: Run) => {
      if (run.kind === 'answered') exclude('no-write')
      if (run.kind === 'unknown') hold()
    }
    const hold = () => {
      const fixed = state().operations.get(at)?.kind
      if (fixed === 'committed' || fixed === 'rejected') return
      cell.touch()
      state().operations.set(at, {
        kind: 'pending',
        key,
        tenant: input.tenant,
        execution: input.execution,
        operation: input.operation,
        run: () => {
          state().operations.delete(at)
          decide(attempt())
        },
        ...(onDropped === undefined ? {} : { drop: onDropped }),
      })
    }
    if (fault === undefined) {
      const run = attempt()
      if (run.kind === 'wrote') return answered(succeed(run.value))
      if (run.kind === 'answered') return answered(run.value)
      if (run.kind === 'rejected') return run
      hold()
      return answered(commitUnknown)
    }
    if (fault.kind === 'unavailable') return answered(scriptedUnavailable)
    switch (fault.outcome) {
      case 'applied':
        decide(attempt())
        return answered(commitUnknown)
      case 'dropped':
        // The write reached the provider and was dropped: the attempt exists, nothing applied.
        onDropped?.()
        exclude('dropped')
        return answered(commitUnknown)
      case 'pending':
        hold()
        return answered(commitUnknown)
      default: {
        const _exhaustive: never = fault.outcome
        return _exhaustive
      }
    }
  }

  /** Where the batch evidence of this Journal is minted from: the owner and the session namespace. */
  const mint = { owner: JOURNAL_OWNER, session: cell.namespace }

  /** The fact-level view of an execution, before anything was appended for it. */
  function viewOf(execution: AgentExecutionId): ExecutionView {
    return state().view.executions.get(execution) ?? emptyExecutionView(execution)
  }

  /**
   * Appends the batch of one command (SPEC "事实族与折叠核"): the envelope names the operation, the
   * semantic key as its digest, the revision the batch reaches and the generation that writes it;
   * the blocks are put by digest; the batch is folded into the session view; the answer and the
   * receipt are derived from the appended batch; the projection updates the reader view. A refused
   * batch (a repeated fact, an excluded operation, an open without its attachment) writes nothing.
   */
  function append<R>(
    input: ExecutionMutation<P>,
    key: string,
    prepared: Extract<Attempt<R>, { kind: 'batch' }>,
  ): Outcome<Readonly<{ value: R; receipt: CommandReceipt; advanced: boolean }>, Failure> {
    const before = viewOf(input.execution)
    const attached = prepared.facts.find(fact => fact.kind === 'exec.attached')
    const gen =
      attached?.kind === 'exec.attached'
        ? attached.authority.generation
        : (before.attachments.findLast(item => item.status === 'active')?.authority.generation ??
          before.gen)
    const envelope = { op: input.operation, digest: key, rev: 0, gen, kinds: prepared.kinds }
    // The exclusions this process holds in memory and the view does not: facts of this batch, so
    // a copy rebuilt from the records holds them too. They move no revision.
    const facts = [...unpublishedExclusions(input, before, prepared.facts), ...prepared.facts]
    const built = buildBatch(before, envelope, facts)
    if ('kind' in built) {
      if (built.kind === 'incomplete') return fail(invalid('facts', built.reason))
      return fail(conflict(input.operation))
    }
    const agent = state()
    // The position of the batch is the next one after the folded view: the view is the fold of the
    // published log (the provider brings it to the publication count), so the position has one
    // source. The log of this process holds only the batches appended since the view was set.
    const pub = agent.view.head + 1
    // The revision the batch reaches. Until every command appends facts, the reader projection
    // is where the commands not yet migrated advance the revision; the batch continues from it.
    const current =
      agent.executions.get(executionKey(input.tenant, input.execution))?.revision ?? before.revision
    const advanced = advances({ ...built, pub })
    const rev = advanced ? current + 1 : current
    const batch: PublishedBatch = { ...built, envelope: { ...envelope, rev }, pub }
    for (const [digest, value] of prepared.blobs)
      if (!agent.blobs.has(digest)) agent.blobs.set(digest, copy(value))
    agent.log = [...agent.log, batch]
    const prior = agent.view
    agent.view = fold(agent.view, batch)
    const folded = agent.view.executions.get(input.execution)
    if (folded === undefined || folded.revision !== rev)
      throw new TypeError('the fold did not reach the revision the envelope names')
    const derived = answerOf(mint, agent.view, batch)
    const minted = batchReceiptOf(mint, agent.view, batch)
    // A planned evidence (the testing controls' `planEvidence`) names this write's receipt.
    const receipt: CommandReceipt = {
      ...minted,
      evidence: cell.issueEvidence(minted.evidence),
      state: prepared.receiptState ?? minted.state,
    }
    const value = prepared.derive(
      'receipt' in derived ? ({ ...derived, receipt } as Answer) : derived,
    )
    prepared.project(batch, folded)
    // R2-D322: the obligations the step changed join its own batch, read after its projection.
    // They answer nothing and move no revision; the batch is folded again with them.
    const owed = advanced
      ? ledgerChanges(
          input.tenant,
          input.execution,
          BATCH_MAX_FACTS - batch.facts.length,
          batch.facts,
        )
      : null
    if (owed !== null) {
      const amended: PublishedBatch = { ...batch, facts: [...batch.facts, ...owed.facts] }
      for (const [digest, value] of owed.blobs)
        if (!agent.blobs.has(digest)) agent.blobs.set(digest, copy(value))
      agent.log = [...agent.log.slice(0, -1), amended]
      agent.view = fold(prior, amended)
    }
    return succeed({ value, receipt, advanced })
  }

  /** One stage of a control as the fact that records it, with the control's target. */
  function controlStageOf(
    record: ControlRecord,
    stage: ControlStage,
    state: 'reached' | 'unresolved',
    source: DurableEvidence,
    step: StepId | null = null,
  ): FactBody {
    return {
      kind: 'control.stage',
      control: record.operation,
      command: copy(record.command),
      toolInvocation: record.toolInvocation === undefined ? null : copy(record.toolInvocation),
      toolOperation: record.toolOperation === undefined ? null : copy(record.toolOperation),
      stage,
      state,
      source,
      step,
    }
  }

  /**
   * The batch of a new operation that recognizes the fact `target` established at `revision`
   * (R2-D292 "原操作认回"): one `op.recognized`, no new revision, and `value` as its answer. The
   * answer is derived from the batch, whose revision is the recognized batch's; the revision the
   * reader records name is checked against it, so a recognition never answers another revision
   * than the fact it recognizes. The view is the fold of the whole published log (K-23), so the
   * target is in it; a target the view lacks is a defect of the fold, answered as unavailable,
   * never a fact recognized from the reader records alone.
   */
  function recognitionOf<R>(
    target: AgentOperationId | undefined,
    revision: number,
    value: (receipt: CommandReceipt) => R,
    receiptState: CommandReceipt['state'] = 'applied',
  ): Attempt<R> {
    if (target === undefined || !state().view.ops.has(target))
      return answer(
        fail({
          kind: 'unavailable',
          owner: JOURNAL_OWNER,
          diagnostic: `the fact recognized at revision ${String(revision)} is not in the folded view`,
        }),
      )
    return {
      kind: 'batch',
      facts: [{ kind: 'op.recognized', target }],
      blobs: [],
      kinds: [],
      derive: derived => {
        const receipt = receiptIn(derived)
        if (receipt.revision !== revisionOf(revision))
          throw new TypeError('a recognition answered another revision than the recognized fact')
        return value(receipt)
      },
      project: () => {},
      receiptState,
    }
  }

  /** The recognition that answers its own receipt: the common case. */
  function recognitionBatch(
    target: AgentOperationId | undefined,
    revision: number,
    receiptState: CommandReceipt['state'],
  ): Attempt<CommandReceipt> {
    return recognitionOf(target, revision, receipt => receipt, receiptState)
  }

  /**
   * The operation whose batch reached `revision` of an execution, if the log of this process holds
   * it: one batch advances an execution to each revision, so the revision names the batch.
   */
  function reachedBy(execution: AgentExecutionId, revision: number): AgentOperationId | undefined {
    return state().view.executions.get(execution)?.reached.get(revision)
  }

  /** The receipt an answer carries: every command but a detach answers one. */
  function receiptIn(derived: Answer): CommandReceipt {
    if (!('receipt' in derived)) throw new TypeError(`a ${derived.kind} answer carries no receipt`)
    return derived.receipt
  }

  /**
   * The evidence of the batch the running write is about to append, minted from the coordinates
   * that batch will have (the next pub of the log, the semantic key, the revision it reaches): the
   * evidence `append` answers the receipt with. A fact or a reader record that names its own batch
   * (an accepted control stage, the publication of a reply admission) carries it. Outside a
   * transaction it only reads, so it also reserves the receipt of a participation decision.
   */
  function ownEvidence(
    execution: AgentExecutionId,
    key: string,
    revision: number,
  ): DurableEvidence {
    const coordinates = { execution, pub: state().view.head + 1, envelope: { digest: key } }
    return cell.issueEvidence(batchEvidence(mint, coordinates as PublishedBatch, revision))
  }

  /** The evidence of an attachment or a detach: from stable elements, never from a counter. */
  function attachmentEvidence(
    execution: AgentExecutionId,
    what: 'attach' | 'handoff',
    ordinal: number,
    revision: number,
  ): DurableEvidence {
    return cell.issueEvidence(
      journalEvidence(`${cell.namespace}/${execution}/${what}/${ordinal}`, revision),
    )
  }

  /**
   * The receipt the batch of a write will derive, before the batch exists: the next publication,
   * the next revision (the same one when the batch is a pure recognition) and the semantic key as
   * its digest. A finishing record that names its own receipt (a list, a judgment, a disposition)
   * is built with it; `derive` checks the derived receipt against it, so a drift is a defect.
   */
  function plannedReceipt(
    execution: Execution,
    operation: AgentOperationId,
    key: string,
  ): CommandReceipt {
    const pub = state().view.head + 1
    const revision = execution.revision + 1
    const coordinates = { execution: execution.id, pub, envelope: { digest: key } }
    const evidence = cell.issueEvidence(
      batchEvidence(mint, coordinates as PublishedBatch, revision),
    )
    return receiptOf(execution, operation, revision, evidence, 'applied')
  }

  /** The derived receipt of a finishing batch; one that is not the planned receipt is a defect. */
  function plannedOf(derived: Answer, planned: CommandReceipt): CommandReceipt {
    if (!('receipt' in derived) || !sameValue(derived.receipt, planned))
      throw new TypeError('the finishing batch derived another receipt than the planned one')
    return derived.receipt
  }

  /** The evidence a list names its candidate's checkpoint by. */
  function candidateCheckpoint(
    execution: AgentExecutionId,
    candidate: AgentOperationId,
    revision: number,
  ): DurableEvidence {
    return journalEvidence(
      `${cell.namespace}/${execution}/candidate/${candidate}/checkpoint`,
      revision,
    )
  }

  /**
   * The `op.excluded` facts of the exclusions recorded in memory for `input.execution` that the
   * view does not hold, and `facts` do not carry: a held write the storage dropped, a re-run that
   * answered without writing, a fence whose fact was not written with it.
   */
  function unpublishedExclusions(
    input: Pick<ExecutionMutation<P>, 'tenant' | 'execution'>,
    before: ExecutionView,
    facts: readonly FactBody[],
  ): FactBody[] {
    const carried = new Set(
      facts.flatMap(fact => (fact.kind === 'op.excluded' ? [fact.operation] : [])),
    )
    const out: FactBody[] = []
    for (const [at, record] of state().operations) {
      if (record.kind !== 'excluded' || record.execution !== input.execution) continue
      if (at !== operationKey(input.tenant, input.execution, record.operation)) continue
      if (
        carried.has(record.operation) ||
        before.excluded.has(record.operation) ||
        before.ops.has(record.operation)
      )
        continue
      out.push({
        kind: 'op.excluded',
        operation: record.operation,
        reason: record.reason,
        evidence: copy(record.evidence),
        predecessor: null,
      })
    }
    return out
  }

  /** The `op.excluded` facts of a takeover: every write of this execution still pending. */
  function fencedOperations(execution: Execution): FactBody[] {
    const out: FactBody[] = []
    for (const record of state().operations.values()) {
      if (!pendingOf(record, execution) || record.key.startsWith('received:')) continue
      out.push({
        kind: 'op.excluded',
        operation: record.operation,
        reason: 'fence',
        evidence: journalEvidence(
          `${cell.namespace}/${execution.id}/excluded/${record.operation}/fenced`,
          0,
        ),
        predecessor: null,
      })
    }
    return out
  }

  function readFault(method: JournalRead): Outcome<never, Failure> | undefined {
    const count = readFaults.get(method) ?? 0
    if (count === 0) return undefined
    readFaults.set(method, count - 1)
    return fail({
      kind: 'unavailable',
      owner: JOURNAL_OWNER,
      diagnostic: `${method} is scripted unavailable`,
    })
  }

  function pendingOf(record: OperationRecord, execution: Execution): record is Pending {
    return (
      record.kind === 'pending' &&
      record.execution === execution.id &&
      tenantEquals(record.tenant, execution.tenant)
    )
  }

  function fence(execution: Execution): void {
    for (const [key, record] of state().operations) {
      if (!pendingOf(record, execution) || record.key.startsWith('received:')) continue
      state().operations.set(key, {
        kind: 'excluded',
        key: record.key,
        execution: execution.id,
        operation: record.operation,
        reason: 'fence',
        evidence: journalEvidence(
          `${cell.namespace}/${execution.id}/excluded/${record.operation}/fenced`,
          0,
        ),
      })
    }
  }

  /** This binding is coordinated: the grant is required and the Session check decides it. */
  function grantHolds(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; grant: DurableEvidence | null }>,
    method: 'open' | 'attach',
  ): boolean {
    if (input.grant === null || options.grant === undefined) return false
    return options.grant({
      principal: input.principal,
      tenant: input.tenant,
      execution: input.execution,
      grant: input.grant,
      method,
    })
  }

  function inputBoundary(execution: Execution): Range {
    const taken = execution.checkpoint.inputBatch
    const range = taken === null ? undefined : cache(execution).batches.get(taken.id)
    if (taken !== null && range === undefined)
      throw new Error('original input batch range is unavailable')
    const from = range?.to ?? 0
    return { from, to: execution.inputs.length }
  }

  /**
   * The range a watermark names: the one this Journal issued, or, when the in-process index was
   * rebuilt from durable records, the range its record names if this execution could have issued
   * it: the start is 0 or the end of a known batch, and the end is within the accepted inputs.
   */
  function watermarkRange(execution: Execution, record: string): Range | undefined {
    const issued = cache(execution).watermarks.get(record)
    if (issued !== undefined) return issued
    const prefix = `${cell.namespace}/${execution.id}/inputs/`
    if (!record.startsWith(prefix)) return undefined
    const match = /^(0|[1-9][0-9]*)-(0|[1-9][0-9]*)$/.exec(record.slice(prefix.length))
    if (match === null) return undefined
    const from = Number(match[1])
    const to = Number(match[2])
    if (to < from || to > execution.inputs.length) return undefined
    if (from !== 0 && ![...cache(execution).batches.values()].some(range => range.to === from))
      return undefined
    const range = { from, to }
    cache(execution).watermarks.set(record, range)
    return range
  }

  function watermarkOf(execution: Execution): DurableEvidence {
    const range = inputBoundary(execution)
    const evidence = journalEvidence(
      `${cell.namespace}/${execution.id}/inputs/${range.from}-${range.to}`,
      range.to,
    )
    cache(execution).watermarks.set(evidence.record, range)
    return evidence
  }

  /** The ledger scope of an execution: its tenant, Session and id name every basis and range. */
  function admissionScope(tenant: TenantId, id: AgentExecutionId): AdmissionScope {
    const encoded = tenantCodec.encode(tenant)
    return {
      parts: [encoded.ok ? encoded.value : '', cell.session, id],
      owner: JOURNAL_OWNER,
      mint: journalEvidence,
    }
  }

  function snapshotOf(execution: Execution): Outcome<ExecutionSnapshot, Failure> {
    const replyAdmissions = admissionProjectionOf(
      admissionScope(execution.tenant, execution.id),
      execution.admissionLedger,
      admissionRule,
    )
    if ('failure' in replyAdmissions) return replyAdmissions
    const unresolved: AgentOperationId[] = []
    for (const record of state().operations.values()) {
      if (pendingOf(record, execution)) {
        unresolved.push(record.operation)
      }
    }
    const emitted = execution.events.length
    const groups = custodyGroups(execution)
    // The members that grow with the history (effects, results, controls, observations,
    // handoffs) are copied one level deep: the core replaces their elements and the members of a
    // handoff record, it never changes an element in place, so a snapshot keeps what it saw. A
    // deep copy of them cost every `load` the whole history (a 200-step run spent half its time
    // in it). The members of one step's size are copied deep as before.
    return succeed<ExecutionSnapshot>({
      ...copy({
        execution: execution.id,
        revision: revisionOf(execution.revision),
        state: stateOf(execution),
        checkpoint: execution.checkpoint,
        inputWatermark: watermarkOf(execution),
        history: journalEvidence(`${cell.namespace}/${execution.id}/history`, execution.revision),
        replyAdmissions: replyAdmissions.ok,
        executionAttachment: activeAttachment(execution)?.authority ?? null,
        unresolved,
        finishObligations: currentObligations(execution.finishing) ?? null,
        settlement: settlementOf(execution.finishing),
        output: {
          emittedThrough: emitted === 0 ? null : String(emitted),
          acknowledgedThrough: execution.acknowledged === 0 ? null : String(execution.acknowledged),
        },
      }),
      controls: [...execution.controls],
      results: [...execution.results],
      effects: [...execution.effects],
      terminalObservations: [...execution.observations],
      handoffs: handoffsOf(execution, handoff => custodyOf(execution, handoff, groups)),
    })
  }

  function readPage(
    execution: Execution,
    after: string | null,
    limit: number,
  ): Outcome<EventPage, Failure> {
    const position = sequenceOf(after)
    if (position === undefined || position > execution.events.length) {
      return fail(invalid('after', 'not a sequence of this execution'))
    }
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > readLimit) {
      return fail(invalid('limit', `not a positive integer up to ${readLimit}`))
    }
    if (position + 1 < execution.retainedFrom) {
      return succeed({
        kind: 'gap',
        retainedFrom: String(execution.retainedFrom),
        recovery: journalEvidence(`${cell.namespace}/${execution.id}/recovery`, execution.revision),
      })
    }
    const events = execution.events.slice(position, position + limit)
    if (events.some(event => !event) || Array.from(events).some(event => !event)) {
      cell.quarantine('confirmed original event gap')
      return fail({
        kind: 'unavailable',
        owner: 'session-history',
        diagnostic: 'confirmed original event gap',
      })
    }
    const next = position + events.length
    return succeed({
      kind: 'page',
      events: copy(events),
      next: String(next),
      caughtUp: next === execution.events.length,
    })
  }

  /** The public state: a settling execution carries the FinishIntent projection of its candidate. */
  function stateOf(execution: Execution): ExecutionState {
    if (execution.state.kind !== 'settling') return execution.state
    const intent = intentOf(execution.finishing)
    if (intent === undefined)
      throw new Error('session Journal defect: a settling execution without a candidate')
    return { kind: 'settling', intent }
  }

  /** The writes of `execution` still undecided, except `operation`. */
  function pendingWrites(execution: Execution, operation: AgentOperationId) {
    const found: { operation: AgentOperationId; method: string }[] = []
    for (const record of state().operations.values()) {
      if (pendingOf(record, execution) && record.operation !== operation)
        found.push({ operation: record.operation, method: record.key.split(':')[0] ?? '' })
    }
    return found
  }

  /** The obligations of `candidate` from this Journal's own records at the current revision. */
  /** The call and result obligations of `execution` as its reader records hold them now. */
  function ledgerSource(execution: Execution) {
    return {
      id: execution.id,
      execution: `${cell.namespace}/${execution.id}`,
      revision: execution.revision,
      checkpoint: execution.checkpoint,
      results: execution.results,
      entries: execution.entries,
      effects: execution.effects,
      interruptionsOf: (effect: EffectIntent) =>
        interruptionsOf(effect, execution.controls, execution.tenant),
      modelCallOf: (effect: EffectIntent) => {
        if (effect.pending.kind !== 'model') return null
        const parts = resolveModelInvocationRef(effect.pending.reference, execution.tenant)
        return 'ok' in parts ? parts.ok.call : null
      },
      finishing: execution.finishing,
    }
  }

  /**
   * The `finish.obligation` facts a step owes the ledger (R2-D322): the call and result
   * obligations whose form the step changed, read from the reader records after the step's
   * projection, at most `room` of them. An execution the step did not leave in the reader owes none.
   */
  function ledgerChanges(
    tenant: TenantId,
    id: AgentExecutionId,
    room: number,
    facts: readonly FactBody[],
  ) {
    const execution = state().executions.get(executionKey(tenant, id))
    if (execution === undefined || room <= 0) return null
    const source = ledgerSource(execution)
    const changes = obligationChanges(
      [...callObligations(source), ...resultObligations(source)],
      viewOf(id).finish.obligations,
      source.execution,
      execution.revision,
      LEDGER_KINDS,
      room,
      touchedBy(facts),
    )
    return changes.facts.length === 0 ? null : changes
  }

  function obligationsOf(
    execution: Execution,
    candidate: FinishCandidate,
    operation: AgentOperationId,
  ): ReturnType<typeof buildObligations> {
    const takenInputs = new Map<InputId, InputBatchId>()
    for (const event of execution.events)
      if (event.body.kind === 'input-taken')
        for (const input of event.body.batch.ordered) takenInputs.set(input, event.body.batch.id)
    return buildObligations(
      {
        id: execution.id,
        execution: `${cell.namespace}/${execution.id}`,
        revision: execution.revision,
        checkpoint: execution.checkpoint,
        inputs: execution.inputs,
        committedInputBatchOf: input => takenInputs.get(input.id) ?? null,
        acceptanceOf: input => {
          for (const record of execution.handoffs)
            if (record.handoff.kind === 'input' && record.handoff.input === input.id)
              return record.handoff.entry
          return undefined
        },
        controls: execution.controls,
        results: execution.results,
        entries: execution.entries,
        effects: execution.effects,
        interruptionsOf: effect => interruptionsOf(effect, execution.controls, execution.tenant),
        modelCallOf: effect => {
          if (effect.pending.kind !== 'model') return null
          const parts = resolveModelInvocationRef(effect.pending.reference, execution.tenant)
          return 'ok' in parts ? parts.ok.call : null
        },
        emitted: execution.events.length,
        acknowledged: execution.acknowledged,
        unpublished: handoffsOf(execution, () => null).filter(
          record => record.history.kind === 'pending',
        ),
        pending: pendingWrites(execution, operation),
        finishing: execution.finishing,
      },
      candidate,
    )
  }

  function effectiveCancels(execution: Execution): readonly ControlRecord[] {
    return execution.controls.filter(
      record =>
        record.command.kind === 'cancel' &&
        record.stages['intent-established']?.state === 'reached',
    )
  }

  /** The coordinated participant facts of a judgment of `execution` under the cancel `control`. */
  function participantsOf(
    execution: Execution,
    control: AgentOperationId,
  ): CancellationJudgmentInput['participants'] {
    const fact = options.terminalParticipant?.({ execution: execution.id, control })
    return {
      kind: 'coordinated',
      association: coordination(execution),
      participants: fact === undefined ? [] : [copy(fact)],
    }
  }

  /** The association evidence of the coordinated binding of `execution`. */
  function coordination(execution: Execution): DurableEvidence {
    return journalEvidence(`${cell.namespace}/${execution.id}/coordination`, 0)
  }

  /**
   * The checks of a cancel authorization that prepareFinish, tryFinish and the candidate,
   * migration and judgment variants share (Agent SPEC "条件终结", "commitSettlement 的变体" 3): the
   * cancel names a saved control whose intent is reached (`denied` otherwise); the cancel carries
   * the source of that control (`invalid` otherwise). Answers the effective control. The settle
   * qualification is checked first, before the original operation is recognized: `settleRefusal`
   * for prepareFinish and tryFinish, the qualification names of commitSettlement for the variants.
   */
  function cancelCheck(
    execution: Execution,
    authorization: Extract<FinishAuthorization, { kind: 'cancel' }>,
    action: string,
  ):
    | Readonly<{ kind: 'failure'; failure: Failure }>
    | Readonly<{ kind: 'held'; control: ControlRecord }> {
    const control = effectiveCancels(execution).find(
      record => record.operation === authorization.control,
    )
    if (control === undefined) return { kind: 'failure', failure: denied(action) }
    if (!sameEvidence(control.stages.accepted.source, authorization.source))
      return {
        kind: 'failure',
        failure: invalid('authorization.source', 'not the source of the saved control'),
      }
    return { kind: 'held', control }
  }

  /**
   * A cancel authorization of prepareFinish or tryFinish needs the caller's current settle
   * qualification. It is checked with the tenant, before the original operation is recognized and
   * before stale-advance or terminal (Agent SPEC "判定次序与失败映射" 1 and 2).
   */
  function settleRefusal(
    input: Access<P> &
      Readonly<{ execution: AgentExecutionId; authorization: FinishAuthorization }>,
  ): Failure | undefined {
    return input.authorization.kind === 'cancel' ? cell.authorize(input, 'settle') : undefined
  }

  /**
   * The finish check of `candidate` over the closure rebuilt now (Agent SPEC "条件终结"); the
   * cancellation route compares its judgment with the Session participant fact read now.
   */
  function blockedReason(
    execution: Execution,
    candidate: FinishCandidate,
    items: readonly FinishObligation[],
    listed: readonly FinishObligation[],
  ) {
    const route = currentRoute(execution.finishing)
    return finishCheck(
      {
        items,
        listed,
        participants:
          route?.kind === 'cancellation'
            ? participantsOf(execution, route.control)
            : { kind: 'coordinated', association: coordination(execution), participants: [] },
        finishing: execution.finishing,
      },
      candidate,
    )
  }

  // ------------------------------------------------------------------------------------------
  // Message admission (Agent SPEC "消息准入", "真实历史的提交点", "内部 H 的排除与退役")

  type HandoffApply = (revision: number, evidence: DurableEvidence) => void

  /**
   * Checks the handoff part of one commit against the records of the execution and returns what
   * the write applies. A commit without a handoff change must keep `currentHandoff` as it is: only
   * P sets it and only a Ja clears or moves it.
   */
  function handoffWrite(
    execution: Execution,
    input: JournalCommit<P>,
  ): Outcome<HandoffApply, Failure> {
    const change = input.handoff
    const pointer = input.checkpoint.currentHandoff
    if (change === null) {
      if (!sameValue(pointer, execution.checkpoint.currentHandoff))
        return fail(invalid('checkpoint.currentHandoff', 'only a handoff change moves it'))
      return succeed(() => {})
    }
    switch (change.kind) {
      case 'prepare':
        return preparedHandoff(execution, input, change.request)
      case 'resolve':
        return resolvedHandoff(execution, input, change.outcome)
      case 'retire':
        return retiredHandoff(execution, input, change)
      default: {
        const _exhaustive: never = change
        return _exhaustive
      }
    }
  }

  /** P: the complete PendingHandoff is saved and `currentHandoff` points at its H. */
  function preparedHandoff(
    execution: Execution,
    input: JournalCommit<P>,
    request: Extract<NonNullable<JournalCommit<P>['handoff']>, { kind: 'prepare' }>['request'],
  ): Outcome<HandoffApply, Failure> {
    const reference = request.reference
    if (reference.execution !== execution.id)
      return fail(invalid('handoff', 'the request is not of this execution'))
    // Only a Ja clears or moves the pointer: P needs none set (Agent SPEC "消息准入").
    if (execution.checkpoint.currentHandoff !== null)
      return fail(invalid('checkpoint.currentHandoff', 'another H is still the current one'))
    if (!sameValue(input.checkpoint.currentHandoff, reference))
      return fail(invalid('checkpoint.currentHandoff', 'P points the checkpoint at its H'))
    if (request.predecessor !== input.expected)
      return fail(invalid('handoff', 'the predecessor of P is the expected revision'))
    if (handoffRecord(execution, reference) !== undefined)
      return fail(invalid('handoff', 'the H is already prepared'))
    // Agent SPEC "消息准入": the same source position cannot take another H while the old one is
    // undetermined. 待 U-18: the failure kind of this refusal is not fixed by the contract yet.
    const occupied = execution.handoffs.find(
      record =>
        record.request.kind === 'execution' &&
        sameValue(record.request.position, request.position) &&
        undetermined(record),
    )
    if (occupied !== undefined)
      return fail(invalid('handoff', 'the source position has an undetermined handoff'))
    if (request.predecessorHandoff !== null) {
      const predecessor = handoffRecord(execution, request.predecessorHandoff)
      if (predecessor === undefined || predecessor.retirement === null)
        return fail(invalid('handoff', 'the predecessor handoff is not retired'))
    }
    return succeed((_revision, evidence) => {
      execution.handoffs.push({
        handoff: copy(reference),
        request: copy(request),
        prepared: evidence,
        resolution: null,
        history: { kind: 'pending' },
        retirement: null,
      })
    })
  }

  /** Ja resolve: the fixed outcome of H is committed with the real history of its source. */
  function resolvedHandoff(
    execution: Execution,
    input: JournalCommit<P>,
    outcome: Extract<NonNullable<JournalCommit<P>['handoff']>, { kind: 'resolve' }>['outcome'],
  ): Outcome<HandoffApply, Failure> {
    const request = outcome.request
    if (request.kind !== 'execution')
      return fail(invalid('handoff', 'a Ja applies an internal request'))
    const record = handoffRecord(execution, request.reference)
    if (record === undefined || !sameValue(record.request, request))
      return fail(invalid('handoff', 'the outcome does not name the prepared request'))
    if (!undetermined(record))
      return fail(invalid('handoff', 'the H already has its history disposition'))
    if (record.resolution !== null && !sameValue(record.resolution, { kind: 'recorded', outcome }))
      return fail(invalid('handoff', 'the outcome differs from the recorded one'))
    if (!sameValue(execution.checkpoint.currentHandoff, request.reference))
      return fail(invalid('checkpoint.currentHandoff', 'the H is not the current one'))
    if (input.checkpoint.currentHandoff !== null)
      return fail(invalid('checkpoint.currentHandoff', 'a Ja clears the pointer'))
    const decision = outcome.decision
    const published = input.events.filter(
      event =>
        event.kind === 'message' &&
        sameValue(
          event.message,
          decision.kind === 'prepared' ? decision.message : request.candidate,
        ),
    )
    if (decision.kind === 'prepared') {
      if (published.length !== 1)
        return fail(invalid('events', 'a prepared Ja publishes its message once'))
      const event = published[0]
      if (event?.kind === 'message' && !sameValue(event.source, decision.admission))
        return fail(invalid('events', 'the message event names the admission of the H'))
    } else if (published.length > 0) {
      return fail(invalid('events', 'a rejected candidate does not enter the history'))
    }
    const caller = input.caller
    if (caller.kind === 'message') {
      if (
        decision.kind !== 'prepared' ||
        !sameValue(caller.message, decision.message) ||
        !sameValue(caller.source, outcome.record) ||
        !sameValue(caller.admission, decision.admission)
      )
        return fail(invalid('caller', 'the message commit does not match the outcome of the H'))
    } else if (caller.kind === 'context-transition') {
      if (
        request.source.kind !== 'context-transition' ||
        decision.kind !== 'prepared' ||
        !sameValue(caller.value, request.source.transition) ||
        !sameValue(caller.admission, decision.admission)
      )
        return fail(invalid('caller', 'the transition commit does not match the outcome of the H'))
    }
    if (request.source.kind === 'model-reply') {
      const admission = input.replyAdmission
      const basis = decision.kind === 'prepared' ? decision.admission : decision.evidence
      if (
        admission === null ||
        admission.call !== request.source.call ||
        admission.resultVersion !== request.source.result.version ||
        admission.decision !== (decision.kind === 'prepared' ? 'admitted' : 'rejected') ||
        !sameValue(admission.source, basis)
      )
        return fail(invalid('replyAdmission', 'the admission fact does not match the H'))
    }
    return succeed(revision => {
      record.resolution = { kind: 'recorded', outcome: copy(outcome) }
      record.history =
        decision.kind === 'prepared'
          ? { kind: 'committed', operation: input.operation, revision: revisionOf(revision) }
          : { kind: 'not-applicable' }
    })
  }

  /** Ja retire: a trusted excluded internal H retires without publishing anything. */
  function retiredHandoff(
    execution: Execution,
    input: JournalCommit<P>,
    change: Extract<NonNullable<JournalCommit<P>['handoff']>, { kind: 'retire' }>,
  ): Outcome<HandoffApply, Failure> {
    const request = change.excluded.request
    if (request.kind !== 'execution')
      return fail(invalid('handoff', 'a retire applies to an internal request'))
    const record = handoffRecord(execution, request.reference)
    if (record === undefined || !sameValue(record.request, request))
      return fail(invalid('handoff', 'the exclusion does not name the prepared request'))
    if (!undetermined(record))
      return fail(invalid('handoff', 'the H already has its history disposition'))
    if (record.resolution !== null && record.resolution.kind !== 'excluded')
      return fail(invalid('handoff', 'a recorded H is not retired'))
    if (!sameValue(execution.checkpoint.currentHandoff, request.reference))
      return fail(invalid('checkpoint.currentHandoff', 'the H is not the current one'))
    if (input.checkpoint.currentHandoff !== null)
      return fail(invalid('checkpoint.currentHandoff', 'a retire clears the pointer'))
    if (input.checkpoint.position !== request.position.node)
      return fail(invalid('checkpoint.position', 'a retire keeps the source node'))
    if (
      input.events.length > 0 ||
      input.effects.length > 0 ||
      input.replyAdmission !== null ||
      input.caller.kind !== 'none'
    )
      return fail(invalid('handoff', 'a retire carries no event, effect, admission or caller'))
    return succeed(revision => {
      record.resolution = copy(change.excluded)
      record.history = { kind: 'not-applicable' }
      record.retirement = {
        operation: input.operation,
        revision: revisionOf(revision),
        reason: copy(change.reason),
      }
    })
  }

  /** The custody projection of one H, rebuilt from the attempts and their operation records. */
  /** The custody attempts of an execution grouped by the handoff they are attempts of. */
  function custodyGroups(
    execution: Execution,
  ): ReadonlyMap<string, readonly (readonly [AgentOperationId, CustodyAttempt])[]> {
    const groups = new Map<string, (readonly [AgentOperationId, CustodyAttempt])[]>()
    for (const entry of execution.custodyAttempts.entries()) {
      const key = canonical(entry[1].handoff)
      const group = groups.get(key)
      if (group === undefined) groups.set(key, [entry])
      else group.push(entry)
    }
    return groups
  }

  /**
   * The custody chain of one handoff. A snapshot of an execution with many handoffs passes the
   * groups built once (`custodyGroups`): one pass over the attempts, not one per handoff.
   */
  function custodyOf(
    execution: Execution,
    handoff: HandoffReference,
    groups: ReadonlyMap<
      string,
      readonly (readonly [AgentOperationId, CustodyAttempt])[]
    > = custodyGroups(execution),
  ): Exclude<ExecutionHandoff['custody'], null> | null {
    const attempts = groups.get(canonical(handoff)) ?? []
    const root = attempts.find(([, attempt]) => attempt.custody === null)
    if (root === undefined) return null
    const stateOf = (operation: AgentOperationId): 'committed' | 'excluded' | undefined => {
      const at = operationKey(execution.tenant, execution.id, operation)
      const record = at === undefined ? undefined : state().operations.get(at)
      return record?.kind === 'committed' || record?.kind === 'excluded' ? record.kind : undefined
    }
    const chain: Exclude<ExecutionHandoff['custody'], null>['chain'][number][] = []
    let committed: AgentOperationId | null = null
    let current: AgentOperationId | null = root[0]
    let predecessor: AgentOperationId | null = null
    while (current !== null) {
      const fixed = stateOf(current)
      if (fixed === undefined) break
      chain.push({ operation: current, predecessor, state: fixed })
      if (fixed === 'committed') committed = current
      const next = attempts.find(
        ([, attempt]) => attempt.custody?.predecessor.operation === current,
      )
      predecessor = current
      current = next?.[0] ?? null
    }
    return { root: root[0], chain, committed }
  }

  // ------------------------------------------------------------------------------------------
  // The settlement variants (Agent SPEC "commitSettlement 的变体")

  type CandidateVariant = Extract<
    SettlementRequest<P>,
    { kind: 'establish-cancellation' | 'migrate-cancellation' | 'judge-cancellation' }
  >
  type CustodyVariant = Exclude<SettlementRequest<P>, CandidateVariant>
  type CancellationRoute = Extract<FinishRoute, { kind: 'cancellation' }>

  /**
   * The batch of a settlement record (R2-D297): one `settlement.recorded` with the record as a block
   * without its receipt. The answer and the reader records are read back from the block with the
   * receipt the batch derives, so nothing but the fact and the block makes them.
   */
  function recordedBatch(
    execution: Execution,
    planned: CommandReceipt,
    result: RecordedSettlement,
  ): Attempt<SettlementResult> {
    const finishing = execution.finishing
    const stored = blobOf(settlementBlock(result))
    return {
      kind: 'batch',
      facts: [
        {
          kind: 'settlement.recorded',
          variant: result.kind,
          record: refOf(stored[1]),
          evidence: planned.evidence,
        },
      ],
      blobs: [stored],
      kinds: [],
      derive: derived => {
        if (derived.kind !== 'settlement') throw new TypeError('a settlement answers its record')
        return settlementOfFact(
          derived.record,
          plannedOf(derived, planned),
          finishing,
          state().blobs,
        )
      },
      project: (batch, view) => {
        const recorded = view.settlements.find(item => item.pub === batch.pub)
        if (recorded === undefined) throw new TypeError('the settlement record did not fold')
        applySettlement(
          finishing,
          settlementOfFact(recorded.record, planned, finishing, state().blobs),
        )
        execution.revision = view.revision
      },
    }
  }

  /**
   * The candidate, migration and judgment variants in the order of Agent SPEC "commitSettlement
   * 的变体": no installation is unavailable; ended is terminal; the cancel must be effective
   * (`denied`) with the source of its saved control (`invalid`); another installation is invalid; a
   * stale expected, a candidate or route that is no longer current is changed; a candidate or route
   * the Journal does not hold, or one that the variant cannot apply to, is invalid.
   */
  function settleCandidate(
    execution: Execution,
    input: CandidateVariant,
    key: string,
  ): Attempt<SettlementResult> {
    const installed = options.cancellation
    if (installed === undefined)
      return answer(fail(damaged('no cancellation policy is installed on this binding')))
    if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
    // The settle and migrate-cancellation qualifications were checked with the request (step 1).
    const checked = cancelCheck(execution, input.authorization, 'commitSettlement')
    if (checked.kind === 'failure') return answer(fail(checked.failure))
    const control = checked.control
    if (control.command.kind !== 'cancel')
      throw new Error('session Journal defect: an effective cancel without a cancel command')
    const cause = control.command.reason
    // Step 4: an installation that no longer applies, a stale expected and a candidate that is no
    // longer current are changed; a target the variant cannot apply to is invalid after them.
    const installation = installed.installation
    if (!sameEvidence(installation.record, input.installation))
      return answer(fail({ kind: 'changed' }))
    if (input.expected !== revisionOf(execution.revision)) return answer(fail({ kind: 'changed' }))
    const finishing = execution.finishing
    const current = currentCandidate(finishing)
    const route = currentRoute(finishing)
    const revision = execution.revision + 1
    // Every record of the variant names the receipt of its batch, as its own evidence too.
    const receipt = plannedReceipt(execution, input.operation, key)
    const evidence = receipt.evidence
    const cancellationRoute = (
      candidate: AgentOperationId,
      origin: CancellationRoute['origin'],
    ): CancellationRoute => ({
      kind: 'cancellation',
      record: journalEvidence(`${cell.namespace}/${execution.id}/route/r${revision}`, revision),
      candidate,
      control: control.operation,
      policy: copy(installation.policy),
      installation: copy(installation.record),
      origin,
    })
    switch (input.kind) {
      case 'establish-cancellation': {
        if (input.predecessor !== null && candidateOf(finishing, input.predecessor) === undefined)
          return answer(fail(invalid('predecessor', 'not a candidate of this execution')))
        if ((current?.candidate ?? null) !== input.predecessor)
          return answer(fail({ kind: 'changed' }))
        // establish supersedes a complete or failed candidate only: a cancelled one stays, on a
        // cancellation route, or migrates from an author route (rulings-S3B).
        if (current?.conclusion.kind === 'cancelled')
          return answer(
            fail(invalid('predecessor', 'a cancelled candidate is not superseded by establish')),
          )
        const candidate: FinishCandidate = {
          candidate: input.operation,
          origin: copy(control.stages.accepted.source),
          conclusion: { kind: 'cancelled', cause: copy(cause) },
          failure: null,
          inputWatermark: watermarkOf(execution),
          checkpoint: copy(execution.checkpoint),
          conditions: copy(
            control.stages['intent-established']?.source ?? control.stages.accepted.source,
          ),
        }
        const established = cancellationRoute(candidate.candidate, {
          kind: 'native',
          operation: input.operation,
        })
        const supersession = supersessionOf(finishing, candidate.candidate, established, revision)
        // R2-D297: the candidate enters with a cursor reference, never a checkpoint copy.
        const settling = { kind: 'settling' } as const
        const establishedFact = candidateFact(
          candidate,
          established,
          supersession?.from ?? null,
          settling,
        )
        const facts: FactBody[] = [establishedFact.fact]
        if (viewOf(execution.id).cursor.state !== 'settling')
          facts.push({
            kind: 'cursor.moved',
            step: execution.checkpoint.step,
            members: { state: 'settling' },
          })
        /** The candidate and route the folded fact names, read back from the blocks. */
        const folded = () => {
          const view = viewOf(execution.id).finish.candidates.find(
            item => item.candidate === candidate.candidate,
          )
          if (view === undefined) throw new TypeError('the established candidate did not fold')
          return {
            candidate: candidateOfView(view, state().blobs),
            route: routeOfView(view, state().blobs),
          }
        }
        return {
          kind: 'batch',
          facts,
          blobs: establishedFact.blobs,
          kinds: [],
          derive: derived => {
            const read = folded()
            if (read.route.kind !== 'cancellation')
              throw new TypeError('an establish folds a cancellation route')
            return {
              kind: 'establish-cancellation',
              receipt: plannedOf(derived, receipt),
              candidate: read.candidate,
              route: read.route,
              supersession,
            }
          },
          project: (_batch, view) => {
            const read = folded()
            applyCandidate(finishing, read.candidate, read.route, supersession)
            execution.state = { kind: 'settling' }
            execution.revision = view.revision
          },
        }
      }
      case 'migrate-cancellation': {
        const candidate = candidateOf(finishing, input.candidate)
        if (candidate === undefined)
          return answer(fail(invalid('candidate', 'not a candidate of this execution')))
        if (candidate.candidate !== finishing.current) return answer(fail({ kind: 'changed' }))
        if (candidate.conclusion.kind !== 'cancelled')
          return answer(fail(invalid('candidate', 'only a cancelled candidate migrates')))
        const from = routeOf(finishing, input.originalRoute)
        if (from === undefined)
          return answer(fail(invalid('originalRoute', 'not a route of this execution')))
        if (from.kind !== 'author')
          return answer(fail(invalid('originalRoute', 'not an author route')))
        // Only a route that has not switched migrates: a second migration is changed.
        if (route === undefined || route.record.record !== from.record.record)
          return answer(fail({ kind: 'changed' }))
        const switched = cancellationRoute(candidate.candidate, {
          kind: 'migration',
          operation: input.operation,
        })
        const built = obligationsOf(execution, candidate, input.operation)
        const progress: LegacyF2Entry[] = execution.checkpoint.passages
          .filter(passage => passage.position === 'before_terminal')
          .map(passage => ({
            kind: 'recorded',
            passage: copy(passage),
            version: journalEvidence(
              `${cell.namespace}/${execution.id}/passage/${passage.id}`,
              execution.revision,
            ),
          }))
        const migration: MigrationRecord = {
          operation: input.operation,
          receipt,
          evidence,
          candidate: candidate.candidate,
          control: control.operation,
          from: {
            route: copy(from),
            policy: copy(from.policy),
            definition: copy(execution.checkpoint.definition),
            schema: copy(execution.checkpoint.schema),
            beforeTerminal: copy(from.beforeTerminal),
            extensions: [],
          },
          progress,
          to: {
            policy: copy(installation.policy),
            implementation: copy(installation.implementation),
            inputSchema: copy(installation.inputSchema),
            installation: copy(installation.record),
            admission: copy(installation.admission),
          },
          qualification: {
            attribution: copy(input.authorization.source),
            target: execution.id,
            issuer: copy(installation.decision),
            check: evidence,
          },
          fence: evidence,
          coverage: built.coverage,
          obligations: built.items,
          supersession: { from: copy(from.record), to: copy(switched.record), candidate: null },
          priorExcluded: copy(input.priorExcluded),
        }
        return recordedBatch(execution, receipt, {
          kind: 'migrate-cancellation',
          receipt,
          migration,
          route: switched,
        })
      }
      case 'judge-cancellation': {
        const candidate = candidateOf(finishing, input.candidate)
        if (candidate === undefined)
          return answer(fail(invalid('candidate', 'not a candidate of this execution')))
        if (candidate.candidate !== finishing.current) return answer(fail({ kind: 'changed' }))
        const named = routeOf(finishing, input.route)
        if (named === undefined)
          return answer(fail(invalid('route', 'not a route of this execution')))
        if (named.kind !== 'cancellation')
          return answer(fail(invalid('route', 'not a cancellation route')))
        if (route === undefined || route.record.record !== named.record.record)
          return answer(fail({ kind: 'changed' }))
        if (named.control !== control.operation)
          return answer(
            fail(invalid('authorization.control', 'not the control of the judged route')),
          )
        const built = obligationsOf(execution, candidate, input.operation)
        const judged: CancellationJudgmentInput = {
          tenant: execution.tenant,
          execution: execution.id,
          candidate: copy(candidate),
          control: copy(control),
          route: copy(named),
          readRevision: revisionOf(execution.revision),
          coverage: built.coverage,
          items: built.items,
          participants: participantsOf(execution, control.operation),
        }
        let decision: CancellationJudgmentRecord['decision']
        try {
          decision = copy(installed.policy.judge(copy(judged)))
        } catch (error) {
          return answer(fail(damaged(`the cancellation policy threw: ${String(error)}`)))
        }
        if (!['allowed', 'blocked', 'unknown'].includes(decision.kind))
          return answer(fail(damaged('the cancellation policy answered an unknown decision')))
        const judgment: CancellationJudgmentRecord = {
          operation: input.operation,
          receipt,
          evidence,
          policy: copy(installation.policy),
          implementation: copy(installation.implementation),
          inputSchema: copy(installation.inputSchema),
          installation: copy(installation.record),
          qualification: copy(input.authorization.source),
          candidate: candidate.candidate,
          control: control.operation,
          route: copy(named.record),
          input: judged,
          decision,
          revision: revisionOf(revision),
          supersedes: finishing.currentJudgment,
        }
        return recordedBatch(execution, receipt, { kind: 'judge-cancellation', receipt, judgment })
      }
      default: {
        const _exhaustive: never = input
        return _exhaustive
      }
    }
  }

  /**
   * The target of one custody variant (Agent SPEC "commitSettlement 的变体" table): the card round,
   * the before-terminal passage or the Tool intent of this execution, with the candidate and route
   * the request names. It is checked before the source is read, so a target the Journal does not
   * hold is `invalid` whatever the host answers.
   */
  function custodyTargetFailure(execution: Execution, input: CustodyVariant): Failure | undefined {
    const finishing = execution.finishing
    const known = (candidate: AgentOperationId, route: DurableEvidence): Failure | undefined =>
      candidateOf(finishing, candidate) === undefined
        ? invalid('candidate', 'not a candidate of this execution')
        : routeOf(finishing, route) === undefined
          ? invalid('route', 'not a route of this execution')
          : undefined
    switch (input.kind) {
      case 'record-card-reconciliation': {
        const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
        const round =
          passage?.progress.kind === 'asked'
            ? passage.progress.rounds.find(item => item.round === input.round)
            : undefined
        if (passage === undefined || round === undefined)
          return invalid('round', 'not a card round of this execution')
        return known(input.candidate, input.route)
      }
      case 'record-legacy-return': {
        const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
        if (passage === undefined || passage.position !== 'before_terminal')
          return invalid('passage', 'not a before-terminal passage of this execution')
        if (!sameEvidence(passage.input, input.request))
          return invalid('request', 'not the input record of the passage')
        return known(input.candidate, input.route)
      }
      case 'record-tool-association': {
        const effect = execution.effects.find(item => item.action === input.intent.action)
        if (
          effect === undefined ||
          effect.pending.kind !== 'tool' ||
          finishing.effectOperations.get(input.intent.action) !== input.intent.intent ||
          !sameValue(effect.pending.position, input.intent.position)
        )
          return invalid('intent', 'not a Tool intent of this execution')
        return undefined
      }
      default: {
        const _exhaustive: never = input
        return _exhaustive
      }
    }
  }

  /**
   * The three custody variants under the current reconcile qualification, without expected and
   * also after ended: the target is checked first (`invalid` when the Journal does not hold it),
   * then the source must resolve through the trusted host reads (`unavailable` otherwise) to a
   * record of this tenant (`denied` otherwise, before anything of it is compared), of this execution
   * (`invalid` otherwise) and of the named passage, round or intent (`invalid` otherwise). None
   * changes the candidate, the route or a passage.
   */
  function settleCustody(
    execution: Execution,
    input: CustodyVariant,
    key: string,
  ): Attempt<SettlementResult> {
    const finishing = execution.finishing
    const target = custodyTargetFailure(execution, input)
    if (target !== undefined) return answer(fail(target))
    const source = input.kind === 'record-card-reconciliation' ? input.original : input.source
    const record = options.hostRecords?.get(source.record)
    if (record === undefined)
      return answer(fail(damaged(`the host answers no record for ${source.record}`)))
    // A tool-return record carries no tenant, and its returned reference names none either
    // (R2-D357): its tenant isolation is not a check of this stub (R2-D372).
    if (record.kind !== 'tool-return') {
      if (!tenantEquals(record.tenant, execution.tenant))
        return answer(fail(denied('commitSettlement')))
      if (record.execution !== execution.id)
        return answer(
          fail(
            invalid(
              input.kind === 'record-card-reconciliation' ? 'original' : 'source',
              'a host record of another execution',
            ),
          ),
        )
    }
    const revision = execution.revision + 1
    // Every record of the variant names the receipt of its batch, as its own evidence too.
    const receipt = plannedReceipt(execution, input.operation, key)
    const evidence = receipt.evidence
    switch (input.kind) {
      case 'record-card-reconciliation': {
        const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
        const round =
          passage?.progress.kind === 'asked'
            ? passage.progress.rounds.find(item => item.round === input.round)
            : undefined
        if (passage === undefined || round === undefined)
          throw new Error('session Journal defect: the card round was checked before the source')
        if (
          record.kind !== 'card-reconciliation' ||
          record.passage !== input.passage ||
          record.round !== input.round
        )
          return answer(fail(invalid('original', 'not a reconciliation of this round')))
        const custodian: ConsumerRef = {
          owner: 'cards',
          work: execution.id,
          position: passage.id,
          purpose: 'card-custody',
        }
        const key = `${passage.id}/${round.round}`
        const lookup: RecoveryContinuation = {
          kind: 'card-lookup',
          request: { kind: 'parameters', value: { passage: passage.id, round: round.round } },
          owner: 'cards',
          custodian: null,
          purpose: 'reconcile',
        }
        // A result the card owner could not determine keeps the round unknown under the reason
        // the host gave; only a known result is held by the card owner.
        const result = record.result
        const reconciliation: CardReconciliationRecord = {
          operation: input.operation,
          receipt,
          passage: input.passage,
          round: input.round,
          candidate: input.candidate,
          route: copy(input.route),
          original: copy(input.original),
          obligation: {
            kind: 'card-round',
            key,
            source: copy(source),
            version: evidence,
            position: null,
            disposition:
              result.kind === 'known'
                ? {
                    kind: 'held',
                    custodian,
                    acceptance: copy(source),
                    retained: copy(source),
                    continuation: lookup,
                  }
                : {
                    kind: 'unknown',
                    question: {
                      owner: 'cards',
                      key,
                      position: copy(source),
                      reason: result.reason,
                    },
                    required: lookup,
                  },
            passage: passage.id,
            round: copy(round),
            present: result.kind === 'known' ? copy(result.present) : null,
            lookups: result.kind === 'known' ? [...result.lookups] : [],
            invalidate: result.kind === 'known' ? copy(result.invalidate) : null,
          },
          revision: revisionOf(revision),
        }
        return recordedBatch(execution, receipt, {
          kind: 'record-card-reconciliation',
          receipt,
          reconciliation,
        })
      }
      case 'record-legacy-return': {
        if (
          record.kind !== 'legacy-return' ||
          record.passage !== input.passage ||
          !sameEvidence(record.input, input.request)
        )
          return answer(fail(invalid('source', 'not the return of this invocation')))
        const legacyReturn: LegacyInvocationReturn = {
          operation: input.operation,
          receipt,
          passage: input.passage,
          candidate: input.candidate,
          route: copy(input.route),
          input: copy(input.request),
          mode: copy(record.mode),
          implementation: copy(record.implementation),
          source: copy(input.source),
          result: copy(record.result),
          received: copy(record.received),
          custody: copy(record.custody),
          revision: revisionOf(revision),
        }
        return recordedBatch(execution, receipt, {
          kind: 'record-legacy-return',
          receipt,
          legacyReturn,
        })
      }
      case 'record-tool-association': {
        const effect = execution.effects.find(item => item.action === input.intent.action)
        if (effect === undefined)
          throw new Error('session Journal defect: the Tool intent was checked before the source')
        if (record.kind !== 'tool-return')
          return answer(fail(invalid('source', 'not the return of this intent')))
        const reference = resolveToolInvocationRef(record.returned.reference, execution.tenant)
        if ('failure' in reference)
          return answer(fail(invalid('source', 'the returned reference is malformed')))
        if (!sameValue(record.intent, input.intent) || !sameEvidence(record.request, input.request))
          return answer(fail(invalid('source', 'not the return of this intent')))
        // A known reference of the same intent with another call or admission conflicts: the
        // original association stays as it is (Agent SPEC "record-tool-association").
        const parts = reference.ok
        const contradicted = finishing.toolAssociations.some(known => {
          if (known.intent.action !== input.intent.action) return false
          if (known.association.kind === 'no-proven-reference') return false
          const prior = resolveToolInvocationRef(known.association.reference, execution.tenant)
          return (
            'ok' in prior &&
            (prior.ok.call !== parts.call || prior.ok.admission !== parts.admission)
          )
        })
        if (contradicted) return answer(fail(conflict(input.operation)))
        const custodian: ConsumerRef = {
          owner: 'host',
          work: execution.id,
          position: input.intent.action,
          purpose: 'call-custody',
        }
        const continuation: RecoveryContinuation = {
          kind: 'tool-association-retain',
          request: {
            kind: 'parameters',
            value: {
              intent: copy(input.intent),
              request: copy(input.request),
              source: copy(input.source),
              priorExcluded: copy(input.priorExcluded),
            },
          },
          owner: 'host',
          custodian,
          purpose: 'reconcile',
        }
        // A commit-unknown return names the call but leaves its acceptance unknown.
        const disposition: ObligationDisposition =
          record.returned.kind === 'accepted'
            ? {
                kind: 'held',
                custodian,
                acceptance: copy(record.received),
                retained: copy(record.custody),
                continuation,
              }
            : {
                kind: 'unknown',
                question: {
                  owner: 'host',
                  key: input.intent.action,
                  position: copy(input.source),
                  reason: 'original-operation-unknown',
                },
                required: continuation,
              }
        const obligation: Extract<FinishObligation, { kind: 'call' }> = {
          kind: 'call',
          key: input.intent.action,
          source: copy(effect.pending.fixed),
          version: evidence,
          position: copy(effect.pending.position),
          disposition,
          action: input.intent.action,
          intent: input.intent.intent,
          pending: copy(effect.pending),
          started: copy(record.received),
          outcome: null,
          interruptions: interruptionsOf(effect, execution.controls, execution.tenant),
          custodian,
        }
        const association: ToolAssociationRecord = {
          operation: input.operation,
          receipt,
          intent: copy(input.intent),
          request: copy(input.request),
          source: copy(input.source),
          association: copy(record.returned),
          obligation,
          priorExcluded: copy(input.priorExcluded),
          revision: revisionOf(revision),
        }
        return recordedBatch(execution, receipt, {
          kind: 'record-tool-association',
          receipt,
          association,
        })
      }
      default: {
        const _exhaustive: never = input
        return _exhaustive
      }
    }
  }

  const port: AgentJournal<P> = {
    // The session-log binding is Agent's coordinated binding (AD-01, PA-04).
    capabilities: Object.freeze({ coordination: 'coordinated' as const, participants }),

    open(input) {
      const key = semanticKey('open', input)
      const { original: acceptance, runtime } = input
      const entry = acceptance.entry
      const initial = entry.kind === 'invoke' ? entry.initial : entry.value
      return write('open', input, key, () => {
        const existing = state().executions.get(executionKey(input.tenant, input.execution))
        if (existing !== undefined && !tenantEquals(existing.tenant, input.tenant)) {
          return answer(fail(denied('open')))
        }
        const original = recognized<{ receipt: CommandReceipt; authority: Authority }>(input, key)
        if (original !== undefined) return answer(original)
        if (existing !== undefined) return answer(fail(conflict(input.operation)))
        // The two parts of the acceptance must agree with each other and with this operation
        // (Agent SPEC "输入内容与水位线"): the first open uses the fixed adoption of the invoke origin.
        const malformed = acceptanceFailure('open', input, acceptance)
        if (malformed !== undefined) return answer(fail(malformed))
        if (entry.kind !== 'invoke') return answer(fail(invalid('original.entry', 'not an invoke')))
        const origin = acceptance.outcome.origin
        if (
          origin?.kind === 'invoke' &&
          (!sameValue(origin.scope, runtime.scope) ||
            !sameValue(origin.definition, runtime.definition))
        )
          return answer(
            fail(invalid('runtime', 'not the scope and definition of the invoke origin')),
          )
        if (!grantHolds({ ...input, grant: runtime.grant }, 'open'))
          return answer(fail(denied('open')))
        // The Session source (SE13) is co-checked by the participant in the same write; a null
        // source cannot pass it (PA-01 item 1).
        if (initial.source === null) return answer(fail(denied('open')))
        const authority: Authority = {
          execution: input.execution,
          executionAttachment: attachmentIdOf(input.execution, 1),
          instance: runtime.instance,
          generation: '1',
          source: attachmentEvidence(input.execution, 'attach', 1, 1),
        }
        // The initial checkpoint comes from the caller, not from the invoke entry (R2-D292).
        const checkpoint = input.checkpoint
        const outcome = acceptance.outcome
        const bound = receiving.newBindings(
          { id: input.execution, tenant: input.tenant, checkpoint, effects: [] },
          runtime.instance,
        )
        const facts: FactBody[] = [
          {
            kind: 'exec.opened',
            definition: checkpoint.definition,
            schema: checkpoint.schema,
            instance: runtime.instance,
            scope: runtime.scope,
            original: {
              input: initial.id,
              entry: acceptance.handoff.entry,
              handoff: acceptance.handoff,
            },
            coordination: 'coordinated',
          },
          { kind: 'exec.attached', authority, grant: runtime.grant, basis: { kind: 'open' } },
          {
            kind: 'input.accepted',
            input: initial.id,
            entry: acceptance.handoff.entry,
            message: refOf(initial.content),
            source: initial.source,
            priority: initial.priority,
            watermark: outcome.record,
          },
          // The external H is published by this acceptance (Agent SPEC "消息准入": the real
          // history of an external input is the original open or submit).
          {
            kind: 'handoff.resolved',
            handoff: acceptance.handoff,
            resolution: 'recorded',
            outcome: refOf(outcome),
            history: outcome.record,
          },
          {
            kind: 'cursor.moved',
            step: checkpoint.step,
            members: cursorMembersOf(checkpoint, { kind: 'advancing' }),
          },
          ...bound.facts,
        ]
        const blobs: Blob[] = [
          blobOf(initial.content),
          blobOf(outcome),
          ...blobsOf(checkpoint),
          ...bound.blobs,
        ]
        return {
          kind: 'batch',
          facts,
          blobs,
          kinds: [],
          derive: derived => {
            if (derived.kind !== 'authority') throw new TypeError('an open answers its Authority')
            return { receipt: derived.receipt, authority: derived.authority }
          },
          project: (batch, view) => {
            const execution: Execution = {
              id: input.execution,
              tenant: input.tenant,
              revision: view.revision,
              state: { kind: 'advancing' },
              checkpoint: checkpointOf(view, state().blobs),
              attachments: [
                {
                  authority,
                  grant: runtime.grant,
                  status: 'active',
                  handoff: null,
                  handoffRevision: 0,
                },
              ],
              inputs: [copy(initial)],
              inputRevisions: new Map([[initial.id, view.revision]]),
              events: [],
              retainedFrom: 1,
              acknowledged: 0,
              acknowledgedAt: 0,
              controls: [],
              results: [],
              resultRevisions: new Map(),
              effects: [],
              observations: [],
              stageReceipts: new Map(),
              observed: new Map(),
              admissions: [],
              admissionLedger: originLedger(
                admissionScope(input.tenant, input.execution),
                admissionRule,
                view.revision,
              ),
              entries: [],
              handoffs: [inputHandoff(acceptance, input.operation, view.revision)],
              custodyAttempts: new Map(),
              finishing: emptyFinishing(),
              serial: batch.pub,
            }
            state().executions.set(executionKey(input.tenant, input.execution), execution)
            receiving.applyBindings(execution, bound)
          },
        }
      })
    },

    attach(input) {
      const key = semanticKey('attach', input)
      return write('attach', input, key, () => {
        const found = owned(input, 'attach')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<{ receipt: CommandReceipt; authority: Authority }>(input, key)
        if (original !== undefined) return answer(original)
        // An ended execution answers terminal before the Session check (PA-01 item 3).
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (!grantHolds(input, 'attach')) return answer(fail(denied('attach')))
        const old = activeAttachment(execution)
        if (old !== undefined && input.takeover === null) {
          return answer(fail({ kind: 'changed' }))
        }
        if (old === undefined && execution.state.kind !== 'suspended') {
          return answer(fail({ kind: 'changed' }))
        }
        const revision = execution.revision + 1
        const ordinal = execution.attachments.length + 1
        const authority: Authority = {
          execution: execution.id,
          executionAttachment: attachmentIdOf(execution.id, ordinal),
          instance: input.instance,
          generation: String(ordinal),
          source: attachmentEvidence(execution.id, 'attach', ordinal, revision),
        }
        // A takeover fences every write of the old generation still pending (R2-D307): each is an
        // `op.excluded` fact of this batch, and the reader projection marks its record excluded.
        const fenced = fencedOperations(execution)
        return {
          kind: 'batch',
          facts: [
            {
              kind: 'exec.attached',
              authority,
              grant: input.grant,
              basis: { kind: 'recovery', recovery: input.recovery, takeover: input.takeover },
            },
            ...fenced,
            {
              kind: 'cursor.moved',
              step: execution.checkpoint.step,
              members: { state: 'reconciling' },
            },
          ],
          blobs: [],
          kinds: [],
          derive: derived => {
            if (derived.kind !== 'authority') throw new TypeError('an attach answers its Authority')
            return { receipt: derived.receipt, authority: derived.authority }
          },
          project: (_batch, view) => {
            fence(execution)
            if (old !== undefined) old.status = 'superseded'
            execution.attachments.push({
              authority,
              grant: input.grant,
              status: 'active',
              handoff: null,
              handoffRevision: 0,
            })
            execution.state = { kind: 'reconciling' }
            execution.revision = view.revision
          },
        }
      })
    },

    detach(input) {
      const key = semanticKey('detach', input)
      return write('detach', input, key, () => {
        const found = owned(input, 'detach')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<DurableEvidence>(input, key)
        if (original !== undefined) return answer(original)
        const target = execution.attachments.find(
          attachment =>
            attachment.authority.executionAttachment === input.authority.executionAttachment,
        )
        if (target === undefined) return answer(fail(denied('detach')))
        if (target.status === 'superseded') return answer(fail({ kind: 'stale-advance' }))
        // A detached target only recognizes the existing handoff at the revision it was established.
        if (target.handoff !== null) {
          const handoff = target.handoff
          return recognitionOf(
            reachedBy(execution.id, target.handoffRevision),
            target.handoffRevision,
            () => copy(handoff),
          )
        }
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        const revision = execution.revision + 1
        const ordinal = execution.attachments.indexOf(target) + 1
        const handoff = attachmentEvidence(execution.id, 'handoff', ordinal, revision)
        return {
          kind: 'batch',
          facts: [
            {
              kind: 'exec.detached',
              attachment: target.authority.executionAttachment,
              handoff,
            },
            {
              kind: 'cursor.moved',
              step: execution.checkpoint.step,
              members: { state: 'suspended' },
            },
          ],
          blobs: [],
          kinds: [],
          derive: derived => {
            if (derived.kind !== 'detached') throw new TypeError('a detach answers its handoff')
            return derived.handoff
          },
          project: (_batch, view) => {
            target.status = 'detached'
            target.handoff = handoff
            target.handoffRevision = view.revision
            execution.state = { kind: 'suspended', handoff }
            execution.revision = view.revision
          },
        }
      })
    },

    commit(input) {
      const key = semanticKey('commit', input)
      const prepare = (): Attempt<CommandReceipt> => {
        const found = owned(input, 'commit')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        // The type excludes these bodies; a caller that bypasses it gets invalid (SPEC
        // "AgentJournal.commit" row): `entry` is allocated by the entry ports, `ended` by tryFinish.
        const allocated = input.events.find(
          body => (body.kind as string) === 'entry' || (body.kind as string) === 'ended',
        )
        if (allocated !== undefined)
          return answer(
            fail(invalid('events', `the Journal allocates the ${allocated.kind} event body`)),
          )
        // The pure shape comes before recognition and the lifecycle (Agent SPEC "判定次序与失败映
        // 射" 1): only a settling commit carries a candidate, and an admission fact is complete. A
        // settling commit without any candidate depends on the records and is checked below.
        if (input.finish !== null && input.state.kind !== 'settling')
          return answer(fail(invalid('finish', 'only a settling commit carries a candidate')))
        const fact = input.replyAdmission
        if (
          fact !== null &&
          (!fact.step ||
            !fact.action ||
            !fact.call ||
            !fact.resultVersion ||
            !completeEvidence(fact.source))
        )
          return answer(fail(invalid('replyAdmission', 'incomplete original admission')))
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        // Agent SPEC "判定次序与失败映射": stale-advance before terminal, terminal before changed.
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (input.expected !== revisionOf(execution.revision)) {
          return answer(fail({ kind: 'changed' }))
        }
        // Agent SPEC "条件终结": only a settling commit carries a candidate, and a settling commit
        // needs one, its own or the current one.
        const finishing = execution.finishing
        const current = currentCandidate(finishing)
        if (input.state.kind === 'settling' && input.finish === null && current === undefined)
          return answer(fail(invalid('state', 'a settling commit before any candidate')))
        // An effective cancel takes precedence over an ordinary completion or failure (Agent SPEC
        // "条件终结"): a new candidate that is not cancelled is changed.
        if (
          input.finish !== null &&
          input.finish.conclusion.kind !== 'cancelled' &&
          effectiveCancels(execution).length > 0
        )
          return answer(fail({ kind: 'changed' }))
        // F1: other content than the current candidate establishes a new candidate under this
        // operation, with its author route; the same content keeps the current one. F2: the first
        // plain settling commit after the candidate with no before-terminal passage left open is
        // the proof of the author route.
        const establishes =
          input.finish !== null &&
          (current === undefined ||
            !sameContent(current, input.finish) ||
            semanticKey('checkpoint', current.checkpoint) !==
              semanticKey('checkpoint', input.checkpoint))
        const route = currentRoute(finishing)
        const proves =
          input.state.kind === 'settling' &&
          input.finish === null &&
          route?.kind === 'author' &&
          route.beforeTerminal === null &&
          !beforeTerminalOpen(input.checkpoint)
        let newEffect = false
        for (const effect of input.effects) {
          const known = execution.effects.find(existing => existing.action === effect.action)
          if (
            known !== undefined &&
            semanticKey('effect', known) !== semanticKey('effect', effect)
          ) {
            return answer(fail(conflict(input.operation)))
          }
          if (known === undefined) newEffect = true
        }
        // SPEC:598: one fact per original call and result version. The same key with the same
        // decision recognizes the original fact and its sequence; another decision conflicts.
        let admission: ModelReplyAdmission | null = null
        if (input.replyAdmission !== null) {
          const fact = input.replyAdmission
          const key = admissionKey(fact)
          const known = execution.admissions.find(record => admissionKey(record.fact) === key)
          if (known !== undefined && known.fact.decision !== fact.decision) {
            return answer(fail(conflict(input.operation)))
          }
          if (known === undefined) admission = copy(fact)
        }
        const scope = admissionScope(execution.tenant, execution.id)
        // Agent SPEC D5 5.1: a changed read position is checked by a point read of its basis.
        const readFailure = checkReadPosition(
          scope,
          execution.admissions,
          execution.admissionLedger,
          execution.checkpoint.replyAdmissionRead,
          input.checkpoint.replyAdmissionRead,
          'commit',
          admissionStatistics,
        )
        if (readFailure !== undefined) return answer(fail(readFailure))
        const handoffChange = handoffWrite(execution, input)
        if ('failure' in handoffChange) return answer(handoffChange)
        if (input.caller.kind !== 'none') {
          const response = responses.get(input.caller.kind)?.shift() ?? 'participate'
          switch (response) {
            case 'participate':
              break
            case 'fail':
              return answer(
                fail({
                  kind: 'unavailable',
                  owner: JOURNAL_OWNER,
                  diagnostic: `${input.caller.kind} participant failed`,
                }),
              )
            case 'fail-unknown':
              return { kind: 'unknown' }
            case 'conflict':
              return answer(fail({ kind: 'changed' }))
            case 'unsupported':
              return answer(fail({ kind: 'unsupported' }))
            default: {
              const _exhaustive: never = response
              return _exhaustive
            }
          }
        }
        // A commit that establishes no new fact does not advance the revision and writes no event:
        // its receipt names the current revision (Agent SPEC "执行修订").
        const unchanged =
          semanticKey('checkpoint', sameShape(execution.checkpoint)) ===
            semanticKey('checkpoint', sameShape(input.checkpoint)) &&
          semanticKey('state', execution.state) === semanticKey('state', input.state) &&
          input.events.length === 0 &&
          !newEffect &&
          !establishes &&
          !proves &&
          admission === null &&
          input.caller.kind === 'none' &&
          input.handoff === null
        // A commit that establishes no new fact does not advance the revision and writes no event:
        // it appends the envelope alone, whose receipt names the current revision (Agent SPEC
        // "执行修订"; SPEC "事实族与折叠核").
        if (unchanged)
          return {
            kind: 'batch',
            facts: [],
            blobs: [],
            kinds: [],
            derive: receiptIn,
            project: () => {},
          }
        const revision = execution.revision + 1
        const evidence = ownEvidence(execution.id, key, revision)
        const caller = input.caller
        const facts: FactBody[] = []
        const blobs: Blob[] = []
        const view = viewOf(execution.id)
        // Every input-taken event is one `step.begun`, written in the loop below in the order of
        // the events (the fold numbers the events by the facts). A commit whose cursor names a
        // batch no event took (R2-D292) writes it whole here, so `checkpointOf` finds it.
        const taken = input.checkpoint.inputBatch
        if (
          taken !== null &&
          !view.steps.some(item => item.batch.id === taken.id) &&
          !input.events.some(body => body.kind === 'input-taken')
        )
          facts.push({ kind: 'step.begun', step: input.checkpoint.step, batch: copy(taken) })
        // A main-purpose M0 adopts its final request; the attempt of the step is the number of
        // its voided intents.
        const adopted = input.checkpoint.adoptedRequest ?? null
        const adoptedBefore = execution.checkpoint.adoptedRequest ?? null
        if (adopted !== null && canonical(adopted) !== canonical(adoptedBefore)) {
          blobs.push(blobOf(adopted.record))
          facts.push({
            kind: 'request.adopted',
            step: input.checkpoint.step,
            attempt: input.checkpoint.voided.filter(item => item.step === input.checkpoint.step)
              .length,
            reference: adopted.reference,
            fixed: copy(adopted.fixed),
            schema: copy(adopted.schema),
            record: refOf(adopted.record),
            coverage: input.checkpoint.adoptedContext,
          })
        }
        // Each newly voided intent closes the adopted request it names (R2-D292); `voided` is
        // never a cursor member, so it is not rewritten with each voiding.
        for (const item of input.checkpoint.voided.slice(execution.checkpoint.voided.length)) {
          const request = view.requests.findLast(request => request.reference === item.reference)
          if (request === undefined)
            return answer(fail(invalid('checkpoint.voided', 'the voided request was not adopted')))
          facts.push({
            kind: 'intent.voided',
            step: request.step,
            attempt: request.attempt,
            basis: copy(item.basis),
          })
        }
        for (const body of input.events) {
          if (body.kind === 'input-taken')
            facts.push({ kind: 'step.begun', step: input.checkpoint.step, batch: copy(body.batch) })
          if (body.kind === 'waiting')
            facts.push({
              kind: 'wait.entered',
              step: input.checkpoint.step,
              waits: copy(body.waits),
            })
          // A reply admission projects its message (`reply.judged`); any other message is
          // referred to by its own fact.
          if (body.kind === 'message' && admission === null) {
            blobs.push(blobOf(body.message))
            facts.push({
              kind: 'message.published',
              step: input.checkpoint.step,
              message: refOf(body.message),
              source: copy(body.source),
            })
          }
          // The Agent applied a produced result: the processed stage of its consumption.
          if (body.kind === 'producer')
            facts.push({
              kind: 'result.handled',
              consumption: body.consumption,
              result: producerCallOf(body.result),
              stage: 'processed',
              evidence,
              step: input.checkpoint.step,
            })
          if (body.kind === 'control') {
            const record = execution.controls.find(item => item.operation === body.operation)
            if (record !== undefined)
              facts.push(
                controlStageOf(
                  record,
                  body.stage,
                  body.state,
                  copy(body.source),
                  input.checkpoint.step,
                ),
              )
          }
        }
        for (const effect of input.effects)
          if (!execution.effects.some(existing => existing.action === effect.action))
            facts.push({
              kind: 'call.intended',
              action: effect.action,
              step: input.checkpoint.step,
              pending: copy(effect.pending),
              authority: copy(effect.authority),
              request: null,
            })
        const admitted =
          admission === null
            ? null
            : admit(scope, execution.admissionLedger, admission, revision, evidence)
        if (admitted !== null) {
          // `admit` mints the basis of the new prefix; only a test that removes it leaves null.
          if (admitted.record.basis === null)
            throw new TypeError('a new reply admission has no prefix basis')
          // The admitted reply is the message event of this commit: the fact refers to it, so the
          // event is projected from the fact and its block (K-23 item 四).
          const reply = input.events.find(body => body.kind === 'message')
          if (reply?.kind === 'message') blobs.push(blobOf(reply.message))
          facts.push({
            kind: 'reply.judged',
            sequence: execution.admissionLedger.projection.sequence + 1,
            fact: copy(admitted.record.fact),
            basis: admitted.record.basis,
            publication: evidence,
            message: reply?.kind === 'message' ? refOf(reply.message) : null,
            source: reply?.kind === 'message' ? copy(reply.source) : null,
            history: input.handoff?.kind === 'resolve' ? copy(input.handoff.outcome.record) : null,
          })
        }
        const handoff = input.handoff
        if (handoff?.kind === 'prepare') {
          blobs.push(blobOf(handoff.request))
          facts.push({
            kind: 'handoff.prepared',
            handoff: copy(handoff.request.reference),
            request: refOf(handoff.request),
            prepared: evidence,
          })
        } else if (handoff?.kind === 'resolve' && handoff.outcome.request.kind === 'execution') {
          blobs.push(blobOf(handoff.outcome))
          facts.push({
            kind: 'handoff.resolved',
            handoff: copy(handoff.outcome.request.reference),
            resolution: 'recorded',
            outcome: refOf(handoff.outcome),
            history: handoff.outcome.decision.kind === 'prepared' ? evidence : null,
          })
        } else if (handoff?.kind === 'retire' && handoff.excluded.request.kind === 'execution') {
          blobs.push(blobOf(handoff.excluded))
          facts.push({
            kind: 'handoff.retired',
            handoff: copy(handoff.excluded.request.reference),
            reason: copy(handoff.reason),
            excluded: refOf(handoff.excluded),
          })
        }
        // The author route of a new candidate is named by the candidate, never by a counter.
        const routeRecord = journalEvidence(
          `${cell.namespace}/${execution.id}/route/${input.operation}`,
          revision,
        )
        // F1: the candidate, its author route and the supersession of the current one enter as
        // `finish.candidate` with a cursor reference (R2-D297); the reader records are projected
        // from the folded fact, never written from the input.
        const established =
          establishes && input.finish !== null
            ? (() => {
                const candidate: FinishCandidate = {
                  candidate: input.operation,
                  ...copy(input.finish),
                  checkpoint: copy(input.checkpoint),
                }
                const authorRoute: FinishRoute = {
                  kind: 'author',
                  record: routeRecord,
                  candidate: input.operation,
                  policy: copy(input.checkpoint.definition),
                  plan: [],
                  beforeTerminal: null,
                }
                const supersession = supersessionOf(
                  finishing,
                  candidate.candidate,
                  authorRoute,
                  revision,
                )
                const built = candidateFact(
                  candidate,
                  authorRoute,
                  supersession?.from ?? null,
                  input.state,
                )
                facts.push(built.fact)
                blobs.push(...built.blobs)
                return { candidate: candidate.candidate, supersession }
              })()
            : null
        if (proves && route?.kind === 'author')
          facts.push({ kind: 'finish.proved', route: copy(route.record), beforeTerminal: evidence })
        const moved = cursorMoved(view, input.checkpoint, input.state)
        if (moved !== null) {
          blobs.push(...blobsOf(input.checkpoint))
          facts.push(moved)
        }
        // The bindings this commit establishes: the pending calls of the checkpoint it commits
        // and of the effects it already holds (its new effects bind at the next commit, as the
        // writer always remembered them), under the committing instance.
        const bound = receiving.newBindings(
          { ...execution, checkpoint: input.checkpoint, effects: execution.effects },
          input.authority.instance,
        )
        facts.push(...bound.facts)
        blobs.push(...bound.blobs)
        return {
          kind: 'batch',
          facts,
          blobs,
          kinds: caller.kind === 'none' ? [] : [caller.kind],
          derive: receiptIn,
          project: (_batch, folded) => {
            if (folded.revision !== revision)
              throw new TypeError('the commit batch reached another revision than it judged')
            handoffChange.ok(revision, evidence)
            // The checkpoint is the one the folded facts name; a commit whose facts do not name
            // its checkpoint is a defect of this writer, never a silent difference.
            const checkpoint = checkpointOf(folded, state().blobs)
            if (
              semanticKey('checkpoint', sameShape(checkpoint)) !==
              semanticKey('checkpoint', sameShape(input.checkpoint))
            )
              throw new TypeError('the folded facts name another checkpoint than the commit')
            execution.checkpoint = checkpoint
            receiving.applyBindings(execution, bound)
            execution.state = copy(input.state)
            for (const effect of input.effects) {
              if (!execution.effects.some(existing => existing.action === effect.action)) {
                execution.effects.push(copy(effect))
                finishing.effectOperations.set(effect.action, input.operation)
              }
            }
            if (established !== null) {
              const view = folded.finish.candidates.find(
                item => item.candidate === established.candidate,
              )
              if (view === undefined) throw new TypeError('the established candidate did not fold')
              applyCandidate(
                finishing,
                candidateOfView(view, state().blobs),
                routeOfView(view, state().blobs),
                established.supersession,
              )
            }
            if (proves && route?.kind === 'author')
              finishing.routes[finishing.routes.indexOf(route)] = {
                ...route,
                beforeTerminal: evidence,
              }
            if (admitted !== null) {
              // The fact, its sequence, basis, publication and the projection step are written in
              // this same write as the Ja (Agent SPEC D5 第 4 节).
              execution.admissions = [...execution.admissions, admitted.record]
              execution.admissionLedger = admitted.ledger
            }
            admissionStatistics.checkpointWrites += 1
            if (caller.kind !== 'none') {
              state().jointFacts.push({
                execution: execution.id,
                operation: input.operation,
                caller: copy(caller),
              })
            }
            execution.revision = revision
            appendEvents(execution, input.events, evidence)
          },
        }
      }
      const beforeRecognition = (): Failure | undefined =>
        input.caller.kind !== 'none' && !participants.has(input.caller.kind)
          ? { kind: 'unsupported' }
          : undefined
      return write('commit', input, key, prepare, beforeRecognition)
    },

    submit(input) {
      const key = semanticKey('submit', input)
      return write('submit', input, key, () => {
        const found = owned(input, 'submit')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        // Agent SPEC per-operation table, input.submit: the original O is recognized first, then a
        // new input after ended is terminal, then a new operation may recognize an accepted input.
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        const lineage = input.lineage
        if (lineage.kind === 'new-input') {
          const malformed = acceptanceFailure('submit', input, lineage.original)
          if (malformed !== undefined) return answer(fail(malformed))
          const entry = lineage.original.entry
          if (entry.kind !== 'submit' || !sameValue(entry.value, input.value))
            return answer(fail(invalid('lineage', 'the entry does not carry this value')))
        } else if (lineage.original.entry.operation === input.operation) {
          return answer(fail(invalid('lineage', 'a recognizing operation is not the original one')))
        }
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        const known = execution.inputs.find(accepted => accepted.id === input.value.id)
        if (lineage.kind === 'recognize-input') {
          const entry = lineage.original.entry
          const acceptedBy = operationKey(input.tenant, input.execution, entry.operation)
          const record = acceptedBy === undefined ? undefined : state().operations.get(acceptedBy)
          const acceptedValue = entry.kind === 'invoke' ? entry.initial : entry.value
          if (record?.kind !== 'committed' || known === undefined || known.id !== acceptedValue.id)
            return answer(
              fail({
                kind: 'unavailable',
                owner: JOURNAL_OWNER,
                diagnostic: 'the original acceptance of the recognized input is not on record',
              }),
            )
          // The same input identity with other content conflicts (Agent SPEC "输入内容与水位线").
          if (semanticKey('input', known) !== semanticKey('input', input.value))
            return answer(fail(conflict(input.operation)))
          const stored = handoffRecord(execution, lineage.original.handoff)
          if (
            stored === undefined ||
            !sameValue(stored.request, lineage.original.outcome.request) ||
            stored.resolution?.kind !== 'recorded' ||
            !sameValue(stored.resolution.outcome.origin, lineage.original.outcome.origin)
          )
            return answer(fail(invalid('lineage', 'the original lineage is not the one on record')))
          const at = execution.inputRevisions.get(known.id)
          if (at === undefined)
            throw new Error('session Journal defect: an accepted input has no revision')
          // A recognition appends `op.recognized` of the accepting operation: it advances no
          // revision and answers with the revision of the batch it recognizes.
          return recognitionBatch(entry.operation, at, 'accepted')
        }
        // A new input under an identity the execution already accepted is another entry for the
        // same InputId: it conflicts, it does not recognize (Agent SPEC "输入内容与水位线").
        if (known !== undefined) return answer(fail(conflict(input.operation)))
        // The Session source (SE11) is co-checked by the participant; a null source cannot pass it.
        if (input.value.source === null) return answer(fail(denied('submit')))
        const acceptance = lineage.original
        const outcome = acceptance.outcome
        return {
          kind: 'batch',
          facts: [
            {
              kind: 'input.accepted',
              input: input.value.id,
              entry: acceptance.handoff.entry,
              message: refOf(input.value.content),
              source: copy(input.value.source),
              priority: input.value.priority,
              watermark: copy(outcome.record),
            },
            // The external H is published by this acceptance (Agent SPEC "消息准入").
            {
              kind: 'handoff.resolved',
              handoff: copy(acceptance.handoff),
              resolution: 'recorded',
              outcome: refOf(outcome),
              history: copy(outcome.record),
            },
          ],
          blobs: [blobOf(input.value.content), blobOf(outcome)],
          kinds: [],
          derive: receiptIn,
          receiptState: 'accepted',
          project: (_batch, view) => {
            execution.inputs.push(copy(input.value))
            execution.inputRevisions.set(input.value.id, view.revision)
            execution.handoffs.push(inputHandoff(acceptance, input.operation, view.revision))
            execution.revision = view.revision
          },
        }
      })
    },

    control(request) {
      const input = {
        principal: request.principal,
        tenant: request.tenant,
        execution: request.execution,
        operation: request.operation,
        command: copy(request.command),
      }
      const key = semanticKey('control', input)
      return write('control', input, key, () => {
        const found = owned(input, 'control')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        const target = controlTarget(input.command, pendingCalls(execution), execution.tenant)
        if ('failure' in target) return answer(target)
        // The accepted stage names this batch: its source is the batch's own evidence.
        const evidence = ownEvidence(execution.id, key, execution.revision + 1)
        const record: ControlRecord = {
          operation: input.operation,
          ...copy(target.ok),
          stages: { accepted: { state: 'reached', source: evidence } },
        }
        return {
          kind: 'batch',
          facts: [controlStageOf(record, 'accepted', 'reached', evidence)],
          blobs: [],
          kinds: [],
          derive: receiptIn,
          receiptState: 'accepted',
          project: (_batch, view) => {
            execution.controls.push(record)
            execution.revision = view.revision
            appendEvents(
              execution,
              [
                {
                  kind: 'control',
                  operation: input.operation,
                  stage: 'accepted',
                  state: 'reached',
                  source: evidence,
                },
              ],
              evidence,
            )
          },
        }
      })
    },

    acknowledge(input) {
      const key = semanticKey('acknowledge', input)
      return write('acknowledge', input, key, () => {
        const found = owned(input, 'acknowledge')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        const through = sequenceOf(input.through)
        if (through === undefined || through < 1 || through > execution.events.length) {
          return answer(fail(invalid('through', 'beyond the emitted events')))
        }
        // A `through` within the acknowledged prefix recognizes that prefix and never moves it back.
        if (through <= execution.acknowledged)
          return recognitionBatch(
            reachedBy(execution.id, execution.acknowledgedAt),
            execution.acknowledgedAt,
            'applied',
          )
        return {
          kind: 'batch',
          facts: [{ kind: 'ack.through', sequence: through }],
          blobs: [],
          kinds: [],
          derive: receiptIn,
          project: (_batch, view) => {
            execution.acknowledged = through
            execution.acknowledgedAt = view.revision
            execution.revision = view.revision
          },
        }
      })
    },

    recordResult(input) {
      const key = semanticKey('recordResult', input)
      const prepare = (): Attempt<CommandReceipt> => {
        const found = owned(input, 'recordResult')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        if (
          !input.result.version ||
          !completeEvidence(input.result.source) ||
          (input.release.kind === 'confirmed' && !completeEvidence(input.release.receipt))
        )
          return answer(fail(invalid('result', 'incomplete original result or release evidence')))
        const rejected = answer<CommandReceipt>(fail(conflict(input.operation)))
        const transfer = input.transfer
        if (
          transfer.kind !== 'none' &&
          (semanticKey('result', transfer.result) !== semanticKey('result', input.result) ||
            transfer.consumption !== input.consumption)
        ) {
          return rejected
        }
        const known = execution.results.find(
          item =>
            sameResultKey(item.result, input.result) && item.consumption === input.consumption,
        )
        if (
          known !== undefined &&
          semanticKey('result', known.result) !== semanticKey('result', input.result)
        ) {
          return rejected
        }
        let custody = known?.custody ?? null
        let completion = known?.completion ?? null
        if (transfer.kind === 'custody') {
          if (custody !== null && !sameEvidence(custody, transfer.retained)) return rejected
          custody = transfer.retained
        }
        if (transfer.kind === 'processed') {
          if (completion !== null && !sameEvidence(completion, transfer.completion)) return rejected
          completion = transfer.completion
        }
        const previous = known?.release ?? { kind: 'pending' as const }
        if (previous.kind === 'confirmed') {
          if (
            input.release.kind !== 'confirmed' ||
            !sameEvidence(previous.receipt, input.release.receipt)
          ) {
            return rejected
          }
        }
        if (input.release.kind === 'confirmed' && custody === null && completion === null) {
          return rejected
        }
        const responsibility: ResultResponsibility = {
          result: copy(input.result),
          consumption: input.consumption,
          custody,
          completion,
          release: copy(input.release),
        }
        const resultKey = semanticKey('responsibility', [
          input.result.producer,
          input.result.version,
          input.consumption,
        ])
        // No new responsibility fact: a new operation recognizes the existing one at its revision.
        if (
          known !== undefined &&
          semanticKey('responsibility', known) === semanticKey('responsibility', responsibility)
        ) {
          const at = execution.resultRevisions.get(resultKey) ?? execution.revision
          return recognitionBatch(reachedBy(execution.id, at), at, 'applied')
        }
        // Each stage the responsibility newly reaches is one `result.handled`; a responsibility
        // recorded before any transfer is its `recorded` stage.
        const evidence = ownEvidence(execution.id, key, execution.revision + 1)
        const call = producerCallOf(input.result)
        const handled = (stage: ResultStage, basis: DurableEvidence): FactBody => ({
          kind: 'result.handled',
          consumption: input.consumption,
          result: call,
          stage,
          evidence: copy(basis),
          step: null,
        })
        const facts: FactBody[] = []
        if (known === undefined) facts.push(handled('recorded', evidence))
        if (custody !== null && (known?.custody ?? null) === null)
          facts.push(handled('custody', custody))
        if (completion !== null && (known?.completion ?? null) === null)
          facts.push(handled('processed', completion))
        if (input.release.kind === 'confirmed' && previous.kind !== 'confirmed')
          facts.push(handled('released', input.release.receipt))
        return {
          kind: 'batch',
          facts,
          blobs: [],
          kinds: transfer.kind === 'none' ? [] : [transfer.kind],
          derive: receiptIn,
          project: (_batch, view) => {
            const index = execution.results.indexOf(known ?? responsibility)
            if (index === -1) execution.results.push(responsibility)
            else execution.results[index] = responsibility
            execution.resultRevisions.set(resultKey, view.revision)
            execution.revision = view.revision
          },
        }
      }
      const beforeRecognition = (): Failure | undefined =>
        options.custodian !== undefined &&
        !options.custodian({
          principal: input.principal,
          tenant: input.tenant,
          execution: input.execution,
        })
          ? denied('recordResult')
          : undefined
      return write('recordResult', input, key, prepare, beforeRecognition)
    },

    async recordControl(request) {
      const method = 'recordControl'
      const entered = enter(method, request)
      if ('failure' in entered) return entered
      const attachment = suppliedAttachment(request)
      const input = {
        principal: request.principal,
        tenant: request.tenant,
        execution: request.execution,
        operation: request.operation,
        target: request.target,
        stage: request.stage,
        state: request.state,
        source: copy(request.source),
      }
      const key = semanticKey(
        method,
        attachment === undefined
          ? input
          : {
              ...input,
              toolOperation: attachment.kind === 'local' ? attachment.parts : attachment.reference,
            },
      )
      await cell.wait(input, method)
      return cell.transact(input, method, () =>
        run(method, entered.ok.fault, input, key, () => {
          const found = owned(input, method)
          if ('failure' in found) return answer(found)
          const execution = found.ok
          const original = recognized<CommandReceipt>(input, key)
          if (original !== undefined) return answer(original)
          if (attachment?.kind === 'malformed') {
            return answer(fail(invalid('toolOperation', 'malformed-tool-operation-reference')))
          }
          const index = execution.controls.findIndex(record => record.operation === input.target)
          const record = execution.controls[index]
          if (record === undefined)
            return answer(fail(invalid('target', 'not a control of this execution')))
          const attached = attachToolOperation(record, input.tenant, input.operation, attachment)
          if ('failure' in attached) return answer(attached)
          const { updated, referenceAdded } = attachedRecord(record, attached.ok)
          if (!STAGES[record.command.kind].has(input.stage)) {
            return answer(fail(invalid('stage', `not a stage of ${record.command.kind}`)))
          }
          const fact = record.stages[input.stage]
          const stageKey = JSON.stringify([input.target, input.stage])
          const sameFact =
            fact !== undefined &&
            fact.state === input.state &&
            sameEvidence(fact.source, input.source)
          if (sameFact && !referenceAdded) {
            // The same stage fact is recognized by the new operation at the fact's revision.
            const first = execution.stageReceipts.get(stageKey)
            if (first !== undefined) {
              const at = Number(first.revision)
              return recognitionBatch(reachedBy(execution.id, at), at, 'applied')
            }
          }
          const ended = execution.state.kind === 'ended'
          // After a lawful ended only the three late duty stages may be saved; a new intent or
          // revocation answers terminal (Agent SPEC "六个阶段", Q1b). Evidence that contradicts a
          // stage already reached is not a new intent: it takes the persistent rejection below
          // (Agent SPEC "判定次序与失败映射" 8).
          if (
            ended &&
            !sameFact &&
            fact?.state !== 'reached' &&
            (input.stage === 'intent-established' || input.stage === 'qualification-revoked')
          ) {
            return answer(fail({ kind: 'terminal' }))
          }
          if (!sameFact && fact !== undefined && fact.state === 'reached') {
            // Contradicting evidence: the persistent rejection saves an audit with one revision;
            // the audit is the evidence of its own batch.
            const audit = ownEvidence(execution.id, key, execution.revision + 1)
            return {
              kind: 'reject',
              failure: conflict(input.operation),
              audit,
              facts: [{ kind: 'control.rejected', control: input.target, audit }],
              project: (_batch, view) => {
                execution.revision = view.revision
              },
            }
          }
          const evidence = ownEvidence(execution.id, key, execution.revision + 1)
          const changed: ControlRecord = {
            ...updated,
            stages: {
              ...record.stages,
              [input.stage]: { state: input.state, source: copy(input.source) },
            },
          }
          let written: CommandReceipt | undefined
          return {
            kind: 'batch',
            facts: [controlStageOf(changed, input.stage, input.state, copy(input.source))],
            blobs: [],
            kinds: [],
            derive: derived => (written = receiptIn(derived)),
            project: (_batch, view) => {
              execution.controls[index] = changed
              if (!sameFact) {
                if (written === undefined)
                  throw new TypeError('append derives the receipt before it projects the batch')
                execution.stageReceipts.set(stageKey, written)
              }
              execution.revision = view.revision
              if (ended || sameFact) return
              appendEvents(
                execution,
                [
                  {
                    kind: 'control',
                    operation: input.target,
                    stage: input.stage,
                    state: input.state,
                    source: input.source,
                  },
                ],
                evidence,
              )
            },
          }
        }),
      )
    },

    recordHandoff(input) {
      const key = semanticKey('recordHandoff', input)
      const request =
        input.original.kind === 'recorded' ? input.original.outcome.request : input.original.request
      const reference = request.reference
      /**
       * The attempt that this Rh is, once it is the root or the one direct successor of the chain
       * of its H (Agent SPEC "准入结果保管"); otherwise the refusal.
       */
      const validated = (execution: Execution): Outcome<CustodyAttempt, Failure> => {
        const record = handoffRecord(execution, reference)
        if (record === undefined || !sameValue(record.request, request))
          return fail(invalid('original', 'the request is not on the authoritative record'))
        if (record.resolution !== null && !sameValue(record.resolution, input.original))
          return fail(conflict(input.operation))
        const attempt: CustodyAttempt = {
          handoff: copy(reference),
          original: copy(input.original),
          custody: input.custody === null ? null : copy(input.custody),
        }
        const chain = custodyOf(execution, reference)
        const custody = input.custody
        if (custody === null) {
          // The root: the first Rh of this H. Another root for the same H is not a derivation.
          if (chain !== null && chain.root !== input.operation)
            return fail(invalid('operation', 'the H already has its custody root'))
          return succeed(attempt)
        }
        if (chain === null || custody.custodyRoot !== chain.root)
          return fail(invalid('operation', 'the custody root is not the root of this H'))
        const rootAttempt = execution.custodyAttempts.get(chain.root)
        if (rootAttempt === undefined || !sameValue(rootAttempt.original, input.original))
          return fail(conflict(input.operation))
        const last = chain.chain.at(-1)
        if (last === undefined || last.operation !== custody.predecessor.operation)
          return fail(invalid('operation', 'the predecessor is not the last attempt'))
        if (last.state !== 'excluded')
          return fail(invalid('operation', 'the predecessor is not permanently excluded'))
        const excludedChain = chain.chain.map(item => item.operation)
        if (
          custody.priorExcluded.length !== excludedChain.length ||
          custody.priorExcluded.some(
            (item, index) =>
              item.operation !== excludedChain[index] ||
              item.predecessor !== (index === 0 ? null : excludedChain[index - 1]),
          )
        )
          return fail(invalid('operation', 'the exclusion chain is not the chain of the root'))
        return succeed(attempt)
      }
      const prepare = (): Attempt<CommandReceipt> => {
        const found = owned(input, 'recordHandoff')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        // Agent SPEC "准入结果保管" 4: a permanently excluded attempt can never commit under this
        // operation; the fence answers before any new write.
        const at = operationKey(input.tenant, input.execution, input.operation)
        const fixed = at === undefined ? undefined : state().operations.get(at)
        if (fixed?.kind === 'excluded')
          return answer(fail(invalid('operation', 'operation-permanently-excluded')))
        const checked = validated(execution)
        if ('failure' in checked) return answer(checked)
        const record = handoffRecord(execution, reference)
        if (record === undefined) throw new Error('recordHandoff: the validated record is missing')
        // The attempt reaches the write step: it is part of the chain whether it commits or is
        // dropped, because a dropped attempt is permanently excluded under its operation.
        execution.custodyAttempts.set(input.operation, checked.ok)
        const custody = input.custody
        const facts: FactBody[] = []
        // A successor names its permanently excluded predecessor: the exclusion is a fact of the
        // log, written with the attempt that succeeds it unless a takeover fence wrote it (R2-D307).
        if (custody !== null && !viewOf(execution.id).excluded.has(custody.predecessor.operation)) {
          const prior = custody.priorExcluded.at(-1)
          facts.push({
            kind: 'op.excluded',
            operation: custody.predecessor.operation,
            reason: 'handoff',
            evidence: copy(custody.predecessor.request),
            predecessor: prior === undefined ? null : prior.predecessor,
          })
        }
        facts.push({
          kind: 'handoff.recorded',
          handoff: copy(reference),
          resolution: input.original.kind,
          outcome: refOf(input.original),
          predecessor: custody === null ? null : custody.predecessor.operation,
          custody: custody === null ? null : refOf(custody),
        })
        return {
          kind: 'batch',
          facts,
          blobs:
            custody === null ? [blobOf(input.original)] : [blobOf(input.original), blobOf(custody)],
          kinds: [],
          derive: receiptIn,
          project: (_batch, view) => {
            if (record.resolution === null) record.resolution = copy(input.original)
            // An unpublished prepared message is retained after the end; Rh never publishes.
            if (execution.state.kind === 'ended' && record.history.kind === 'pending')
              record.history = { kind: 'retained', disposition: execution.state.disposition }
            execution.revision = view.revision
          },
        }
      }
      /** A dropped Rh still reached the write: a valid attempt joins the chain as excluded. */
      const dropped = () => {
        const found = owned(input, 'recordHandoff')
        if ('failure' in found) return
        const execution = found.ok
        if (execution.custodyAttempts.has(input.operation)) return
        const checked = validated(execution)
        if (!('failure' in checked)) execution.custodyAttempts.set(input.operation, checked.ok)
      }
      return write('recordHandoff', input, key, prepare, undefined, dropped)
    },

    prepareFinish(input) {
      const key = semanticKey('prepareFinish', input)
      type Issued = Readonly<{ receipt: CommandReceipt; obligations: DurableEvidence }>
      return write(
        'prepareFinish',
        input,
        key,
        () => {
          const found = owned(input, 'prepareFinish')
          if ('failure' in found) return answer(found)
          const execution = found.ok
          const original = recognized<Issued>(input, key)
          if (original !== undefined) return answer(original)
          const authorization = input.authorization
          // A cancel without settle was denied before the recognition (`settleRefusal`). Then Agent
          // SPEC "判定次序与失败映射" 4 to 6 and the prepareFinish row of the judgment order:
          // stale-advance, terminal, the cancel checks, the kind of the authorization against the
          // named candidate, an advancement under an effective cancel, then changed, then a
          // candidate this Journal does not hold.
          if (authorization.kind === 'advancement' && !holds(execution, authorization.authority))
            return answer(fail({ kind: 'stale-advance' }))
          if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
          if (authorization.kind === 'cancel') {
            const checked = cancelCheck(execution, authorization, 'prepareFinish')
            if (checked.kind === 'failure') return answer(fail(checked.failure))
          }
          const finishing = execution.finishing
          const candidate = candidateOf(finishing, input.candidate)
          // A cancel issues the list of a cancelled candidate only, an advancement never.
          if (
            candidate !== undefined &&
            (candidate.conclusion.kind === 'cancelled') !== (authorization.kind === 'cancel')
          )
            return answer(fail(denied('prepareFinish')))
          if (authorization.kind === 'advancement' && effectiveCancels(execution).length > 0)
            return answer(fail({ kind: 'changed' }))
          if (execution.state.kind !== 'settling') return answer(fail({ kind: 'changed' }))
          if (input.expected !== revisionOf(execution.revision))
            return answer(fail({ kind: 'changed' }))
          if (candidate === undefined)
            return answer(fail(invalid('candidate', 'not a candidate of this execution')))
          if (candidate.candidate !== finishing.current) return answer(fail({ kind: 'changed' }))
          // The list evidence is the receipt evidence of its batch: one list per batch.
          const planned = plannedReceipt(execution, input.operation, key)
          const evidence = planned.evidence
          const built = obligationsOf(execution, candidate, input.operation)
          // R2-D322: the ledger kept the obligations current step by step; the issue appends the
          // ones whose form still differs and the close that lists them all by reference. A
          // re-issue is a new list of the same candidate and rewrites no unchanged obligation.
          const ordinal = listsIssued(finishing, candidate.candidate) + 1
          const issued = issueFacts(
            candidate.candidate,
            ordinal,
            built.items,
            built.coverage,
            evidence,
            viewOf(execution.id).finish.obligations,
            `${cell.namespace}/${execution.id}`,
            execution.revision,
          )
          // One new revision, no event, the checkpoint and the candidate as they were.
          return {
            kind: 'batch',
            facts: issued.facts,
            blobs: issued.blobs,
            kinds: [],
            derive: derived => {
              if (derived.kind !== 'obligations')
                throw new TypeError('a prepareFinish answers its obligations')
              return { receipt: plannedOf(derived, planned), obligations: derived.obligations }
            },
            project: (_batch, view) => {
              const folded = view.finish.lists.get(listKey(candidate.candidate, ordinal))
              if (folded === undefined) throw new TypeError('the issued list did not fold')
              const list = listOfView(
                folded,
                candidate,
                candidateCheckpoint(execution.id, candidate.candidate, view.revision),
                state().blobs,
              )
              // The list read back from the facts is the list the builder issued, or a defect.
              if (!sameValue(list.items, built.items) || !sameValue(list.coverage, built.coverage))
                throw new TypeError('the issued list read back from its facts is another list')
              finishing.issued.set(list.evidence.record, list)
              finishing.obligations = list.evidence.record
              execution.revision = view.revision
            },
          }
        },
        () => settleRefusal(input),
      )
    },

    tryFinish(input) {
      const key = semanticKey('tryFinish', input)
      return write(
        'tryFinish',
        input,
        key,
        () => {
          const found = owned(input, 'tryFinish')
          if ('failure' in found) return answer(found)
          const execution = found.ok
          const original = recognized<FinishResult>(input, key)
          if (original !== undefined) return answer(original)
          const changed = answer<FinishResult>(
            succeed({ kind: 'changed', revision: revisionOf(execution.revision) }),
          )
          const authorization = input.authorization
          // A cancel without settle was denied before the recognition (`settleRefusal`). Then the
          // tryFinish row of the judgment order: stale-advance, terminal, the cancel checks,
          // the kind of the authorization, an advancement under an effective cancel, then changed,
          // then the list, then the closure.
          if (authorization.kind === 'advancement' && !holds(execution, authorization.authority))
            return answer(fail({ kind: 'stale-advance' }))
          if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
          const finishing = execution.finishing
          if (authorization.kind === 'cancel') {
            const checked = cancelCheck(execution, authorization, 'tryFinish')
            if (checked.kind === 'failure') return answer(fail(checked.failure))
            const route = currentRoute(finishing)
            if (route?.kind === 'cancellation' && route.control !== authorization.control)
              return answer(
                fail(invalid('authorization.control', 'not the control of the current route')),
              )
          }
          const candidate = currentCandidate(finishing)
          // A cancel ends with cancelled only, and an advancement never ends a cancelled candidate.
          if (
            candidate !== undefined &&
            (candidate.conclusion.kind === 'cancelled') !== (authorization.kind === 'cancel')
          )
            return answer(fail(denied('tryFinish')))
          if (authorization.kind === 'advancement' && effectiveCancels(execution).length > 0)
            return changed
          const intent = intentOf(finishing)
          if (
            candidate === undefined ||
            intent === undefined ||
            execution.state.kind !== 'settling'
          )
            return changed
          if (input.expected !== revisionOf(execution.revision)) return changed
          // The list must be issued by this Journal for this candidate (Agent SPEC "条件终结").
          const given = input.intent.obligations
          if (given === null)
            return answer(fail(invalid('intent.obligations', 'the obligations are not issued')))
          const list = finishing.issued.get(given.record)
          if (list === undefined || !sameEvidence(list.evidence, given))
            return answer(fail(invalid('intent.obligations', 'not a list this Journal issued')))
          if (list.candidate !== candidate.candidate)
            return answer(fail(invalid('intent.obligations', 'the list of another candidate')))
          // The intent is compared with the projection for equality only.
          if (semanticKey('finish-intent', intent) !== semanticKey('finish-intent', input.intent))
            return changed
          // The closure is rebuilt by the builder prepareFinish used; the list stays usable while
          // the responsibility projection is unchanged.
          const closure = obligationsOf(execution, candidate, input.operation).items
          if (projectionOf(closure) !== projectionOf(list.items)) return changed
          const boundary = watermarkRange(execution, candidate.inputWatermark.record)
          if (boundary === undefined || boundary.to < execution.inputs.length) return changed
          const check = blockedReason(execution, candidate, closure, list.items)
          if (check.kind === 'changed') return changed
          if (check.kind === 'blocked') return answer(succeed(copy(check.value)))
          if (check.kind === 'unknown') return answer(fail(damaged(check.diagnostic)))
          // The terminal disposition is the receipt evidence of the batch that ends.
          const receipt = plannedReceipt(execution, input.operation, key)
          // The Session participant is read-only, so it is asked before the write: its conflict is
          // FinishResult.changed, not a failure (Agent SPEC "条件终结", PA-02).
          const participation = cell.participate(input, 'tryFinish', receipt, null)
          if (participation !== undefined) {
            return participation.kind === 'changed' ? changed : answer(fail(participation))
          }
          // R2-D297: the end is one constant fact; the pending observations and the retained
          // handoffs are what it implies for the passages and the handoffs, not facts of their own.
          return {
            kind: 'batch',
            facts: [
              {
                kind: 'finish.ended',
                candidate: candidate.candidate,
                conclusion: candidate.conclusion,
                disposition: receipt.evidence,
              },
            ],
            blobs: [],
            kinds: [],
            derive: derived => {
              if (derived.kind !== 'ended') throw new TypeError('a tryFinish answers its end')
              return { kind: 'ended', receipt: plannedOf(derived, receipt) }
            },
            project: (_batch, view) => {
              const ended = view.finish.ended
              if (ended === null) throw new TypeError('the end did not fold')
              const disposition = ended.disposition
              execution.state = {
                kind: 'ended',
                conclusion: copy(ended.conclusion),
                disposition,
              }
              execution.observations = execution.checkpoint.passages
                .filter(passage => passage.position === 'after_terminal')
                .map(passage => ({
                  terminal: disposition,
                  passage: passage.id,
                  implementation: copy(passage.implementation),
                  observed: null,
                }))
              // A prepared message that no Ja published is retained by the terminal disposition
              // (Agent SPEC "准入结果保管"); nothing publishes it after the end.
              for (const record of execution.handoffs) {
                if (record.history.kind === 'pending')
                  record.history = { kind: 'retained', disposition }
              }
              execution.revision = view.revision
              appendEvents(
                execution,
                [{ kind: 'ended', conclusion: copy(ended.conclusion), disposition }],
                disposition,
              )
            },
          }
        },
        () => settleRefusal(input),
      )
    },

    commitSettlement(input) {
      const key = semanticKey('commitSettlement', input)
      return write('commitSettlement', input, key, () => {
        const found = owned(input, 'commitSettlement')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<SettlementResult>(input, key)
        if (original !== undefined) return answer(original)
        switch (input.kind) {
          case 'establish-cancellation':
          case 'migrate-cancellation':
          case 'judge-cancellation':
            return settleCandidate(execution, input, key)
          case 'record-card-reconciliation':
          case 'record-legacy-return':
          case 'record-tool-association':
            return settleCustody(execution, input, key)
          default: {
            const _exhaustive: never = input
            return _exhaustive
          }
        }
      })
    },

    recordTerminalObservation(input) {
      const key = semanticKey('recordTerminalObservation', input)
      const prepare = (): Attempt<CommandReceipt> => {
        const found = owned(input, 'recordTerminalObservation')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        const index = execution.observations.findIndex(item => item.passage === input.passage)
        const item = execution.observations[index]
        if (item === undefined) {
          return answer(fail(invalid('passage', 'not a pending post-terminal observation')))
        }
        if (
          !sameEvidence(item.terminal, input.terminal) ||
          semanticKey('adoption', item.implementation) !==
            semanticKey('adoption', input.implementation)
        ) {
          return answer(fail(conflict(input.operation)))
        }
        if (item.observed !== null) {
          if (!sameEvidence(item.observed, input.observed))
            return answer(fail(conflict(input.operation)))
          // The same value is recognized by the new operation at the revision of the registration:
          // an `op.recognized` batch, which advances no revision and answers the registration's.
          const first = execution.observed.get(input.passage)
          if (first !== undefined)
            return recognitionBatch(first.operation, Number(first.revision), 'applied')
        }
        const planned = plannedReceipt(execution, input.operation, key)
        const observed = input.observed
        return {
          kind: 'batch',
          facts: [
            {
              kind: 'observation.recorded',
              terminal: item.terminal,
              passage: item.passage,
              implementation: item.implementation,
              observed,
            },
          ],
          blobs: [],
          kinds: [],
          derive: derived => plannedOf(derived, planned),
          project: (batch, view) => {
            const fact = view.observations.find(entry => entry.pub === batch.pub)
            if (fact === undefined) throw new TypeError('the observation did not fold')
            execution.observations[index] = { ...item, observed: copy(fact.observed) }
            execution.observed.set(input.passage, planned)
            execution.revision = view.revision
          },
        }
      }
      const beforeRecognition = (): Failure | undefined =>
        options.observer !== undefined &&
        !options.observer({
          principal: input.principal,
          tenant: input.tenant,
          execution: input.execution,
        })
          ? denied('recordTerminalObservation')
          : undefined
      return write('recordTerminalObservation', input, key, prepare, beforeRecognition)
    },

    async readCancellationInstallation(input) {
      const fault = readFault('load')
      if (fault !== undefined) return fault
      const found = owned(input, 'load')
      if ('failure' in found) return found
      return options.cancellation === undefined
        ? fail(damaged('no cancellation policy is installed on this binding'))
        : succeed(copy(options.cancellation.installation.record))
    },

    async load(input) {
      const fault = readFault('load')
      if (fault !== undefined) return fault
      const found = owned(input, 'load')
      if ('failure' in found) return found
      admissionStatistics.loads += 1
      return snapshotOf(found.ok)
    },

    async inputs(input) {
      const fault = readFault('inputs')
      if (fault !== undefined) return fault
      const found = owned(input, 'inputs')
      if ('failure' in found) return found
      const execution = found.ok
      const range = watermarkRange(execution, input.watermark.record)
      if (
        range === undefined ||
        !sameEvidence(
          input.watermark,
          journalEvidence(
            `${cell.namespace}/${execution.id}/inputs/${range.from}-${range.to}`,
            range.to,
          ),
        )
      )
        return fail(invalid('watermark', 'not a watermark of this execution'))
      const id = batchIdOf(execution.id, range.from, range.to)
      cache(execution).batches.set(id, range)
      const taken = execution.inputs.slice(range.from, range.to)
      return succeed({
        batch: {
          id,
          watermark: copy(input.watermark),
          ordered: taken.map(accepted => accepted.id),
        },
        messages: copy(taken.map(accepted => accepted.content)),
      })
    },

    async readReplyAdmissions(input): Promise<Outcome<ReplyAdmissionPage, Failure>> {
      const fault = readFault('readReplyAdmissions')
      if (fault !== undefined) return fault
      // `owned` checks the current read qualification on every page; a cursor grants nothing.
      const found = owned(input, 'readReplyAdmissions')
      if ('failure' in found) return found
      const execution = found.ok
      return readAdmissionPage(
        admissionScope(execution.tenant, execution.id),
        execution.admissions,
        execution.admissionLedger,
        input,
        pageLimits,
        execution.revision,
        'readReplyAdmissions',
        admissionStatistics,
      )
    },

    async query(input) {
      const qualification = cell.authorize(input, 'query')
      if (qualification) return fail(qualification)
      const rejected = receiving.queryQualification(input)
      if (rejected) return fail(rejected)
      const fault = readFault('query')
      if (fault !== undefined) return fault
      const execution = state().executions.get(executionKey(input.tenant, input.execution))
      if (execution !== undefined && !tenantEquals(execution.tenant, input.tenant)) {
        return fail(denied('query'))
      }
      const at = operationKey(input.tenant, input.execution, input.operation)
      const record = at === undefined ? undefined : state().operations.get(at)
      if (execution === undefined && record === undefined) return fail(denied('query'))
      if (record === undefined || record.kind === 'pending') return succeed({ kind: 'unknown' })
      if (record.kind === 'excluded') {
        return succeed({ kind: 'excluded', evidence: copy(record.evidence) })
      }
      if (record.kind === 'rejected') {
        return succeed({
          kind: 'rejected',
          failure: copy(record.failure),
          audit: copy(record.audit),
          revision: record.revision,
        })
      }
      return succeed({ kind: 'committed', receipt: copy(record.receipt) })
    },

    output: {
      async read(input) {
        const fault = readFault('read')
        if (fault !== undefined) return fault
        const found = owned(input, 'read')
        if ('failure' in found) return found
        return readPage(found.ok, input.after, input.limit)
      },

      async *events(input) {
        let after = input.after
        while (!input.signal.aborted) {
          const fault = readFault('read')
          if (fault !== undefined) {
            yield fault
            return
          }
          const found = owned(input, 'events')
          if ('failure' in found) {
            yield found
            return
          }
          const execution = found.ok
          const page = readPage(execution, after, readLimit)
          if ('failure' in page || page.ok.kind === 'gap') {
            yield page
            return
          }
          if (page.ok.events.length > 0) {
            yield page
            after = page.ok.next
            if (page.ok.events.some(event => event.body.kind === 'ended')) return
            continue
          }
          if (execution.state.kind === 'ended') return
          await new Promise<void>(resolve => {
            const wake = () => {
              input.signal.removeEventListener('abort', wake)
              cell.waiters(execution.id).delete(wake)
              resolve()
            }
            cell.waiters(execution.id).add(wake)
            input.signal.addEventListener('abort', wake, { once: true })
          })
        }
      },
    },
  }

  const receiving = createJournalReceiving<P>({
    owned,
    operations: () => state().operations,
    authorize: cell.authorize,
    gate: cell.gate,
    state: () => cell.state().receiving,
    mutate: action => cell.mutate(action),
    touch: () => cell.touch(),
    namespace: cell.namespace,
    operationKey,
    indexed: operation => state().view.ops.has(operation),
    write,
    holds,
    receiptOf,
    ownEvidence,
    projectEntry: (execution, entry, cause) =>
      appendEvents(execution, [{ kind: 'entry', entry }], cause),
    ...(options.custodian === undefined ? {} : { custodian: options.custodian }),
  })
  return {
    port,
    provider: { journal: port, ...receiving.ports },
    targets: receiving.targets,
    toolTargets: receiving.toolTargets,
    receiving: receiving.controls,
    durability: 'none',
    setRetainedToolInvocationFault(input) {
      return cell.mutateExecution(input.execution, () => {
        if (!retainedToolInvocationFaults) return { kind: 'rejected', reason: 'disabled' }
        const key = retainedFaultKey(input)
        if (key === undefined) return { kind: 'rejected', reason: 'invalid-input' }
        const execution = state().executions.get(executionKey(input.tenant, input.execution))
        if (execution === undefined || !tenantEquals(execution.tenant, input.tenant)) {
          return { kind: 'rejected', reason: 'target-unavailable' }
        }
        const index = execution.controls.findIndex(record => record.operation === input.control)
        const record = execution.controls[index]
        if (record === undefined) return { kind: 'rejected', reason: 'target-unavailable' }
        if (!isToolControl(record)) return { kind: 'rejected', reason: 'not-tool-control' }
        const original = retainedToolInvocationBaselines.get(key)
        if (input.fault === null) {
          if (original !== undefined) {
            execution.controls[index] = { ...record, toolInvocation: original }
            retainedToolInvocationBaselines.delete(key)
          }
          return { kind: 'cleared' }
        }
        if (original === undefined) retainedToolInvocationBaselines.set(key, record.toolInvocation)
        execution.controls[index] = {
          ...record,
          toolInvocation: MALFORMED_RETAINED_TOOL_INVOCATION,
        }
        return { kind: 'applied' }
      })
    },
    failNext(method, fault) {
      const queue = writeFaults.get(method) ?? []
      queue.push(fault)
      writeFaults.set(method, queue)
    },
    failNextRead(method) {
      readFaults.set(method, (readFaults.get(method) ?? 0) + 1)
    },
    respond(kind, response) {
      const queue = responses.get(kind) ?? []
      queue.push(response)
      responses.set(kind, queue)
    },
    settle(execution, operation, outcome, tenant) {
      return cell.mutateExecution(execution, () => {
        const matches = [...state().executions.values()].filter(value => value.id === execution)
        const owner = tenant ?? (matches.length === 1 ? matches[0]?.tenant : undefined)
        if (owner === undefined && matches.length > 1) return false
        for (const [key, record] of state().operations) {
          if (
            record.kind !== 'pending' ||
            record.execution !== execution ||
            record.operation !== operation ||
            (owner !== undefined && !tenantEquals(record.tenant, owner))
          ) {
            continue
          }
          if (outcome === 'applied') record.run()
          else {
            record.drop?.()
            state().operations.set(key, {
              kind: 'excluded',
              key: record.key,
              execution,
              operation,
              reason: 'dropped',
              evidence: journalEvidence(
                `${cell.namespace}/${execution}/excluded/${operation}/dropped`,
                0,
              ),
            })
          }
          return true
        }
        return false
      })
    },
    joint: () => copy(state().jointFacts),
    seedLegacyCandidate(id, candidate, tenant) {
      return cell.mutateExecution(id, () => {
        const matches = [...state().executions.values()].filter(
          value => value.id === id && (tenant === undefined || tenantEquals(tenant, value.tenant)),
        )
        const execution = matches.length === 1 ? matches[0] : undefined
        if (execution === undefined || execution.state.kind === 'ended') return false
        const finishing = execution.finishing
        const revision = execution.revision + 1
        const legacy = (what: string): DurableEvidence =>
          journalEvidence(`${cell.namespace}/${execution.id}/legacy/${candidate}/${what}`, revision)
        const seeded: FinishCandidate = {
          candidate,
          origin: legacy('origin'),
          conclusion: { kind: 'cancelled', cause: legacy('cause') },
          failure: null,
          inputWatermark: watermarkOf(execution),
          checkpoint: copy(execution.checkpoint),
          conditions: legacy('conditions'),
        }
        const route: FinishRoute = {
          kind: 'author',
          record: nextEvidence(execution, 'route', revision),
          candidate,
          policy: copy(execution.checkpoint.definition),
          plan: [],
          beforeTerminal: nextEvidence(execution, 'legacy-proof', revision),
        }
        finishing.candidates.push(seeded)
        finishing.routes.push(route)
        finishing.current = candidate
        finishing.route = route.record.record
        finishing.currentJudgment = null
        finishing.obligations = null
        execution.state = { kind: 'settling' }
        execution.revision = revision
        return true
      })
    },
    applyRetention(id, tenant) {
      return cell.mutateExecution(id, () => {
        const matches = [...state().executions.values()].filter(
          value => value.id === id && (tenant === undefined || tenantEquals(tenant, value.tenant)),
        )
        const execution = matches.length === 1 ? matches[0] : undefined
        if (execution === undefined) return 0
        const before = execution.retainedFrom
        execution.retainedFrom = Math.max(execution.retainedFrom, execution.acknowledged + 1)
        return execution.retainedFrom - before
      })
    },
    replyAdmissions: {
      seed(id, count, tenant) {
        return cell.mutateExecution(id, () => {
          const execution = only(id, tenant)
          if (execution === undefined || execution.state.kind === 'ended') return false
          const scope = admissionScope(execution.tenant, execution.id)
          const revision = execution.revision + 1
          const records = [...execution.admissions]
          let ledger = execution.admissionLedger
          for (let index = 0; index < count; index += 1) {
            const sequence = ledger.projection.sequence + 1
            const call = decodeModelCallId(`mcall_seed${String(sequence).padStart(12, '0')}`)
            const action = decodeActionId(`seed-${sequence}/action`)
            if ('failure' in call || 'failure' in action) return false
            const fact: ModelReplyAdmission = {
              step: execution.checkpoint.step,
              action: action.ok,
              call: call.ok,
              resultVersion: 'v1',
              decision: 'admitted',
              source: journalEvidence(
                `${cell.namespace}/${execution.id}/seed/${sequence}`,
                revision,
              ),
            }
            const publication = nextEvidence(execution, 'commit', revision)
            const admitted = admit(scope, ledger, fact, revision, publication)
            records.push(admitted.record)
            ledger = admitted.ledger
          }
          execution.admissions = records
          execution.admissionLedger = ledger
          execution.revision = revision
          return true
        })
      },
      damage(id, damage, tenant) {
        return cell.mutateExecution(id, () => {
          const execution = only(id, tenant)
          if (execution === undefined) return false
          const next = damagedLedger(execution.admissions, execution.admissionLedger, damage)
          if (next === undefined) return false
          execution.admissions = next.records.filter(
            (record): record is AdmissionRecord => record !== undefined,
          )
          execution.admissionLedger = next.ledger
          return true
        })
      },
      limitPages(limits) {
        pageLimits = { ...limits }
      },
      statistics: () => ({ ...admissionStatistics }),
      changeRule(id, rule, conversion, tenant) {
        return cell.mutateExecution(id, () => {
          const execution = only(id, tenant)
          if (execution === undefined) return false
          admissionRule = copy(rule)
          if (conversion === 'none') return true
          const projection = rebuild(
            execution.admissions,
            execution.admissionLedger,
            rule,
            admissionStatistics,
          )
          if (projection === undefined) return false
          execution.admissionLedger = { ...execution.admissionLedger, projection }
          return true
        })
      },
    },
  }

  /** The one held execution `id` names, of `tenant` when given. */
  function only(id: AgentExecutionId, tenant: TenantId | undefined): Execution | undefined {
    const matches = [...state().executions.values()].filter(
      value => value.id === id && (tenant === undefined || tenantEquals(tenant, value.tenant)),
    )
    return matches.length === 1 ? matches[0] : undefined
  }
}
