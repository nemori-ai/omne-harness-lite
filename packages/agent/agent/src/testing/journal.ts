// The memory `AgentJournal`: a single-process, non-durable Journal provider for tests. It follows
// the same-shape list of docs/architecture/mechanisms.md "两种实现必须同形的事实", so the tests
// written against it carry over to a durable provider. Every write runs synchronously between two
// awaits, which makes one write atomic and gives all writes of the process one order. Nothing
// survives the process, and fencing holds only inside it.
//
// The binding declares its coordination mode at construction. A standalone binding refuses a
// non-null grant or input source before any write; a coordinated one asks the coordinator hooks
// and the scripted participant responses inside the same write (SPEC "提交参加者协议").
import type {
  AcceptedInput,
  AgentCheckpoint,
  AgentEvent,
  AgentEventBody,
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  Authority,
  CallerCommit,
  CancellationJudgmentInput,
  CancellationJudgmentRecord,
  CancellationPolicy,
  CancellationPolicyInstallation,
  CardReconciliationRecord,
  CommandReceipt,
  ConsumerRef,
  ControlRecord,
  ControlStage,
  EffectIntent,
  EventPage,
  DurableEvidence,
  ExecutionControl,
  ExecutionHandoff,
  FinishAuthorization,
  FinishCandidate,
  FinishObligation,
  FinishObligations,
  FinishRoute,
  HandoffCustody,
  HandoffReference,
  HandoffRequest,
  HandoffResolution,
  JournalCommitState,
  LegacyF2Entry,
  LegacyInvocationReturn,
  MigrationRecord,
  OriginalInputAcceptance,
  RecoveryContinuation,
  ExecutionMutation,
  ExecutionRevision,
  ExecutionSnapshot,
  ExecutionState,
  Failure,
  FinishResult,
  InputBatchId,
  InputId,
  JournalCapabilities,
  JournalCommit,
  ModelReplyAdmission,
  PendingCall,
  ReplyAdmissionPage,
  ReplyAdmissionPageCursor,
  ReplyAdmissionSequence,
  ResultResponsibility,
  SettlementRequest,
  SettlementResult,
  TerminalObservation,
  TerminalParticipantFact,
  ToolAssociationRecord,
  Adoption,
  Access,
  AgentJournalEntry,
  AgentReceivedProvider,
} from '@omne-harness/agent-contract'
import type { SettlementQualification, TestHostRecord } from './host-record.ts'
import { decodeAgentExecutionId, decodeAgentOperationId } from '@omne-harness/agent-contract'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { resolveModelInvocationRef } from '@omne-harness/model-contract'
import {
  resolveToolInvocationRef,
  resolveToolOperationRef,
  type ToolInvocationParts,
  type ToolInvocationRef,
  type ToolOperationParts,
  type ToolOperationRef,
} from '@omne-harness/tool-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import type { ModelReceptionTargets } from '../receiving-types.ts'
import { createJournalReceiving, type JournalReceivingControls } from './journal-receiving.ts'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  attachmentIdOf,
  batchIdOf,
  frozenSet,
  journalEvidence,
  revisionOf,
  semanticKey,
  sequenceOf,
  JOURNAL_OWNER,
} from './journal-values.ts'
import { canonical } from '../canonical.ts'
import {
  beforeTerminalPending,
  buildObligations,
  CATEGORY_ORDER,
  categoryOf,
  criteriaOf,
  currentCandidate,
  currentJudgment,
  currentObligations,
  currentRoute,
  emptyFinishing,
  firstPending,
  firstUnknown,
  intentOf,
  projectionOf,
  routeByRecord,
  sameContent,
  settlementOf,
  type FinishingRecords,
  type PendingOperation,
} from './journal-finishing.ts'

export type JointCommitKind = Exclude<CallerCommit['kind'], 'none'>

/** The write methods of the Journal. A fault can be scripted on each of them. */
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

/** The read methods of the Journal. `read` also serves each page of `events`. */
export type JournalRead = 'load' | 'inputs' | 'readReplyAdmissions' | 'query' | 'read'

/**
 * A fault of the next call of one write method.
 *
 * - `unavailable`: nothing is saved; the call returns `unavailable`.
 * - `commit-unknown` with `applied`: the write runs as usual, and the call returns `commit-unknown`.
 *   `query` then answers `committed` if the write took effect, and `excluded` if it failed.
 * - `commit-unknown` with `dropped`: nothing is saved; `query` answers `excluded`.
 * - `commit-unknown` with `pending`: the write is held. `query` answers `unknown` and the snapshot
 *   lists the operation in `unresolved` until `settle` runs or decides it, or until an `attach`
 *   fences it, which excludes it.
 *
 * The call that takes a fault answers with it, also when it re-sends an operation whose write is
 * held; the held write belongs to the earlier call and stays as it is. A call that is denied because
 * its tenant does not own the execution, or because its Tool reference belongs to another tenant,
 * still uses up the fault and is never held.
 */
export type WriteFault =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'commit-unknown'; outcome: 'applied' | 'dropped' | 'pending' }>

/**
 * How a declared participant answers one joint commit; see SPEC "提交参加者协议". `fail` saves
 * nothing and returns `unavailable`. `fail-unknown` returns `commit-unknown` and holds the commit as
 * pending, like the `pending` write fault. `conflict` returns `changed`, `unsupported` returns
 * `unsupported`, and both save nothing.
 */
export type ParticipantResponse =
  | 'participate'
  | 'fail'
  | 'fail-unknown'
  | 'conflict'
  | 'unsupported'

/** The four operations a coordinated binding checks with the external coordinator (SPEC "提交参加者协议"). */
export type CoordinatedOperation = 'open' | 'attach' | 'submit' | 'tryFinish'

/** A joint commit that the participant saved together with the Journal's own facts. */
export type JointFact = Readonly<{
  execution: AgentExecutionId
  operation: AgentOperationId
  caller: Exclude<CallerCommit, { kind: 'none' }>
}>

type Qualification<P, X> = (input: Access<P> & X) => boolean

export type MemoryAgentJournalOptions<P> = Readonly<{
  /**
   * The coordination mode this binding declares (SPEC "提交参加者协议"). Required: a binding has
   * no implicit mode. A standalone binding refuses a non-null grant or input source before any
   * write; a coordinated one checks them through the coordinator hooks below.
   */
  coordination: JournalCapabilities['coordination']
  /** Explicitly enables retained invocation corruption controls. Default: false. */
  retainedToolInvocationFaults?: boolean
  /** The joint-commit kinds whose participant this provider declares. Default: none. */
  participants?: Iterable<JointCommitKind>
  /**
   * The coordinator a coordinated binding checks with, in the same write: whether the grant of
   * `open` or `attach` and the input source of `open` or `submit` hold. A coordinated binding
   * requires both to be non-null and answers `denied` when a hook is absent or refuses. Ignored by a
   * standalone binding.
   */
  coordinator?: Readonly<{
    grant?: Qualification<P, Readonly<{ execution: AgentExecutionId; grant: DurableEvidence }>>
    source?: Qualification<P, Readonly<{ execution: AgentExecutionId; source: DurableEvidence }>>
  }>
  /** Whether the caller of `recordResult` or `received` is the lawful custodian or processor. Default: yes. */
  custodian?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>
  /** Whether the caller of `recordTerminalObservation` may observe and record. Default: yes. */
  observer?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>
  /**
   * Whether the caller holds one of the three settlement qualifications (SPEC "commitSettlement
   * 的变体"): `settle` for the candidate and judgment variants and for the cancel prepareFinish and
   * tryFinish, `settle` and `migrate-cancellation` together for a migration, `reconcile` for the
   * custody variants. Default: all three hold.
   */
  qualification?: Qualification<
    P,
    Readonly<{ execution: AgentExecutionId; operation: SettlementQualification }>
  >
  /** The largest `limit` that `read` accepts. Default: 100. */
  readLimit?: number
  /** The schema of every event that this Journal writes. */
  eventSchema?: Adoption
  /** The rule of the reply-admission projection. */
  replyAdmissionRule?: Adoption
  /**
   * The trusted cancellation judgment this binding holds (SPEC "安装记录与资格"): the installation
   * governance issued and the pure implementation it names. Absent: the candidate, migration and
   * judgment variants of commitSettlement answer `unavailable`.
   */
  cancellation?: Readonly<{
    installation: CancellationPolicyInstallation
    policy: CancellationPolicy
  }>
  /**
   * The records of the trusted host reads that the three custody variants of commitSettlement
   * resolve a source to, by the record text of the source evidence. A source no record answers is
   * unreadable: the variant answers `unavailable`.
   */
  hostRecords?: ReadonlyMap<string, TestHostRecord>
}>

export type MemoryAgentJournal<P> = Readonly<{
  port: AgentJournal<P>
  provider: AgentReceivedProvider<P, ContentBlock>
  targets: ModelReceptionTargets<P>
  receiving: JournalReceivingControls<P>
  durability: 'none'
  /** Changes one saved Tool control's invocation, or restores its first saved bytes with null. */
  setRetainedToolInvocationFault(
    input: Readonly<{
      tenant: TenantId
      execution: AgentExecutionId
      control: AgentOperationId
      fault:
        | Readonly<{ kind: 'malformed' }>
        | Readonly<{ kind: 'foreign-tenant'; reference: ToolInvocationRef }>
        | null
    }>,
  ):
    | Readonly<{ kind: 'applied' }>
    | Readonly<{ kind: 'cleared' }>
    | Readonly<{
        kind: 'rejected'
        reason: 'disabled' | 'invalid-input' | 'target-unavailable' | 'not-tool-control'
      }>
  /** Scripts a fault on the next call of one write method. Faults are used in order. */
  failNext(method: JournalWrite, fault: WriteFault): void
  /** Makes the next call of one read method return `unavailable`. */
  failNextRead(method: JournalRead): void
  /**
   * Queues how the participant of `kind` answers the next joint commit, or how the coordinator
   * answers the next coordinated operation of a coordinated binding. Default: participate.
   */
  respond(kind: JointCommitKind | CoordinatedOperation, response: ParticipantResponse): void
  /**
   * Decides a pending write. `applied` runs it now under the checks of that moment; when they fail,
   * the operation is excluded. `dropped` excludes it. Returns `false` when nothing is pending.
   * Only a pending write of the execution's own tenant is decided; for a pending `open`, whose
   * execution does not exist yet, `tenant` names the tenant when two could match.
   */
  settle(
    execution: AgentExecutionId,
    operation: AgentOperationId,
    outcome: 'applied' | 'dropped',
    tenant?: TenantId,
  ): boolean
  /** The joint commits that participants saved, in commit order. */
  joint(): readonly JointFact[]
  /**
   * Seeds a legacy cancelled candidate as a writer of the old protocol left it (SPEC
   * "旧取消记录的迁移"): the candidate `candidate` with the conclusion cancelled, on an author route
   * whose before-terminal proof is set, in one new revision. It is the fixture seam of the
   * migration cases; `commit` does not accept such an F1. Returns `false` when the execution is
   * not found or already ended.
   */
  seedLegacyCandidate(
    execution: AgentExecutionId,
    candidate: AgentOperationId,
    tenant?: TenantId,
  ): boolean
  /**
   * Sets the terminal condition the one external participant of a coordinated binding reports
   * from now on: judge-cancellation reads it into the judgment input, and the cancel tryFinish
   * re-reads it as the same fact (SPEC "判断输入、判据与记录", TerminalParticipantFacts). Default:
   * ready. A standalone binding has no participant and ignores it.
   */
  participantCondition(condition: TerminalParticipantFact['condition']): void
  /**
   * Applies the retention policy to one execution: drops the acknowledged events. Unacknowledged
   * events are kept, as SPEC "终态后与 ended" requires. Returns how many events were dropped.
   */
  applyRetention(execution: AgentExecutionId, tenant?: TenantId): number
}>

type Attachment = {
  authority: Authority
  status: 'active' | 'detached' | 'superseded'
  handoff: DurableEvidence | null
  /** The revision at which the handoff was established, for a later detach that recognizes it. */
  handoffRevision: number
}

type Range = Readonly<{ from: number; to: number }>

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
  batches: Map<InputBatchId, Range>
  watermarks: Map<string, Range>
  /** Every event ever written; those before `retainedFrom` are dropped by retention. */
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
  /** The receipt that first recorded each control stage fact, by target and stage. */
  stageReceipts: Map<string, CommandReceipt>
  /** The receipt of the first registration of each post-terminal observation. */
  observed: Map<TerminalObservation['passage'], CommandReceipt>
  admissions: Readonly<{ sequence: number; fact: ModelReplyAdmission }>[]
  admissionThroughs: Map<string, number>
  entries: AgentJournalEntry[]
  /** The handoff responsibilities of the execution, as `load.handoffs` projects them (SPEC "消息准入"). */
  handoffs: HandoffRecord[]
  /** Every Rh attempt that reached the write step, by operation, for the custody chain of its H. */
  custodyAttempts: Map<AgentOperationId, CustodyAttempt>
  /** The candidate, route, obligation, judgment and custody records (SPEC "条件终结"). */
  finishing: FinishingRecords
  serial: number
  waiters: Set<() => void>
}

type HandoffRecord = {
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
type Excluded = Readonly<{ kind: 'excluded'; key: string; evidence: DurableEvidence }>
/** The persistent rejection of a recordControl (SPEC "查询的四种结论与持久拒绝"). */
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

/** The outcome of preparing one write: either an answer without a write, or a write to apply. */
export type Attempt<R> =
  | Readonly<{ kind: 'answer'; value: Outcome<R, Failure> }>
  /** A declared participant could not tell whether its part held; nothing is saved yet. */
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'write'; value: R; receipt: CommandReceipt; apply: () => void }>
  /**
   * A new operation that recognizes an existing fact (SPEC "原操作认回与恢复"): only its index is
   * saved, with a receipt at the revision of the fact; no execution fact and no revision change.
   */
  | Readonly<{ kind: 'recognize'; value: R; receipt: CommandReceipt }>
  /**
   * Contradicting evidence (SPEC "查询的四种结论与持久拒绝"): `apply` saves the audit and advances
   * one revision, the operation is fixed as rejected, and the call answers the conflict.
   */
  | Readonly<{
      kind: 'reject'
      failure: Extract<Failure, { kind: 'conflict' }>
      audit: DurableEvidence
      revision: number
      apply: () => void
    }>

/** Which stages apply to which control; SPEC "六个阶段". */
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
/** The protocol under which the coordinated participant of this double reports its terminal condition. */
const PARTICIPANT_PROTOCOL: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'terminal-participant',
  revision: '1',
  digest: 'memory:terminal-participant',
})
const denied = (action: string): Failure => ({ kind: 'denied', action })
const conflict = (operation: AgentOperationId): Extract<Failure, { kind: 'conflict' }> => ({
  kind: 'conflict',
  operation,
})
const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })

function copy<T>(value: T): T {
  return structuredClone(value)
}

function sameResult(left: ResultResponsibility['result'], right: ResultResponsibility['result']) {
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
    if ('failure' in parts) {
      return fail(
        parts.failure.kind === 'foreign-tenant'
          ? denied('control')
          : invalid('command.call', 'invalid-tool-invocation-reference'),
      )
    }
    if (parts.ok.call !== command.call) continue
    if (matched !== undefined && admission !== parts.ok.admission) ambiguous = true
    matched = pending
    admission = parts.ok.admission
  }
  if (ambiguous) return fail(invalid('command.call', 'ambiguous-associated-tool-call'))
  if (matched === undefined) return fail(invalid('command.call', 'no-associated-tool-call'))
  return succeed({ command, toolInvocation: matched.reference, toolOperation: null })
}

function isToolControl(record: ControlRecord): record is ToolControlRecord {
  return record.command.kind === 'interrupt-tool' || record.command.kind === 'background-tool'
}

// Only for explicitly enabled storage-corruption fixtures, never for minting a valid brand.
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

/** The text that keys one operation of one tenant's execution, from the canonical tenant text. */
function operationText(tenant: string, execution: AgentExecutionId, operation: AgentOperationId) {
  return JSON.stringify([tenant, execution, operation])
}

/**
 * The key of the restore baseline of a well-formed retained-fault request: the canonical tenant,
 * execution and control. A request with another shape, or with a foreign payload that the real
 * resolver does not call foreign, has no key.
 */
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
  if (exactDataFields(fault, ['kind']) && fault.kind === 'malformed') return key
  if (!exactDataFields(fault, ['kind', 'reference']) || fault.kind !== 'foreign-tenant')
    return undefined
  const resolved = resolveToolInvocationRef(fault.reference, input.tenant)
  return 'failure' in resolved && resolved.failure.kind === 'foreign-tenant' ? key : undefined
}

/** Whether a Tool reference names a tenant other than the given one. */
function foreignReference(reference: ToolInvocationRef, tenant: TenantId): boolean {
  const resolved = resolveToolInvocationRef(reference, tenant)
  return 'failure' in resolved && resolved.failure.kind === 'foreign-tenant'
}

/** A supplied `toolOperation` that resolved in the caller's tenant: the bytes as given and the parts. */
type LocalAttachment = Readonly<{
  kind: 'local'
  reference: ToolOperationRef
  parts: ToolOperationParts
}>
type SuppliedAttachment =
  | LocalAttachment
  | Readonly<{ kind: 'malformed'; reference: ToolOperationRef }>
  | Readonly<{ kind: 'foreign' }>

/** Reads the optional attachment of a recording once, through the public Tool resolver. */
function suppliedAttachment(
  request: Readonly<{ tenant: TenantId; toolOperation?: ToolOperationRef }>,
): SuppliedAttachment | undefined {
  const reference = request.toolOperation
  if (reference === undefined) return undefined
  const resolved = resolveToolOperationRef(reference, request.tenant)
  if ('ok' in resolved) return { kind: 'local', reference, parts: resolved.ok }
  return resolved.failure.kind === 'foreign-tenant'
    ? { kind: 'foreign' }
    : { kind: 'malformed', reference }
}

/** Whether a recording adds a Tool operation reference to its control record. */
type Attached =
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'attached'; record: ToolControlRecord }>

const damaged = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'agentJournal',
  diagnostic,
})

/**
 * A retained reference that does not resolve in the record's tenant, or that does not agree with the
 * other retained reference, breaks an invariant of this provider. It is not a caller conflict (SPEC
 * "Recording operation 与阶段事实"): a foreign reference is denied without details, any other damage
 * makes the record unavailable.
 */
function retainedFailure(
  failure: Readonly<{ kind: 'malformed' | 'foreign-tenant' }>,
  diagnostic: string,
): Failure {
  return failure.kind === 'foreign-tenant' ? denied('recordControl') : damaged(diagnostic)
}

/** The parts of the retained operation reference of a Tool control, checked against its invocation. */
function retainedOperation(
  record: ToolControlRecord,
  invocation: ToolInvocationParts,
  tenant: TenantId,
): Outcome<ToolOperationParts | null, Failure> {
  if (record.toolOperation === null) return succeed(null)
  const diagnostic = 'invalid-retained-tool-operation'
  const retained = resolveToolOperationRef(record.toolOperation, tenant)
  if ('failure' in retained) return fail(retainedFailure(retained.failure, diagnostic))
  return retained.ok.call === invocation.call && retained.ok.admission === invocation.admission
    ? succeed(retained.ok)
    : fail(damaged(diagnostic))
}

/**
 * Checks the retained references of a new recording's target, then the supplied attachment against
 * them, in the order of SPEC "Recording operation 与阶段事实" step 4.
 */
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
  if ('failure' in invocation) {
    return fail(retainedFailure(invocation.failure, 'invalid-retained-tool-invocation'))
  }
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

/** The control record that a recording writes, and whether it adds an operation reference. */
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

/** The `load.handoffs` projection: a frozen deep copy of every record at this revision. */
/** The handoff records with the custody chain that `custody` derives from the operation records. */
function handoffsOf(
  execution: Execution,
  custody: (handoff: HandoffReference) => ExecutionHandoff['custody'],
): readonly ExecutionHandoff[] {
  return execution.handoffs.map(record => ({
    ...copy(record),
    custody: custody(record.handoff),
  }))
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

/** Creates an empty memory Journal. Each call has its own records; nothing is shared. */
export function createMemoryAgentJournal<P>(
  options: MemoryAgentJournalOptions<P>,
): MemoryAgentJournal<P> {
  const coordination = options.coordination
  const retainedToolInvocationFaults = options.retainedToolInvocationFaults === true
  const retainedToolInvocationBaselines = new Map<string, ToolInvocationRef>()
  const participants = frozenSet(options.participants ?? [])
  const readLimit = options.readLimit ?? 100
  const eventSchema: Adoption = options.eventSchema ?? {
    owner: JOURNAL_OWNER,
    name: 'agent-event',
    revision: '1',
    digest: 'memory:agent-event',
  }
  const admissionRule: Adoption = options.replyAdmissionRule ?? {
    owner: JOURNAL_OWNER,
    name: 'reply-admission-projection',
    revision: '1',
    digest: 'memory:reply-admission-projection',
  }
  const executions = new Map<string, Execution>()
  const executionKey = (tenant: TenantId, id: AgentExecutionId) => {
    const encoded = tenantCodec.encode(tenant)
    return JSON.stringify([encoded.ok ? encoded.value : null, id])
  }
  const operations = new Map<string, OperationRecord>()
  const writeFaults = new Map<JournalWrite, WriteFault[]>()
  const readFaults = new Map<JournalRead, number>()
  const responses = new Map<JointCommitKind | CoordinatedOperation, ParticipantResponse[]>()
  const coordinator = options.coordinator ?? {}
  const jointFacts: JointFact[] = []
  let participantCondition: TerminalParticipantFact['condition'] = { kind: 'ready' }

  /**
   * Operation records are kept per tenant, so a query never tells one tenant whether another
   * tenant's execution or operation exists. A tenant that legal-identity did not mint has no key.
   */
  const operationKey = (
    tenant: TenantId,
    execution: AgentExecutionId,
    operation: AgentOperationId,
  ): string | undefined => {
    const text = tenantCodec.encode(tenant)
    return text.ok ? operationText(text.value, execution, operation) : undefined
  }

  // ------------------------------------------------------------------------------------------
  // Shared steps of every write

  /** The execution an Access may use: `denied` when it is absent or belongs to another tenant. */
  function owned(
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
    action: string,
  ): Outcome<Execution, Failure> {
    const execution = executions.get(executionKey(input.tenant, input.execution))
    if (execution === undefined || !tenantEquals(execution.tenant, input.tenant)) {
      return fail(denied(action))
    }
    return succeed(execution)
  }

  /** The original answer of an operation that already committed, or `undefined` when none did. */
  function recognized<R>(
    input: ExecutionMutation<P>,
    key: string,
  ): Outcome<R, Failure> | undefined {
    const at = operationKey(input.tenant, input.execution, input.operation)
    const record = at === undefined ? undefined : operations.get(at)
    if (record?.kind === 'rejected') {
      // A persistent rejection answers its fixed conflict again; another input conflicts too, and
      // neither writes a second audit (SPEC "查询的四种结论与持久拒绝").
      return fail(record.key === key ? copy(record.failure) : conflict(input.operation))
    }
    if (record?.kind !== 'committed') return undefined
    // The record of this operation was written by the same method, whose key starts with its name,
    // so its value has the type R of that method.
    return record.key === key ? succeed(copy(record.value) as R) : fail(conflict(input.operation))
  }

  /** The receipt of a new operation that recognizes a fact established at `revision` (SPEC "原操作认回与恢复" 1). */
  function recognition(
    execution: Execution,
    operation: AgentOperationId,
    revision: number,
    state: CommandReceipt['state'],
  ): CommandReceipt {
    return receiptOf(
      execution,
      operation,
      revision,
      nextEvidence(execution, 'recognized', revision),
      state,
    )
  }

  function recognize<R>(value: R, receipt: CommandReceipt): Attempt<R> {
    return { kind: 'recognize', value, receipt }
  }

  function nextEvidence(execution: Execution, what: string, revision: number): DurableEvidence {
    execution.serial += 1
    return journalEvidence(`${execution.id}/${what}/${execution.serial}`, revision)
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
      throw new TypeError('the memory Journal has an execution without an attachment')
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
      const waiters = [...execution.waiters]
      execution.waiters.clear()
      for (const wake of waiters) wake()
    }
  }

  /**
   * Runs one prepared write under the scripted fault of its method, records its operation and
   * returns the answer of the call. Every call that answers `commit-unknown` leaves a record that
   * `query` can decide: committed when the write took effect, excluded when it did not, and pending
   * (listed in `unresolved`, fenced by `attach`, decided by `settle`) while nobody knows yet.
   */
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
    return run(method, entered.ok.fault, input, key, prepare, beforeRecognition, onDropped)
  }

  /**
   * The first step of every write. The scripted fault belongs to the next call of the method,
   * whoever makes it, so it is taken here, before anything else of the call is read. Ownership is
   * checked before the fault takes effect: a write on another tenant's execution, or on an execution
   * that does not exist (other than `open`), is denied and never becomes pending.
   */
  function enter(
    method: JournalWrite,
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
  ): Outcome<Readonly<{ fault: WriteFault | undefined }>, Failure> {
    const fault = writeFaults.get(method)?.shift()
    const target = executions.get(executionKey(input.tenant, input.execution))
    const foreign =
      target === undefined ? method !== 'open' : !tenantEquals(target.tenant, input.tenant)
    return foreign ? fail(denied(method)) : succeed({ fault })
  }

  /** The rest of a write after `enter`, under the fault that `enter` took. */
  function run<R>(
    method: JournalWrite,
    fault: WriteFault | undefined,
    input: ExecutionMutation<P>,
    key: string,
    prepare: () => Attempt<R>,
    beforeRecognition?: () => Failure | undefined,
    onDropped?: () => void,
  ): Outcome<R, Failure> {
    const at = operationKey(input.tenant, input.execution, input.operation)
    if (at === undefined) return fail(denied(method))
    const commitUnknown = fail<Failure>({ kind: 'commit-unknown', operation: input.operation })
    const scriptedUnavailable = fail<Failure>({
      kind: 'unavailable',
      owner: JOURNAL_OWNER,
      diagnostic: `${method} is scripted unavailable`,
    })
    const check = (): Failure | undefined => {
      if (beforeRecognition === undefined) return undefined
      // `open` creates the execution, so ownership is only checked for the other methods.
      if (method !== 'open') {
        const found = owned(input, method)
        if ('failure' in found) return found.failure
      }
      return beforeRecognition()
    }
    const pending = operations.get(at)
    if (pending?.kind === 'pending') {
      // A call that meets the held write of its operation still answers with its own fault. The
      // held write belongs to the earlier call: no fault of this call runs, drops or holds it again.
      if (fault !== undefined)
        return fault.kind === 'unavailable' ? scriptedUnavailable : commitUnknown
      const rejected = check()
      if (rejected !== undefined) return fail(rejected)
      return pending.key === key ? commitUnknown : fail(conflict(input.operation))
    }
    const exclude = (reason: string) => {
      const fixed = operations.get(at)?.kind
      if (fixed === 'committed' || fixed === 'rejected') return
      operations.set(at, {
        kind: 'excluded',
        key,
        evidence: journalEvidence(`${input.execution}/excluded/${input.operation}/${reason}`, 0),
      })
    }
    type Run =
      | Readonly<{ kind: 'wrote'; value: R }>
      | Readonly<{ kind: 'answered'; value: Outcome<R, Failure> }>
      | Readonly<{ kind: 'unknown' }>
    const attempt = (): Run => {
      const rejected = check()
      if (rejected !== undefined) return { kind: 'answered', value: fail(rejected) }
      const prepared = prepare()
      if (prepared.kind === 'answer') return { kind: 'answered', value: prepared.value }
      if (prepared.kind === 'unknown') return prepared
      if (prepared.kind === 'reject') {
        prepared.apply()
        operations.set(at, {
          kind: 'rejected',
          key,
          failure: prepared.failure,
          audit: prepared.audit,
          revision: revisionOf(prepared.revision),
        })
        return { kind: 'answered', value: fail(prepared.failure) }
      }
      if (prepared.kind === 'write') prepared.apply()
      operations.set(at, {
        kind: 'committed',
        key,
        value: copy(prepared.value),
        receipt: prepared.receipt,
      })
      return { kind: 'wrote', value: prepared.value }
    }
    /** After a run whose answer the caller does not see: no write excludes, unknown stays held. */
    const decide = (run: Run) => {
      if (run.kind === 'answered') exclude('no-write')
      if (run.kind === 'unknown') hold()
    }
    const hold = () => {
      const fixed = operations.get(at)?.kind
      if (fixed === 'committed' || fixed === 'rejected') return
      operations.set(at, {
        kind: 'pending',
        key,
        tenant: input.tenant,
        execution: input.execution,
        operation: input.operation,
        run: () => {
          operations.delete(at)
          decide(attempt())
        },
        ...(onDropped === undefined ? {} : { drop: onDropped }),
      })
    }
    if (fault === undefined) {
      const run = attempt()
      if (run.kind === 'wrote') return succeed(run.value)
      if (run.kind === 'answered') return run.value
      hold()
      return commitUnknown
    }
    if (fault.kind === 'unavailable') return scriptedUnavailable
    switch (fault.outcome) {
      case 'applied':
        decide(attempt())
        return commitUnknown
      case 'dropped':
        // The write reached the provider and was dropped: the attempt exists, nothing applied.
        onDropped?.()
        exclude('dropped')
        return commitUnknown
      case 'pending':
        hold()
        return commitUnknown
      default: {
        const _exhaustive: never = fault.outcome
        return _exhaustive
      }
    }
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

  /** Whether a record is a pending write of this execution under the execution's own tenant. */
  function pendingOf(record: OperationRecord, execution: Execution): record is Pending {
    return (
      record.kind === 'pending' &&
      record.execution === execution.id &&
      tenantEquals(record.tenant, execution.tenant)
    )
  }

  /** Excludes every pending write of an execution: the fence of `attach` (fact 5). */
  function fence(execution: Execution): void {
    for (const [key, record] of operations) {
      if (!pendingOf(record, execution) || record.key.startsWith('received:')) continue
      operations.set(key, {
        kind: 'excluded',
        key: record.key,
        evidence: journalEvidence(`${execution.id}/excluded/${record.operation}/fenced`, 0),
      })
    }
  }

  // ------------------------------------------------------------------------------------------
  // The coordination mode (SPEC "提交参加者协议")

  /** A standalone binding refuses a non-null grant or input source before any write. */
  function standaloneRefusal(...given: readonly (DurableEvidence | null)[]): Failure | undefined {
    return coordination === 'standalone' && given.some(value => value !== null)
      ? { kind: 'unsupported' }
      : undefined
  }

  /** A coordinated binding requires the grant and asks the coordinator about it; otherwise denied. */
  function grantHolds(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; grant: DurableEvidence | null }>,
  ): boolean {
    if (coordination === 'standalone') return input.grant === null
    if (input.grant === null || coordinator.grant === undefined) return false
    return coordinator.grant({
      principal: input.principal,
      tenant: input.tenant,
      execution: input.execution,
      grant: input.grant,
    })
  }

  /** A coordinated binding requires the input source and asks the coordinator about it; otherwise denied. */
  function sourceHolds(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; source: DurableEvidence | null }>,
  ): boolean {
    if (coordination === 'standalone') return input.source === null
    if (input.source === null || coordinator.source === undefined) return false
    return coordinator.source({
      principal: input.principal,
      tenant: input.tenant,
      execution: input.execution,
      source: input.source,
    })
  }

  /**
   * The scripted answer of a participant to one joint commit, or of the coordinator to one
   * coordinated operation: `undefined` to go on, an attempt that ends the call otherwise. A
   * conflict of the coordinator on open, attach or submit is the failed co-check of the grant or
   * source, so it is `denied`; on tryFinish it is FinishResult.changed, which the caller maps.
   */
  function participation<R>(
    kind: JointCommitKind | CoordinatedOperation,
    conflict: () => Attempt<R>,
  ): Attempt<R> | undefined {
    const response = responses.get(kind)?.shift() ?? 'participate'
    switch (response) {
      case 'participate':
        return undefined
      case 'fail':
        return answer(
          fail({
            kind: 'unavailable',
            owner: JOURNAL_OWNER,
            diagnostic: `${kind} participant failed`,
          }),
        )
      case 'fail-unknown':
        return { kind: 'unknown' }
      case 'conflict':
        return conflict()
      case 'unsupported':
        return answer(fail({ kind: 'unsupported' }))
      default: {
        const _exhaustive: never = response
        return _exhaustive
      }
    }
  }

  /** The coordinator's answer to a coordinated operation; a standalone binding has none. */
  function coordinated<R>(kind: CoordinatedOperation, conflict: () => Attempt<R>) {
    return coordination === 'coordinated' ? participation(kind, conflict) : undefined
  }

  // ------------------------------------------------------------------------------------------
  // Snapshot and input boundary

  function inputBoundary(execution: Execution): Range {
    const taken = execution.checkpoint.inputBatch
    const from = taken === null ? 0 : (execution.batches.get(taken)?.to ?? 0)
    return { from, to: execution.inputs.length }
  }

  function watermarkOf(execution: Execution): DurableEvidence {
    const range = inputBoundary(execution)
    const evidence = journalEvidence(`${execution.id}/inputs/${range.from}-${range.to}`, range.to)
    execution.watermarks.set(evidence.record, range)
    return evidence
  }

  function admissionsThrough(execution: Execution): DurableEvidence {
    const count = execution.admissions.length
    const evidence = journalEvidence(`${execution.id}/reply-admissions/${count}`, count)
    execution.admissionThroughs.set(evidence.record, count)
    return evidence
  }

  function snapshotOf(execution: Execution): ExecutionSnapshot {
    let consecutive = 0
    let total = 0
    let last: DurableEvidence | null = null
    for (const { fact } of execution.admissions) {
      if (fact.decision === 'rejected') {
        consecutive += 1
        total += 1
      } else {
        consecutive = 0
        last = fact.source
      }
    }
    const unresolved: AgentOperationId[] = []
    for (const record of operations.values()) {
      if (pendingOf(record, execution)) {
        unresolved.push(record.operation)
      }
    }
    const emitted = execution.events.length
    return copy({
      execution: execution.id,
      revision: revisionOf(execution.revision),
      state: stateOf(execution),
      checkpoint: execution.checkpoint,
      inputWatermark: watermarkOf(execution),
      history: journalEvidence(`${execution.id}/history`, execution.revision),
      replyAdmissions: {
        through: admissionsThrough(execution),
        rule: admissionRule,
        lastAdmission: last,
        consecutiveDenials: String(consecutive),
        totalDenials: String(total),
        prefix: {
          sequence: execution.admissions.length.toString() as ReplyAdmissionSequence,
          basis: journalEvidence(
            `${execution.id}/reply-admission-prefix/${execution.admissions.length}`,
            execution.admissions.length,
          ),
        },
      },
      executionAttachment: activeAttachment(execution)?.authority ?? null,
      unresolved,
      controls: execution.controls,
      results: execution.results,
      entries: execution.entries,
      effects: execution.effects,
      terminalObservations: execution.observations,
      handoffs: handoffsOf(execution, handoff => custodyOf(execution, handoff)),
      finishObligations: currentObligations(execution.finishing) ?? null,
      settlement: settlementOf(execution.finishing),
      output: {
        emittedThrough: emitted === 0 ? null : String(emitted),
        acknowledgedThrough: execution.acknowledged === 0 ? null : String(execution.acknowledged),
      },
    })
  }

  /** The public state: a settling execution carries the FinishIntent projection of its current candidate. */
  function stateOf(execution: Execution): ExecutionState {
    if (execution.state.kind !== 'settling') return execution.state
    const intent = intentOf(execution.finishing)
    if (intent === undefined)
      throw new Error('memory Journal defect: a settling execution without a candidate')
    return { kind: 'settling', intent }
  }

  /** The writes of the execution still undecided, except `operation` (SPEC "条件终结", operations). */
  function pendingOperations(
    execution: Execution,
    operation: AgentOperationId,
  ): PendingOperation[] {
    const pendingWrites: PendingOperation[] = []
    for (const record of operations.values()) {
      if (pendingOf(record, execution) && record.operation !== operation)
        pendingWrites.push({ operation: record.operation, method: record.key.split(':')[0] ?? '' })
    }
    return pendingWrites
  }

  /** The obligations of `candidate` from the Journal's own records at the current revision. */
  function obligationsOf(
    execution: Execution,
    candidate: FinishCandidate,
    operation: AgentOperationId,
  ) {
    return buildObligations(execution, candidate, pendingOperations(execution, operation))
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
        recovery: journalEvidence(`${execution.id}/recovery`, execution.revision),
      })
    }
    const events = execution.events.slice(position, position + limit)
    const next = position + events.length
    return succeed({
      kind: 'page',
      events: copy(events),
      next: String(next),
      caughtUp: next === execution.events.length,
    })
  }

  type Blocked = Extract<FinishResult, { kind: 'blocked' }>
  type FinishCheck =
    | Readonly<{ kind: 'clear' }>
    | Readonly<{ kind: 'changed' }>
    | Readonly<{ kind: 'blocked'; value: Blocked }>
    | Readonly<{ kind: 'unavailable'; diagnostic: string }>

  /**
   * The judgment of the responsibilities at the terminal commit (SPEC "条件终结" result table), read
   * from the current list `items`, rebuilt with the same function prepareFinish used.
   *
   * - author route: a cancelled candidate that did not migrate is blocked with passages at the
   *   route record. Otherwise the first pending item in the fixed order inputs, controls,
   *   operations, passages, custody is blocked, with the source of that item in the issued list
   *   `listed` (rulings-gate-S23 17); a route without its proof counts as a pending of passages. Without a pending, an unknown item is unavailable.
   * - cancellation route: no judgment record is blocked with passages; a judgment whose criteria
   *   (the items with their dispositions and the participant conditions) differ from the current
   *   closure is changed; a blocked judgment is blocked with the first of its reasons; an unknown
   *   judgment is unavailable.
   */
  function finishCheck(
    execution: Execution,
    candidate: FinishCandidate,
    items: readonly FinishObligation[],
    listed: readonly FinishObligation[],
  ): FinishCheck {
    const blocked = (reason: Blocked['reason'], source: DurableEvidence): FinishCheck => ({
      kind: 'blocked',
      value: { kind: 'blocked', reason, source: copy(source) },
    })
    const route = currentRoute(execution.finishing)
    if (route === undefined)
      throw new Error('memory Journal defect: the current candidate has no current route')
    if (route.kind === 'author') {
      // A cancelled candidate on an author route did not migrate: it does not end under the cancel
      // without the trusted judgment of a cancellation route.
      if (candidate.conclusion.kind === 'cancelled') return blocked('passages', route.record)
      const pending = firstPending(items)
      const pendingCategory = pending === undefined ? undefined : categoryOf(pending)
      const proofMissing = route.beforeTerminal === null
      if (
        pending !== undefined &&
        pendingCategory !== undefined &&
        (!proofMissing ||
          CATEGORY_ORDER.indexOf(pendingCategory) <= CATEGORY_ORDER.indexOf('passages'))
      )
        return blocked(
          pendingCategory,
          listed.find(item => item.kind === pending.kind && item.key === pending.key)?.source ??
            pending.source,
        )
      if (proofMissing) return blocked('passages', route.record)
      const unknown = firstUnknown(items)
      if (unknown !== undefined)
        return { kind: 'unavailable', diagnostic: `the obligation ${unknown.key} is unknown` }
      return { kind: 'clear' }
    }
    const judgment = currentJudgment(execution.finishing)
    if (judgment === undefined) return blocked('passages', route.record)
    if (
      criteriaOf(judgment.input.items, judgment.input.participants) !==
      criteriaOf(items, participantsOf(execution))
    )
      return { kind: 'changed' }
    const decision = judgment.decision
    if (decision.kind === 'unknown')
      return { kind: 'unavailable', diagnostic: `the judgment ${judgment.operation} is unknown` }
    if (decision.kind === 'blocked') {
      const ordered = [...decision.reasons].sort(
        (left, right) =>
          CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category),
      )
      const first = ordered[0]
      if (first === undefined)
        throw new Error('memory Journal defect: a blocked judgment without a reason')
      // On the cancellation route the source of the block is the judgment record; the source of
      // each responsibility is reachable through its CancellationBlock (rulings-gate-S23 17).
      return blocked(first.category, judgment.evidence)
    }
    if (candidate.candidate !== judgment.candidate) return { kind: 'changed' }
    return { kind: 'clear' }
  }

  /** The cancel control an authorization names, when it is saved and its intent is reached. */
  function effectiveCancel(
    execution: Execution,
    control: AgentOperationId,
  ): ControlRecord | undefined {
    return execution.controls.find(
      record =>
        record.operation === control &&
        record.command.kind === 'cancel' &&
        record.stages['intent-established']?.state === 'reached',
    )
  }

  function effectiveCancels(execution: Execution): readonly ControlRecord[] {
    return execution.controls.filter(
      record =>
        record.command.kind === 'cancel' &&
        record.stages['intent-established']?.state === 'reached',
    )
  }

  /** Whether the caller holds the settlement qualification `operation` on the execution. */
  function qualified(
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
    operation: SettlementQualification,
  ): boolean {
    return (
      options.qualification === undefined ||
      options.qualification({
        principal: input.principal,
        tenant: input.tenant,
        execution: input.execution,
        operation,
      })
    )
  }

  /**
   * The checks of a cancel authorization shared by prepareFinish, tryFinish and the candidate,
   * migration and judgment variants (SPEC "条件终结", "commitSettlement 的变体" 3): the control must
   * be saved with its intent reached (`denied` for `action` otherwise); the source must be the
   * source of that control (`invalid` otherwise). The `settle` qualification is checked first, before
   * the original operation is recognized: `settleRefusal` for prepareFinish and tryFinish, the
   * qualification of commitSettlement for the variants.
   */
  function cancelAuthorizationFailure(
    execution: Execution,
    authorization: Extract<FinishAuthorization, { kind: 'cancel' }>,
    action: string,
  ): Failure | undefined {
    const control = effectiveCancel(execution, authorization.control)
    if (control === undefined) return denied(action)
    if (!sameEvidence(control.stages.accepted.source, authorization.source))
      return invalid('authorization.source', 'not the source of the saved control')
    return undefined
  }

  /**
   * A cancel authorization needs the caller's current `settle` qualification. It is checked with the
   * tenant, before the original operation is recognized and before stale-advance or terminal (SPEC
   * "判定次序与失败映射" 1 and 2): `denied` for `settle`.
   */
  function settleRefusal(
    input: Access<P> &
      Readonly<{ execution: AgentExecutionId; authorization: FinishAuthorization }>,
  ): Failure | undefined {
    return input.authorization.kind === 'cancel' && !qualified(input, 'settle')
      ? denied('settle')
      : undefined
  }

  /** The control of the current cancellation route must be the control of the authorization (SPEC "判断输入、判据与记录" 1). */
  function routeControlFailure(
    route: FinishRoute | undefined,
    authorization: Extract<FinishAuthorization, { kind: 'cancel' }>,
  ): Failure | undefined {
    return route?.kind === 'cancellation' && route.control !== authorization.control
      ? invalid('authorization.control', 'not the control of the current route')
      : undefined
  }

  /** Whether the authorization kind fits the conclusion of the candidate: a cancel ends with cancelled only. */
  function kindMismatch(
    candidate: FinishCandidate | undefined,
    authorization: FinishAuthorization,
  ): boolean {
    return (
      candidate !== undefined &&
      (candidate.conclusion.kind === 'cancelled') !== (authorization.kind === 'cancel')
    )
  }

  /**
   * The terminal participant facts of the binding (SPEC "TerminalParticipantFacts"): standalone
   * keeps the mode basis; coordinated reports the one external participant with the condition the
   * test scripted, the same fact for the judgment and for the tryFinish that re-checks it.
   */
  function participantsOf(execution: Execution): CancellationJudgmentInput['participants'] {
    if (coordination !== 'coordinated')
      return { kind: 'standalone', basis: journalEvidence(`${execution.id}/standalone`, 0) }
    const association = journalEvidence(`${execution.id}/coordination`, 0)
    return {
      kind: 'coordinated',
      association,
      participants: [
        {
          owner: 'coordinator',
          protocol: PARTICIPANT_PROTOCOL,
          source: association,
          version: association,
          condition: copy(participantCondition),
          purpose: journalEvidence(`${execution.id}/coordination/tryFinish`, 0),
        },
      ],
    }
  }

  // ------------------------------------------------------------------------------------------
  // Message admission (SPEC "消息准入", "真实历史的提交点", "内部 H 的排除与退役")

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
      case 'prepare': {
        const request = change.request
        const reference = request.reference
        if (reference.execution !== execution.id)
          return fail(invalid('handoff', 'the request is not of this execution'))
        // Only a Ja moves the pointer: a P needs it clear (SPEC "消息准入").
        if (execution.checkpoint.currentHandoff !== null)
          return fail(invalid('checkpoint.currentHandoff', 'another H holds the pointer'))
        if (!sameValue(pointer, reference))
          return fail(invalid('checkpoint.currentHandoff', 'P points the checkpoint at its H'))
        if (request.predecessor !== input.expected)
          return fail(invalid('handoff', 'the predecessor of P is the expected revision'))
        if (handoffRecord(execution, reference) !== undefined)
          return fail(invalid('handoff', 'the H is already prepared'))
        // SPEC "消息准入": the same source position cannot take another H while the old one is
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
        return succeed((revision, evidence) => {
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
      case 'resolve': {
        const outcome = change.outcome
        const request = outcome.request
        if (request.kind !== 'execution')
          return fail(invalid('handoff', 'a Ja applies an internal request'))
        const record = handoffRecord(execution, request.reference)
        if (record === undefined || !sameValue(record.request, request))
          return fail(invalid('handoff', 'the outcome does not name the prepared request'))
        if (record.history.kind !== 'pending' || record.retirement !== null)
          return fail(invalid('handoff', 'the H already has its history disposition'))
        if (
          record.resolution !== null &&
          !sameValue(record.resolution, { kind: 'recorded', outcome })
        )
          return fail(invalid('handoff', 'the outcome differs from the recorded one'))
        if (!sameValue(execution.checkpoint.currentHandoff, request.reference))
          return fail(invalid('handoff', 'the H is not the one the pointer holds'))
        if (pointer !== null)
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
            return fail(
              invalid('caller', 'the transition commit does not match the outcome of the H'),
            )
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
      default: {
        const request = change.excluded.request
        if (request.kind !== 'execution')
          return fail(invalid('handoff', 'a retire applies to an internal request'))
        const record = handoffRecord(execution, request.reference)
        if (record === undefined || !sameValue(record.request, request))
          return fail(invalid('handoff', 'the exclusion does not name the prepared request'))
        if (record.history.kind !== 'pending' || record.retirement !== null)
          return fail(invalid('handoff', 'the H already has its history disposition'))
        if (record.resolution !== null && record.resolution.kind !== 'excluded')
          return fail(invalid('handoff', 'a recorded H is not retired'))
        if (!sameValue(execution.checkpoint.currentHandoff, request.reference))
          return fail(invalid('handoff', 'the H is not the one the pointer holds'))
        if (pointer !== null)
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
    }
  }

  /** The custody projection of one H, rebuilt from the attempts and their operation records. */
  function custodyOf(
    execution: Execution,
    handoff: HandoffReference,
  ): Exclude<ExecutionHandoff['custody'], null> | null {
    const attempts = [...execution.custodyAttempts.entries()].filter(([, attempt]) =>
      sameValue(attempt.handoff, handoff),
    )
    const root = attempts.find(([, attempt]) => attempt.custody === null)
    if (root === undefined) return null
    const stateOf = (operation: AgentOperationId): 'committed' | 'excluded' | undefined => {
      const at = operationKey(execution.tenant, execution.id, operation)
      const record = at === undefined ? undefined : operations.get(at)
      return record?.kind === 'committed' || record?.kind === 'excluded' ? record.kind : undefined
    }
    const chain: Exclude<ExecutionHandoff['custody'], null>['chain'][number][] = []
    let committed: AgentOperationId | null = null
    let current: AgentOperationId | null = root[0]
    let predecessor: AgentOperationId | null = null
    while (current !== null) {
      const state = stateOf(current)
      if (state === undefined) break
      chain.push({ operation: current, predecessor, state })
      if (state === 'committed') committed = current
      const next = attempts.find(
        ([, attempt]) => attempt.custody?.predecessor.operation === current,
      )
      predecessor = current
      current = next?.[0] ?? null
    }
    return { root: root[0], chain, committed }
  }

  // ------------------------------------------------------------------------------------------
  // The port

  // ------------------------------------------------------------------------------------------
  // The settlement variants (SPEC "commitSettlement 的变体")

  type CandidateVariant = Extract<
    SettlementRequest<P>,
    { kind: 'establish-cancellation' | 'migrate-cancellation' | 'judge-cancellation' }
  >
  type CustodyVariant = Exclude<SettlementRequest<P>, CandidateVariant>

  /** The candidate, migration and judgment variants, in the judgment order of SPEC "commitSettlement 的变体". */
  function settleCandidate(
    execution: Execution,
    input: CandidateVariant,
  ): Attempt<SettlementResult> {
    const installed = options.cancellation
    if (installed === undefined)
      return answer(fail(damaged('no cancellation policy is installed on this binding')))
    if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
    const refusal = cancelAuthorizationFailure(execution, input.authorization, 'commitSettlement')
    if (refusal !== undefined) return answer(fail(refusal))
    // SPEC "commitSettlement 的变体" step 4: an installation that is not the current one is no
    // longer applicable, then the expected, then the current candidate; shape errors come after.
    if (!sameEvidence(installed.installation.record, input.installation))
      return answer(fail({ kind: 'changed' }))
    if (input.expected !== revisionOf(execution.revision)) return answer(fail({ kind: 'changed' }))
    const finishing = execution.finishing
    const control = effectiveCancel(execution, input.authorization.control)
    if (control === undefined) return answer(fail(denied('commitSettlement')))
    const current = currentCandidate(finishing)
    const route = currentRoute(finishing)
    const revision = execution.revision + 1
    const evidence = nextEvidence(execution, input.kind, revision)
    const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
    const cancellationRoute = (
      candidate: AgentOperationId,
      origin: Extract<FinishRoute, { kind: 'cancellation' }>['origin'],
    ): Extract<FinishRoute, { kind: 'cancellation' }> => ({
      kind: 'cancellation',
      record: nextEvidence(execution, 'route', revision),
      candidate,
      control: control.operation,
      policy: installed.installation.policy,
      installation: installed.installation.record,
      origin,
    })
    switch (input.kind) {
      case 'establish-cancellation': {
        // A predecessor that was never a candidate of this execution names the wrong candidate;
        // one that is no longer current is a candidate that changed (SPEC "commitSettlement 的变体" 4).
        if (
          input.predecessor !== null &&
          !finishing.candidates.some(item => item.candidate === input.predecessor)
        )
          return answer(fail(invalid('predecessor', 'not a candidate of this execution')))
        if ((current?.candidate ?? null) !== input.predecessor)
          return answer(fail({ kind: 'changed' }))
        // A cancelled candidate is never superseded by a new one: on an author route it migrates,
        // on a cancellation route it is judged (SPEC "commitSettlement 的变体", establish row).
        if (current !== undefined && current.conclusion.kind === 'cancelled')
          return answer(fail(invalid('predecessor', 'the current candidate is already cancelled')))
        const intent = control.stages['intent-established']
        const candidate: FinishCandidate = {
          candidate: input.operation,
          origin: copy(control.stages.accepted.source),
          conclusion: { kind: 'cancelled', cause: copy(control.command.reason) },
          failure: null,
          inputWatermark: watermarkOf(execution),
          checkpoint: copy(execution.checkpoint),
          conditions: copy(intent?.source ?? control.stages.accepted.source),
        }
        const newRoute = cancellationRoute(candidate.candidate, {
          kind: 'native',
          operation: input.operation,
        })
        const supersession =
          current !== undefined && route !== undefined
            ? {
                from: current.candidate,
                to: candidate.candidate,
                control: control.operation,
                revision: revisionOf(revision),
                route: copy(route),
              }
            : null
        const value: SettlementResult = {
          kind: 'establish-cancellation',
          receipt,
          candidate,
          route: newRoute,
          supersession,
        }
        return {
          kind: 'write',
          value,
          receipt,
          apply: () => {
            if (supersession !== null) finishing.supersessions.push(supersession)
            finishing.candidates.push(candidate)
            finishing.routes.push(newRoute)
            finishing.current = candidate.candidate
            finishing.currentRoute = newRoute.record.record
            finishing.currentJudgment = null
            finishing.obligations = null
            execution.state = { kind: 'settling' }
            execution.revision = revision
          },
        }
      }
      case 'migrate-cancellation': {
        const candidate = finishing.candidates.find(item => item.candidate === input.candidate)
        if (candidate === undefined)
          return answer(fail(invalid('candidate', 'not a candidate of this execution')))
        if (candidate.candidate !== finishing.current) return answer(fail({ kind: 'changed' }))
        if (candidate.conclusion.kind !== 'cancelled')
          return answer(fail(invalid('candidate', 'only a cancelled candidate migrates')))
        const originalRoute = routeByRecord(finishing, input.originalRoute)
        if (originalRoute === undefined)
          return answer(fail(invalid('originalRoute', 'not a route of this execution')))
        if (originalRoute.kind !== 'author')
          return answer(fail(invalid('originalRoute', 'not an author route')))
        if (route === undefined || route.record.record !== originalRoute.record.record)
          return answer(fail({ kind: 'changed' }))
        const newRoute = cancellationRoute(candidate.candidate, {
          kind: 'migration',
          operation: input.operation,
        })
        const built = obligationsOf(execution, candidate, input.operation)
        const progress: LegacyF2Entry[] = execution.checkpoint.passages
          .filter(passage => passage.position === 'before_terminal')
          .map(passage => ({
            kind: 'recorded',
            passage: copy(passage),
            version: journalEvidence(`${execution.id}/passage/${passage.id}`, execution.revision),
          }))
        const migration: MigrationRecord = {
          operation: input.operation,
          receipt,
          evidence,
          candidate: candidate.candidate,
          control: control.operation,
          from: {
            route: copy(originalRoute),
            policy: originalRoute.policy,
            definition: copy(execution.checkpoint.definition),
            schema: copy(execution.checkpoint.schema),
            beforeTerminal: originalRoute.beforeTerminal,
            extensions: [],
          },
          progress,
          to: {
            policy: installed.installation.policy,
            implementation: installed.installation.implementation,
            inputSchema: installed.installation.inputSchema,
            installation: installed.installation.record,
            admission: installed.installation.admission,
          },
          qualification: {
            attribution: copy(input.authorization.source),
            target: execution.id,
            issuer: installed.installation.decision,
            check: evidence,
          },
          fence: evidence,
          coverage: built.coverage,
          obligations: built.items,
          supersession: { from: originalRoute.record, to: newRoute.record, candidate: null },
          priorExcluded: copy(input.priorExcluded),
        }
        const value: SettlementResult = {
          kind: 'migrate-cancellation',
          receipt,
          migration,
          route: newRoute,
        }
        return {
          kind: 'write',
          value,
          receipt,
          apply: () => {
            finishing.migrations.push(migration)
            finishing.routes.push(newRoute)
            finishing.currentRoute = newRoute.record.record
            finishing.currentJudgment = null
            execution.revision = revision
          },
        }
      }
      case 'judge-cancellation': {
        const candidate = finishing.candidates.find(item => item.candidate === input.candidate)
        if (candidate === undefined)
          return answer(fail(invalid('candidate', 'not a candidate of this execution')))
        if (candidate.candidate !== finishing.current) return answer(fail({ kind: 'changed' }))
        const named = routeByRecord(finishing, input.route)
        if (named === undefined)
          return answer(fail(invalid('route', 'not a route of this execution')))
        if (named.kind !== 'cancellation')
          return answer(fail(invalid('route', 'not a cancellation route')))
        if (route === undefined || route.record.record !== named.record.record)
          return answer(fail({ kind: 'changed' }))
        const forgedControl = routeControlFailure(named, input.authorization)
        if (forgedControl !== undefined) return answer(fail(forgedControl))
        const built = obligationsOf(execution, candidate, input.operation)
        const judgmentInput: CancellationJudgmentInput = {
          tenant: execution.tenant,
          execution: execution.id,
          candidate: copy(candidate),
          control: copy(control),
          route: copy(named),
          readRevision: revisionOf(execution.revision),
          coverage: built.coverage,
          items: built.items,
          participants: participantsOf(execution),
        }
        let decision: CancellationJudgmentRecord['decision']
        try {
          decision = copy(installed.policy.judge(copy(judgmentInput)))
        } catch (error) {
          return answer(fail(damaged(`the cancellation policy threw: ${String(error)}`)))
        }
        if (!['allowed', 'blocked', 'unknown'].includes(decision.kind))
          return answer(fail(damaged('the cancellation policy answered an unknown decision')))
        const judgment: CancellationJudgmentRecord = {
          operation: input.operation,
          receipt,
          evidence,
          policy: installed.installation.policy,
          implementation: installed.installation.implementation,
          inputSchema: installed.installation.inputSchema,
          installation: installed.installation.record,
          qualification: copy(input.authorization.source),
          candidate: candidate.candidate,
          control: control.operation,
          route: named.record,
          input: judgmentInput,
          decision,
          revision: revisionOf(revision),
          supersedes: finishing.currentJudgment,
        }
        const value: SettlementResult = { kind: 'judge-cancellation', receipt, judgment }
        return {
          kind: 'write',
          value,
          receipt,
          apply: () => {
            finishing.judgments.push(judgment)
            finishing.currentJudgment = judgment.operation
            execution.revision = revision
          },
        }
      }
      default: {
        const _exhaustive: never = input
        return _exhaustive
      }
    }
  }

  /** The target of a custody variant that this execution does not hold, checked before the source is read. */
  function custodyTargetFailure(
    execution: Execution,
    input: CustodyVariant,
    knownCandidate: (candidate: AgentOperationId) => boolean,
  ): Failure | undefined {
    const finishing = execution.finishing
    switch (input.kind) {
      case 'record-card-reconciliation': {
        const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
        const round =
          passage?.progress.kind === 'asked'
            ? passage.progress.rounds.find(item => item.round === input.round)
            : undefined
        if (passage === undefined || round === undefined)
          return invalid('round', 'not a card round of this execution')
        if (!knownCandidate(input.candidate))
          return invalid('candidate', 'not a candidate of this execution')
        if (routeByRecord(finishing, input.route) === undefined)
          return invalid('route', 'not a route of this execution')
        return undefined
      }
      case 'record-legacy-return': {
        const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
        if (passage === undefined || passage.position !== 'before_terminal')
          return invalid('passage', 'not a before-terminal passage of this execution')
        if (!sameEvidence(passage.input, input.request))
          return invalid('request', 'not the input record of the passage')
        if (!knownCandidate(input.candidate))
          return invalid('candidate', 'not a candidate of this execution')
        if (routeByRecord(finishing, input.route) === undefined)
          return invalid('route', 'not a route of this execution')
        return undefined
      }
      case 'record-tool-association': {
        const effect = execution.effects.find(item => item.action === input.intent.action)
        const established = finishing.effectOperations.get(input.intent.action)
        if (
          effect === undefined ||
          effect.pending.kind !== 'tool' ||
          established !== input.intent.intent ||
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
   * The three custody variants: the reconcile qualification, no expected, also after ended. The
   * target of this execution is checked before the source is read (SPEC "commitSettlement 的变体"
   * table): a target the Journal does not hold is invalid, a source the host does not answer is
   * unavailable, a host record of another tenant is denied and one of another execution invalid
   * before the record is compared, a source that contradicts a known reference is conflict.
   */
  function settleCustody(execution: Execution, input: CustodyVariant): Attempt<SettlementResult> {
    const finishing = execution.finishing
    const sourceEvidence =
      input.kind === 'record-card-reconciliation' ? input.original : input.source
    const knownCandidate = (candidate: AgentOperationId) =>
      finishing.candidates.some(item => item.candidate === candidate)
    const targetFailure = custodyTargetFailure(execution, input, knownCandidate)
    if (targetFailure !== undefined) return answer(fail(targetFailure))
    const record = options.hostRecords?.get(sourceEvidence.record)
    if (record === undefined)
      return answer(fail(damaged(`the host answers no record for ${sourceEvidence.record}`)))
    // A tool-return record carries no tenant: its tenant is the one of its returned reference. A
    // foreign one is denied here too, so no variant tells what kind of record a foreign source is.
    if (
      record.kind === 'tool-return' &&
      foreignReference(record.returned.reference, execution.tenant)
    )
      return answer(fail(denied('commitSettlement')))
    // A record of another tenant is denied before anything of it is compared or disclosed; a record
    // of another execution of this tenant is not a source of this execution.
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
    const evidence = nextEvidence(execution, input.kind, revision)
    const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
    switch (input.kind) {
      case 'record-card-reconciliation': {
        if (
          record.kind !== 'card-reconciliation' ||
          record.passage !== input.passage ||
          record.round !== input.round
        )
          return answer(fail(invalid('original', 'not a reconciliation of this round')))
        const passage = execution.checkpoint.passages.find(item => item.id === input.passage)
        const round =
          passage?.progress.kind === 'asked'
            ? passage.progress.rounds.find(item => item.round === input.round)
            : undefined
        if (passage === undefined || round === undefined)
          throw new Error('memory Journal defect: the card round was checked before the source')
        const custodian: ConsumerRef = {
          owner: 'cards',
          work: execution.id,
          position: passage.id,
          purpose: 'card-custody',
        }
        const lookup: RecoveryContinuation = {
          kind: 'card-lookup',
          request: { kind: 'parameters', value: { passage: passage.id, round: round.round } },
          owner: 'cards',
          custodian: null,
          purpose: 'reconcile',
        }
        const known = record.result
        const obligation: Extract<FinishObligation, { kind: 'card-round' }> = {
          kind: 'card-round',
          key: `${passage.id}/${round.round}`,
          source: sourceEvidence,
          version: evidence,
          position: null,
          disposition:
            known.kind === 'known'
              ? {
                  kind: 'held',
                  custodian,
                  acceptance: sourceEvidence,
                  retained: sourceEvidence,
                  continuation: lookup,
                }
              : {
                  kind: 'unknown',
                  question: {
                    owner: 'cards',
                    key: `${passage.id}/${round.round}`,
                    position: sourceEvidence,
                    reason: known.reason,
                  },
                  required: lookup,
                },
          passage: passage.id,
          round: copy(round),
          present: known.kind === 'known' ? copy(known.present) : null,
          lookups: known.kind === 'known' ? [...known.lookups] : [],
          invalidate: known.kind === 'known' ? copy(known.invalidate) : null,
        }
        const reconciliation: CardReconciliationRecord = {
          operation: input.operation,
          receipt,
          passage: input.passage,
          round: input.round,
          candidate: input.candidate,
          route: copy(input.route),
          original: copy(input.original),
          obligation,
          revision: revisionOf(revision),
        }
        const value: SettlementResult = {
          kind: 'record-card-reconciliation',
          receipt,
          reconciliation,
        }
        return {
          kind: 'write',
          value,
          receipt,
          apply: () => {
            finishing.cardReconciliations.push(reconciliation)
            execution.revision = revision
          },
        }
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
        const value: SettlementResult = { kind: 'record-legacy-return', receipt, legacyReturn }
        return {
          kind: 'write',
          value,
          receipt,
          apply: () => {
            finishing.legacyReturns.push(legacyReturn)
            execution.revision = revision
          },
        }
      }
      case 'record-tool-association': {
        if (record.kind !== 'tool-return')
          return answer(fail(invalid('source', 'not the return of this intent')))
        // A foreign return was denied before the switch, before the intent and the request are
        // compared, so the answer does not tell whether it is the return of the requested intent.
        const reference = resolveToolInvocationRef(record.returned.reference, execution.tenant)
        if ('failure' in reference)
          return answer(fail(invalid('source', 'the returned reference is malformed')))
        if (!sameValue(record.intent, input.intent) || !sameEvidence(record.request, input.request))
          return answer(fail(invalid('source', 'not the return of this intent')))
        const effect = execution.effects.find(item => item.action === input.intent.action)
        if (effect === undefined)
          throw new Error('memory Journal defect: the Tool intent was checked before the source')
        // A known reference of the same intent is not merged with another call or admission
        // (SPEC "commitSettlement 的变体", the Tool paragraph): conflict, the association stays.
        for (const existing of finishing.toolAssociations) {
          if (!sameValue(existing.intent, input.intent)) continue
          if (existing.association.kind === 'no-proven-reference') continue
          const known = resolveToolInvocationRef(existing.association.reference, execution.tenant)
          if (
            'ok' in known &&
            (known.ok.call !== reference.ok.call || known.ok.admission !== reference.ok.admission)
          )
            return answer(fail(conflict(input.operation)))
        }
        const custodian: ConsumerRef = {
          owner: 'host',
          work: execution.id,
          position: input.intent.action,
          purpose: 'call-custody',
        }
        const retain: RecoveryContinuation = {
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
        const obligation: Extract<FinishObligation, { kind: 'call' }> = {
          kind: 'call',
          key: input.intent.action,
          source: effect.pending.fixed,
          version: evidence,
          position: effect.pending.position,
          // commit-unknown keeps the admission undecided: unknown, not held (SPEC:1328, 1334).
          disposition:
            record.returned.kind === 'accepted'
              ? {
                  kind: 'held',
                  custodian,
                  acceptance: copy(record.received),
                  retained: copy(record.custody),
                  continuation: retain,
                }
              : {
                  kind: 'unknown',
                  question: {
                    owner: 'host',
                    key: input.intent.action,
                    position: copy(input.source),
                    reason: 'original-operation-unknown',
                  },
                  required: retain,
                },
          action: input.intent.action,
          intent: input.intent.intent,
          pending: copy(effect.pending),
          started: copy(record.received),
          outcome: null,
          interruptions: [],
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
        const value: SettlementResult = { kind: 'record-tool-association', receipt, association }
        return {
          kind: 'write',
          value,
          receipt,
          apply: () => {
            finishing.toolAssociations.push(association)
            execution.revision = revision
          },
        }
      }
      default: {
        const _exhaustive: never = input
        return _exhaustive
      }
    }
  }

  const port: AgentJournal<P> = {
    capabilities: Object.freeze({ coordination, participants }),

    open(input) {
      const key = semanticKey('open', input)
      const { original: acceptance, runtime } = input
      const entry = acceptance.entry
      const initial = entry.kind === 'invoke' ? entry.initial : entry.value
      const prepare = (): Attempt<{ receipt: CommandReceipt; authority: Authority }> => {
        const existing = executions.get(executionKey(input.tenant, input.execution))
        if (existing !== undefined && !tenantEquals(existing.tenant, input.tenant)) {
          return answer(fail(denied('open')))
        }
        const original = recognized<{ receipt: CommandReceipt; authority: Authority }>(input, key)
        if (original !== undefined) return answer(original)
        // Another operation already opened this execution identity: same identity, other input.
        if (existing !== undefined) return answer(fail(conflict(input.operation)))
        // The two parts of the acceptance must agree with each other and with this operation
        // (SPEC "输入内容与水位线"): the first open uses the fixed adoption of the invoke origin.
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
        // The co-check of the grant and the input source, in the same write as the acceptance.
        if (!grantHolds({ ...input, grant: runtime.grant })) return answer(fail(denied('open')))
        if (!sourceHolds({ ...input, source: initial.source })) return answer(fail(denied('open')))
        const refused = coordinated<{ receipt: CommandReceipt; authority: Authority }>('open', () =>
          answer(fail(denied('open'))),
        )
        if (refused !== undefined) return refused
        const execution: Execution = {
          id: input.execution,
          tenant: input.tenant,
          revision: 1,
          state: { kind: 'advancing' },
          checkpoint: copy(entry.checkpoint),
          attachments: [],
          inputs: [copy(initial)],
          inputRevisions: new Map([[initial.id, 1]]),
          batches: new Map(),
          watermarks: new Map(),
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
          admissionThroughs: new Map(),
          entries: [],
          handoffs: [],
          custodyAttempts: new Map(),
          finishing: emptyFinishing(),
          serial: 0,
          waiters: new Set(),
        }
        const evidence = nextEvidence(execution, 'open', 1)
        const authority: Authority = {
          execution: input.execution,
          executionAttachment: attachmentIdOf(input.execution, 1),
          instance: runtime.instance,
          generation: '1',
          source: evidence,
        }
        // The external H is published by this acceptance (SPEC "消息准入": the real history of an
        // external input is the original open or submit).
        execution.handoffs.push({
          handoff: copy(acceptance.handoff),
          request: copy(acceptance.outcome.request),
          prepared: null,
          resolution: { kind: 'recorded', outcome: copy(acceptance.outcome) },
          history: { kind: 'committed', operation: input.operation, revision: revisionOf(1) },
          retirement: null,
        })
        execution.attachments.push({
          authority,
          status: 'active',
          handoff: null,
          handoffRevision: 0,
        })
        const receipt = receiptOf(execution, input.operation, 1, evidence, 'applied')
        // open appends no event: the first event comes from a later commit (SPEC per-operation table).
        return {
          kind: 'write',
          value: { receipt, authority },
          receipt,
          apply: () => {
            executions.set(executionKey(input.tenant, input.execution), execution)
            receiving.remember(execution, runtime.instance)
          },
        }
      }
      return write('open', input, key, prepare, () =>
        standaloneRefusal(runtime.grant, initial.source),
      )
    },

    attach(input) {
      const key = semanticKey('attach', input)
      const prepare = (): Attempt<{ receipt: CommandReceipt; authority: Authority }> => {
        const found = owned(input, 'attach')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<{ receipt: CommandReceipt; authority: Authority }>(input, key)
        if (original !== undefined) return answer(original)
        // An ended execution answers terminal before the coordinator is asked (SPEC per-operation table).
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (!grantHolds(input)) return answer(fail(denied('attach')))
        const refused = coordinated<{ receipt: CommandReceipt; authority: Authority }>(
          'attach',
          () => answer(fail(denied('attach'))),
        )
        if (refused !== undefined) return refused
        const old = activeAttachment(execution)
        if (old !== undefined && input.takeover === null) {
          return answer(fail({ kind: 'changed' }))
        }
        if (old === undefined && execution.state.kind !== 'suspended') {
          return answer(fail({ kind: 'changed' }))
        }
        const revision = execution.revision + 1
        const ordinal = execution.attachments.length + 1
        const evidence = nextEvidence(execution, 'attach', revision)
        const authority: Authority = {
          execution: execution.id,
          executionAttachment: attachmentIdOf(execution.id, ordinal),
          instance: input.instance,
          generation: String(ordinal),
          source: evidence,
        }
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        return {
          kind: 'write',
          value: { receipt, authority },
          receipt,
          apply: () => {
            fence(execution)
            if (old !== undefined) old.status = 'superseded'
            execution.attachments.push({
              authority,
              status: 'active',
              handoff: null,
              handoffRevision: 0,
            })
            execution.state = { kind: 'reconciling' }
            execution.revision = revision
          },
        }
      }
      return write('attach', input, key, prepare, () => standaloneRefusal(input.grant))
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
        // A detached target only recognizes the existing handoff: the new operation is indexed at
        // the revision of that handoff and writes no new position (SPEC "原操作认回与恢复").
        if (target.handoff !== null) {
          return recognize(
            copy(target.handoff),
            recognition(execution, input.operation, target.handoffRevision, 'applied'),
          )
        }
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        const revision = execution.revision + 1
        const handoff = nextEvidence(execution, 'handoff', revision)
        const receipt = receiptOf(execution, input.operation, revision, handoff, 'applied')
        return {
          kind: 'write',
          value: handoff,
          receipt,
          apply: () => {
            target.status = 'detached'
            target.handoff = handoff
            target.handoffRevision = revision
            execution.state = { kind: 'suspended', handoff }
            execution.revision = revision
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
        // The Journal allocates `entry` and `ended` events itself: `entry` when it writes an entry
        // (SPEC "日志条目" 6), `ended` in tryFinish. A commit that carries either is invalid.
        const forged = input.events.find(body => {
          const kind = (body as AgentEventBody).kind
          return kind === 'entry' || kind === 'ended'
        })
        if (forged !== undefined) {
          return answer(
            fail(
              invalid(
                'events',
                `${(forged as AgentEventBody).kind} events are allocated by the Journal`,
              ),
            ),
          )
        }
        // SPEC "条件终结": only a settling commit fixes a candidate, and a settling commit needs one.
        if (input.finish !== null && input.state.kind !== 'settling') {
          return answer(fail(invalid('finish', 'only a settling commit carries a candidate')))
        }
        if (
          input.state.kind === 'settling' &&
          input.finish === null &&
          currentCandidate(execution.finishing) === undefined
        ) {
          return answer(fail(invalid('state', 'settling without a candidate')))
        }
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        // SPEC "判定次序与失败映射": stale-advance before terminal, terminal before changed.
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (input.expected !== revisionOf(execution.revision)) {
          return answer(fail({ kind: 'changed' }))
        }
        // An effective cancel takes precedence over an ordinary completion or failure (SPEC
        // "条件终结"): a candidate that is not cancelled is changed, nothing is written.
        if (
          input.finish !== null &&
          input.finish.conclusion.kind !== 'cancelled' &&
          effectiveCancels(execution).length > 0
        )
          return answer(fail({ kind: 'changed' }))
        // F1: a settling commit with the candidate content establishes the candidate under this
        // operation, unless the current candidate already has this content; other content
        // supersedes the current candidate (SPEC "条件终结" 1). F2: the first plain settling commit
        // after the candidate, with no before-terminal passage left open, is the proof of the
        // author route (SPEC "条件终结" 3).
        const finishing = execution.finishing
        const current = currentCandidate(finishing)
        const newCandidate =
          input.finish !== null &&
          (current === undefined ||
            !sameContent(current, { ...input.finish, checkpoint: input.checkpoint }))
        const route = currentRoute(finishing)
        const proves =
          input.state.kind === 'settling' &&
          input.finish === null &&
          route?.kind === 'author' &&
          route.beforeTerminal === null &&
          !beforeTerminalPending(input.checkpoint)
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
        let admission: Readonly<{ sequence: number; fact: ModelReplyAdmission }> | null = null
        if (input.replyAdmission !== null) {
          const fact = input.replyAdmission
          const known = execution.admissions.find(
            item => item.fact.call === fact.call && item.fact.resultVersion === fact.resultVersion,
          )
          if (known !== undefined && known.fact.decision !== fact.decision) {
            return answer(fail(conflict(input.operation)))
          }
          if (known === undefined) {
            admission = { sequence: execution.admissions.length + 1, fact: copy(fact) }
          }
        }
        const handoffChange = handoffWrite(execution, input)
        if ('failure' in handoffChange) return answer(handoffChange)
        if (input.caller.kind !== 'none') {
          const refused = participation<CommandReceipt>(input.caller.kind, () =>
            answer(fail({ kind: 'changed' })),
          )
          if (refused !== undefined) return refused
        }
        // A commit that establishes no new fact does not advance the revision and writes no event:
        // its receipt names the current revision (SPEC "执行修订").
        const unchanged =
          semanticKey('checkpoint', execution.checkpoint) ===
            semanticKey('checkpoint', input.checkpoint) &&
          semanticKey('state', execution.state) === semanticKey('state', input.state) &&
          input.events.length === 0 &&
          !newEffect &&
          !newCandidate &&
          !proves &&
          admission === null &&
          input.caller.kind === 'none' &&
          input.handoff === null
        if (unchanged) {
          const receipt = receiptOf(
            execution,
            input.operation,
            execution.revision,
            nextEvidence(execution, 'commit', execution.revision),
            'applied',
          )
          return recognize(receipt, receipt)
        }
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'commit', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        const caller = input.caller
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            handoffChange.ok(revision, evidence)
            execution.checkpoint = copy(input.checkpoint)
            receiving.remember(execution, input.authority.instance)
            execution.state = copy(input.state)
            for (const effect of input.effects) {
              if (!execution.effects.some(existing => existing.action === effect.action)) {
                execution.effects.push(copy(effect))
                finishing.effectOperations.set(effect.action, input.operation)
              }
            }
            if (newCandidate && input.finish !== null) {
              const candidate: FinishCandidate = {
                candidate: input.operation,
                ...copy(input.finish),
                checkpoint: copy(input.checkpoint),
              }
              const authorRoute: FinishRoute = {
                kind: 'author',
                record: nextEvidence(execution, 'route', revision),
                candidate: input.operation,
                policy: copy(input.checkpoint.definition),
                plan: [],
                beforeTerminal: null,
              }
              if (current !== undefined && route !== undefined) {
                finishing.supersessions.push({
                  from: current.candidate,
                  to: candidate.candidate,
                  control: null,
                  revision: revisionOf(revision),
                  route: copy(route),
                })
              }
              finishing.candidates.push(candidate)
              finishing.routes.push(authorRoute)
              finishing.current = candidate.candidate
              finishing.currentRoute = authorRoute.record.record
              finishing.currentJudgment = null
              finishing.obligations = null
            }
            if (proves && route !== undefined && route.kind === 'author') {
              const index = finishing.routes.indexOf(route)
              finishing.routes[index] = { ...route, beforeTerminal: evidence }
            }
            if (admission !== null) execution.admissions.push(admission)
            if (caller.kind !== 'none') {
              jointFacts.push({
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
      const prepare = (): Attempt<CommandReceipt> => {
        const found = owned(input, 'submit')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        // SPEC per-operation table, input.submit: the original O is recognized first, then a new
        // input after ended is terminal, then a new operation may recognize an accepted input.
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
          const record = acceptedBy === undefined ? undefined : operations.get(acceptedBy)
          const acceptedValue = entry.kind === 'invoke' ? entry.initial : entry.value
          if (record?.kind !== 'committed' || known === undefined || known.id !== acceptedValue.id)
            return answer(
              fail({
                kind: 'unavailable',
                owner: JOURNAL_OWNER,
                diagnostic: 'the original acceptance of the recognized input is not on record',
              }),
            )
          // The same input identity with other content conflicts (SPEC "输入内容与水位线").
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
            throw new Error('memory Journal defect: an accepted input has no revision')
          const receipt = recognition(execution, input.operation, at, 'accepted')
          return recognize(receipt, receipt)
        }
        // A new input under an identity the execution already accepted is another entry for the
        // same InputId: it conflicts, it does not recognize (SPEC "输入内容与水位线").
        if (known !== undefined) return answer(fail(conflict(input.operation)))
        if (!sourceHolds({ ...input, source: input.value.source }))
          return answer(fail(denied('submit')))
        const refused = coordinated<CommandReceipt>('submit', () => answer(fail(denied('submit'))))
        if (refused !== undefined) return refused
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'submit', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'accepted')
        const acceptance = lineage.original
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            execution.inputs.push(copy(input.value))
            execution.inputRevisions.set(input.value.id, revision)
            execution.handoffs.push({
              handoff: copy(acceptance.handoff),
              request: copy(acceptance.outcome.request),
              prepared: null,
              resolution: { kind: 'recorded', outcome: copy(acceptance.outcome) },
              history: {
                kind: 'committed',
                operation: input.operation,
                revision: revisionOf(revision),
              },
              retirement: null,
            })
            execution.revision = revision
          },
        }
      }
      return write('submit', input, key, prepare, () => standaloneRefusal(input.value.source))
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
        const target = controlTarget(input.command, execution.checkpoint.calls, execution.tenant)
        if ('failure' in target) return answer(target)
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'control', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'accepted')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            execution.controls.push({
              operation: input.operation,
              ...copy(target.ok),
              stages: { accepted: { state: 'reached', source: evidence } },
            })
            execution.revision = revision
            // The accepted fact, its control event and the operation result hold at once (SPEC "六个阶段").
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
        // A `through` within the acknowledged prefix recognizes that prefix at the revision it was
        // established and never moves it back (SPEC "确认").
        if (through <= execution.acknowledged) {
          const receipt = recognition(
            execution,
            input.operation,
            execution.acknowledgedAt,
            'applied',
          )
          return recognize(receipt, receipt)
        }
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'acknowledge', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            execution.acknowledged = through
            execution.acknowledgedAt = revision
            execution.revision = revision
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
        const rejected = answer<CommandReceipt>(fail(conflict(input.operation)))
        const transfer = input.transfer
        if (
          transfer.kind !== 'none' &&
          (!sameResult(transfer.result, input.result) || transfer.consumption !== input.consumption)
        ) {
          return rejected
        }
        const known = execution.results.find(
          item => sameResult(item.result, input.result) && item.consumption === input.consumption,
        )
        if (
          known !== undefined &&
          semanticKey('result', known.result) !== semanticKey('result', input.result)
        ) {
          return rejected
        }
        // transfer custody or processed: the provider establishes the custody or completion evidence
        // in its own commit boundary; the participant declaration only binds `commit.caller`.
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
          const at = execution.resultRevisions.get(resultKey)
          if (at === undefined)
            throw new Error('memory Journal defect: a known responsibility has no revision')
          const receipt = recognition(execution, input.operation, at, 'applied')
          return recognize(receipt, receipt)
        }
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'result', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            const index = execution.results.indexOf(known ?? responsibility)
            if (index === -1) execution.results.push(responsibility)
            else execution.results[index] = responsibility
            execution.resultRevisions.set(resultKey, revision)
            execution.revision = revision
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
      // SPEC "Recording operation 与阶段事实" step 2: a foreign attachment is denied before the
      // operation and the target are read, like a write on another tenant's execution.
      if (attachment?.kind === 'foreign') return fail(denied(method))
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
      // A local attachment takes part in the key by its canonical parts, a malformed one by its bytes.
      const key = semanticKey(
        method,
        attachment === undefined
          ? input
          : {
              ...input,
              toolOperation: attachment.kind === 'local' ? attachment.parts : attachment.reference,
            },
      )
      return run(method, entered.ok.fault, input, key, () => {
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
          // The same stage fact without a new reference is recognized by the new operation at the
          // revision of the fact; it is not recorded or projected twice (SPEC "六个阶段").
          const first = execution.stageReceipts.get(stageKey)
          if (first !== undefined) {
            const receipt = recognition(
              execution,
              input.operation,
              Number(first.revision),
              'applied',
            )
            return recognize(receipt, receipt)
          }
        }
        const ended = execution.state.kind === 'ended'
        // After a lawful ended only the three late duty stages may still be saved; a new intent or
        // revocation is a pre-terminal effect and answers terminal (SPEC "六个阶段", Q1b). Evidence
        // that contradicts a stage already reached is not a new intent: it takes the persistent
        // rejection below (SPEC "判定次序与失败映射" 8).
        if (
          ended &&
          !sameFact &&
          fact?.state !== 'reached' &&
          (input.stage === 'intent-established' || input.stage === 'qualification-revoked')
        ) {
          return answer(fail({ kind: 'terminal' }))
        }
        if (!sameFact && fact !== undefined && fact.state === 'reached') {
          // Evidence that contradicts an established stage: the persistent rejection saves an
          // audit, advances one revision, writes no event and fixes the conflict for query.
          const revision = execution.revision + 1
          const audit = nextEvidence(execution, 'rejected-control', revision)
          return {
            kind: 'reject',
            failure: conflict(input.operation),
            audit,
            revision,
            apply: () => {
              execution.revision = revision
            },
          }
        }
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'record-control', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            execution.controls[index] = {
              ...updated,
              stages: {
                ...record.stages,
                [input.stage]: { state: input.state, source: copy(input.source) },
              },
            }
            if (!sameFact) execution.stageReceipts.set(stageKey, receipt)
            execution.revision = revision
            // A late stage after ended is saved without an event; ended stays the last event.
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
      })
    },

    recordHandoff(input) {
      const key = semanticKey('recordHandoff', input)
      const request =
        input.original.kind === 'recorded' ? input.original.outcome.request : input.original.request
      const reference = request.reference
      /**
       * The attempt that this Rh is, once it is the root or the one direct successor of the chain
       * of its H (SPEC "准入结果保管"); otherwise the refusal.
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
        // SPEC "准入结果保管" 4: a permanently excluded attempt can never commit under this
        // operation; the fence answers before any new write.
        const at = operationKey(input.tenant, input.execution, input.operation)
        const fixed = at === undefined ? undefined : operations.get(at)
        if (fixed?.kind === 'excluded')
          return answer(fail(invalid('operation', 'operation-permanently-excluded')))
        const checked = validated(execution)
        if ('failure' in checked) return answer(checked)
        const record = handoffRecord(execution, reference)
        if (record === undefined) throw new Error('recordHandoff: the validated record is missing')
        // The attempt reaches the write step: it is part of the chain whether it commits or is
        // dropped, because a dropped attempt is permanently excluded under its operation.
        execution.custodyAttempts.set(input.operation, checked.ok)
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'record-handoff', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            if (record.resolution === null) record.resolution = copy(input.original)
            // An unpublished prepared message is retained after the end; Rh never publishes.
            if (execution.state.kind === 'ended' && record.history.kind === 'pending')
              record.history = { kind: 'retained', disposition: execution.state.disposition }
            execution.revision = revision
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
      return write(
        'prepareFinish',
        input,
        key,
        () => {
          const found = owned(input, 'prepareFinish')
          if ('failure' in found) return answer(found)
          const execution = found.ok
          const original = recognized<
            Readonly<{ receipt: CommandReceipt; obligations: DurableEvidence }>
          >(input, key)
          if (original !== undefined) return answer(original)
          const authorization = input.authorization
          const finishing = execution.finishing
          const named = finishing.candidates.find(item => item.candidate === input.candidate)
          // A cancel without settle was denied before the recognition (`settleRefusal`). Then the
          // judgment order of rulings-gate-S23 section 3: stale-advance, terminal, the cancel
          // checks (denied, invalid), the kind of the authorization against the named candidate
          // (denied; skipped when it names none), an advancement under an effective cancel
          // (changed), not settling (changed), expected (changed), an unknown candidate (invalid).
          if (authorization.kind === 'advancement' && !holds(execution, authorization.authority))
            return answer(fail({ kind: 'stale-advance' }))
          if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
          if (authorization.kind === 'cancel') {
            const refusal = cancelAuthorizationFailure(execution, authorization, 'prepareFinish')
            if (refusal !== undefined) return answer(fail(refusal))
          }
          if (kindMismatch(named, authorization)) return answer(fail(denied('prepareFinish')))
          if (authorization.kind === 'advancement' && effectiveCancels(execution).length > 0)
            return answer(fail({ kind: 'changed' }))
          if (execution.state.kind !== 'settling') return answer(fail({ kind: 'changed' }))
          if (input.expected !== revisionOf(execution.revision))
            return answer(fail({ kind: 'changed' }))
          const candidate = named
          if (candidate === undefined)
            return answer(fail(invalid('candidate', 'not a candidate of this execution')))
          if (candidate.candidate !== finishing.current) return answer(fail({ kind: 'changed' }))
          const revision = execution.revision + 1
          const evidence = nextEvidence(execution, 'obligations', revision)
          const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
          const built = obligationsOf(execution, candidate, input.operation)
          const list: FinishObligations = {
            operation: input.operation,
            revision: revisionOf(revision),
            evidence,
            candidate: candidate.candidate,
            conclusion: candidate.conclusion,
            failure: candidate.failure,
            inputWatermark: candidate.inputWatermark,
            checkpoint: journalEvidence(
              `${execution.id}/candidate/${candidate.candidate}/checkpoint`,
              revision,
            ),
            conditions: candidate.conditions,
            items: built.items,
            coverage: built.coverage,
          }
          return {
            kind: 'write',
            value: { receipt, obligations: evidence },
            receipt,
            apply: () => {
              finishing.issued.set(evidence.record, copy(list))
              finishing.obligations = evidence.record
              execution.revision = revision
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
          const finishing = execution.finishing
          const candidate = currentCandidate(finishing)
          // A cancel without settle was denied before the recognition (`settleRefusal`). Then the
          // judgment order of rulings-gate-S23 section 3: stale-advance, terminal, the cancel
          // checks (denied, invalid), the kind of the authorization against the candidate (denied),
          // an advancement under an effective cancel (changed), not settling (changed), expected
          // (changed), the list (invalid), the intent and the projection (changed), then the
          // responsibilities of the route.
          if (authorization.kind === 'advancement' && !holds(execution, authorization.authority))
            return answer(fail({ kind: 'stale-advance' }))
          if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
          if (authorization.kind === 'cancel') {
            const refusal =
              cancelAuthorizationFailure(execution, authorization, 'tryFinish') ??
              routeControlFailure(currentRoute(finishing), authorization)
            if (refusal !== undefined) return answer(fail(refusal))
          }
          if (kindMismatch(candidate, authorization)) return answer(fail(denied('tryFinish')))
          if (authorization.kind === 'advancement' && effectiveCancels(execution).length > 0)
            return changed
          if (execution.state.kind !== 'settling') return changed
          if (input.expected !== revisionOf(execution.revision)) return changed
          const intent = intentOf(finishing)
          if (candidate === undefined || intent === undefined) return changed
          // The list must be issued, real and of this candidate (SPEC "条件终结" result table).
          const given = input.intent.obligations
          if (given === null)
            return answer(fail(invalid('intent.obligations', 'the obligations are not issued')))
          const list = finishing.issued.get(given.record)
          if (list === undefined || !sameEvidence(list.evidence, given))
            return answer(fail(invalid('intent.obligations', 'not a list this Journal issued')))
          if (list.candidate !== candidate.candidate)
            return answer(fail(invalid('intent.obligations', 'the list of another candidate')))
          // The intent is compared with the projection for equality only (SPEC "条件终结" 4).
          if (semanticKey('finish-intent', intent) !== semanticKey('finish-intent', input.intent))
            return changed
          // The list is usable while the responsibility projection is unchanged (SPEC "终结责任清单");
          // the current closure, rebuilt with the same function, carries the dispositions.
          const current = obligationsOf(execution, candidate, input.operation).items
          if (projectionOf(current) !== projectionOf(list.items)) return changed
          const boundary = execution.watermarks.get(candidate.inputWatermark.record)
          if (boundary === undefined || boundary.to < execution.inputs.length) return changed
          const check = finishCheck(execution, candidate, current, list.items)
          if (check.kind === 'changed') return changed
          if (check.kind === 'blocked') return answer(succeed(check.value))
          if (check.kind === 'unavailable') return answer(fail(damaged(check.diagnostic)))
          // The coordinated binding checks the external participant in the same conditional commit;
          // its conflict is FinishResult.changed, not a failure (SPEC "条件终结").
          const refused = coordinated<FinishResult>('tryFinish', () => changed)
          if (refused !== undefined) return refused
          const revision = execution.revision + 1
          const evidence = nextEvidence(execution, 'finish', revision)
          const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
          const conclusion = copy(candidate.conclusion)
          const observations: TerminalObservation[] = execution.checkpoint.passages
            .filter(passage => passage.position === 'after_terminal')
            .map(passage => ({
              terminal: evidence,
              passage: passage.id,
              implementation: copy(passage.implementation),
              observed: null,
            }))
          return {
            kind: 'write',
            value: { kind: 'ended', receipt },
            receipt,
            apply: () => {
              execution.state = { kind: 'ended', conclusion, disposition: evidence }
              execution.observations = observations
              // A prepared message that no Ja published is retained by the terminal disposition
              // (SPEC "准入结果保管"); nothing publishes it after the end.
              for (const record of execution.handoffs) {
                if (record.history.kind === 'pending')
                  record.history = { kind: 'retained', disposition: evidence }
              }
              execution.revision = revision
              appendEvents(
                execution,
                [{ kind: 'ended', conclusion, disposition: evidence }],
                evidence,
              )
            },
          }
        },
        () => settleRefusal(input),
      )
    },

    commitSettlement(input) {
      const key = semanticKey('commitSettlement', input)
      // SPEC "commitSettlement 的变体" step 1: the qualification of this operation is checked before
      // the original record is disclosed; a refusal is denied.
      const beforeRecognition = (): Failure | undefined => {
        const required: readonly SettlementQualification[] =
          input.kind === 'migrate-cancellation'
            ? ['settle', 'migrate-cancellation']
            : input.kind === 'establish-cancellation' || input.kind === 'judge-cancellation'
              ? ['settle']
              : ['reconcile']
        return required.every(operation => qualified(input, operation))
          ? undefined
          : denied('commitSettlement')
      }
      const prepare = (): Attempt<SettlementResult> => {
        const found = owned(input, 'commitSettlement')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<SettlementResult>(input, key)
        if (original !== undefined) return answer(original)
        switch (input.kind) {
          case 'establish-cancellation':
          case 'migrate-cancellation':
          case 'judge-cancellation':
            return settleCandidate(execution, input)
          case 'record-card-reconciliation':
          case 'record-legacy-return':
          case 'record-tool-association':
            return settleCustody(execution, input)
          default: {
            const _exhaustive: never = input
            return _exhaustive
          }
        }
      }
      return write('commitSettlement', input, key, prepare, beforeRecognition)
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
          // The same value is recognized by the new operation at the revision of the registration.
          const first = execution.observed.get(input.passage)
          if (first !== undefined) {
            const receipt = recognition(
              execution,
              input.operation,
              Number(first.revision),
              'applied',
            )
            return recognize(receipt, receipt)
          }
        }
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'observation', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            // No event: SPEC "终态后与 ended" keeps the event stream closed after ended.
            execution.observations[index] = { ...item, observed: copy(input.observed) }
            execution.observed.set(input.passage, receipt)
            execution.revision = revision
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

    async load(input) {
      const fault = readFault('load')
      if (fault !== undefined) return fault
      const found = owned(input, 'load')
      if ('failure' in found) return found
      return succeed(snapshotOf(found.ok))
    },

    async inputs(input) {
      const fault = readFault('inputs')
      if (fault !== undefined) return fault
      const found = owned(input, 'inputs')
      if ('failure' in found) return found
      const execution = found.ok
      const range = execution.watermarks.get(input.watermark.record)
      if (range === undefined)
        return fail(invalid('watermark', 'not a watermark of this execution'))
      const id = batchIdOf(execution.id, range.from, range.to)
      execution.batches.set(id, range)
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
      const found = owned(input, 'readReplyAdmissions')
      if ('failure' in found) return found
      const execution = found.ok
      const through = execution.admissionThroughs.get(input.through.record)
      if (through === undefined) return fail(invalid('through', 'not a range of this execution'))
      const after = sequenceOf(input.after)
      if (after === undefined || after > through) return fail(invalid('after', 'outside the range'))
      if (!Number.isSafeInteger(input.limit) || input.limit < 1) {
        return fail(invalid('limit', 'not a positive integer'))
      }
      const items = execution.admissions
        .filter(item => item.sequence > after && item.sequence <= through)
        .slice(0, input.limit)
      const last = items.at(-1)?.sequence ?? after
      const complete = last === through
      const prefix = (n: number) => ({
        sequence: String(n) as ReplyAdmissionSequence,
        basis: journalEvidence(`${execution.id}/reply-admission-prefix/${n}`, n),
      })
      return succeed({
        kind: 'page',
        through: copy(input.through),
        start: prefix(after),
        end: prefix(last),
        items: items.map(item => ({
          sequence: String(item.sequence) as ReplyAdmissionSequence,
          fact: copy(item.fact),
          publication: journalEvidence(
            `${execution.id}/publication/${item.sequence}`,
            item.sequence,
          ),
        })),
        tail: complete
          ? { kind: 'complete' }
          : { kind: 'more', next: String(last) as ReplyAdmissionPageCursor },
      })
    },

    async query(input) {
      const rejected = receiving.queryQualification(input)
      if (rejected) return fail(rejected)
      const fault = readFault('query')
      if (fault !== undefined) return fault
      const execution = executions.get(executionKey(input.tenant, input.execution))
      if (execution !== undefined && !tenantEquals(execution.tenant, input.tenant)) {
        return fail(denied('query'))
      }
      const at = operationKey(input.tenant, input.execution, input.operation)
      const record = at === undefined ? undefined : operations.get(at)
      // Without an execution and without an operation of this tenant, the answer is the one that
      // another tenant gets: it does not tell a missing execution from a forbidden one.
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
              execution.waiters.delete(wake)
              resolve()
            }
            execution.waiters.add(wake)
            input.signal.addEventListener('abort', wake, { once: true })
          })
        }
      },
    },
  }

  const receiving = createJournalReceiving<P>({
    owned,
    operations,
    operationKey,
    write,
    holds,
    receiptOf,
    nextEvidence,
    writeEntry: (execution, entry, cause) => {
      execution.entries.push(entry)
      appendEvents(execution, [{ kind: 'entry', entry }], cause)
    },
    ...(options.custodian === undefined ? {} : { custodian: options.custodian }),
  })
  return {
    port,
    provider: { journal: port, ...receiving.ports },
    targets: receiving.targets,
    receiving: receiving.controls,
    durability: 'none',
    setRetainedToolInvocationFault(input) {
      if (!retainedToolInvocationFaults) return { kind: 'rejected', reason: 'disabled' }
      const key = retainedFaultKey(input)
      if (key === undefined) return { kind: 'rejected', reason: 'invalid-input' }
      const execution = executions.get(executionKey(input.tenant, input.execution))
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
      const reference =
        input.fault.kind === 'malformed'
          ? MALFORMED_RETAINED_TOOL_INVOCATION
          : input.fault.reference
      if (original === undefined) retainedToolInvocationBaselines.set(key, record.toolInvocation)
      execution.controls[index] = { ...record, toolInvocation: reference }
      return { kind: 'applied' }
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
      // The tenant of an existing execution, or the one the test names for a pending `open`.
      const matches = [...executions.values()].filter(value => value.id === execution)
      const owner = tenant ?? (matches.length === 1 ? matches[0]?.tenant : undefined)
      if (owner === undefined && matches.length > 1) return false
      for (const [key, record] of operations) {
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
          operations.set(key, {
            kind: 'excluded',
            key: record.key,
            evidence: journalEvidence(`${execution}/excluded/${operation}/dropped`, 0),
          })
        }
        return true
      }
      return false
    },
    joint: () => copy(jointFacts),
    seedLegacyCandidate(id, candidate, tenant) {
      const matches = [...executions.values()].filter(
        value => value.id === id && (tenant === undefined || tenantEquals(tenant, value.tenant)),
      )
      const execution = matches.length === 1 ? matches[0] : undefined
      if (execution === undefined || execution.state.kind === 'ended') return false
      const finishing = execution.finishing
      const revision = execution.revision + 1
      const seeded: FinishCandidate = {
        candidate,
        origin: journalEvidence(`${execution.id}/legacy/${candidate}/origin`, revision),
        conclusion: {
          kind: 'cancelled',
          cause: journalEvidence(`${execution.id}/legacy/${candidate}/cause`, revision),
        },
        failure: null,
        inputWatermark: watermarkOf(execution),
        checkpoint: copy(execution.checkpoint),
        conditions: journalEvidence(`${execution.id}/legacy/${candidate}/conditions`, revision),
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
      finishing.currentRoute = route.record.record
      finishing.currentJudgment = null
      finishing.obligations = null
      execution.state = { kind: 'settling' }
      execution.revision = revision
      return true
    },
    participantCondition(condition) {
      participantCondition = copy(condition)
    },
    applyRetention(id, tenant) {
      const matches = [...executions.values()].filter(
        value => value.id === id && (tenant === undefined || tenantEquals(tenant, value.tenant)),
      )
      const execution = matches.length === 1 ? matches[0] : undefined
      if (execution === undefined) return 0
      const before = execution.retainedFrom
      execution.retainedFrom = Math.max(execution.retainedFrom, execution.acknowledged + 1)
      return execution.retainedFrom - before
    },
  }
}
