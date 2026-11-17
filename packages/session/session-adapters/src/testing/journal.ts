import { acceptanceIn, compactionGeneration } from '@omne-harness/agent-contract'
import { pendingCalls } from './pending.ts'
import { controlStageOf, controlTarget, type ToolControlRecord } from './journal-controls.ts'
import { createHash } from 'node:crypto'
import { canonical, canonicalOfKept } from './canonical.ts'
import { openEffectsAt, openSnapshotItems } from './execution-open-set.ts'
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
  SettlementResult,
  ObligationDisposition,
  RecoveryContinuation,
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
  openKey,
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
  modelAttempt,
  receiptOf as batchReceiptOf,
  BATCH_MAX_FACTS,
  refOf,
  voidedFacts,
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
import { listKey } from '../journal/view.ts'
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
import {
  type CandidateRequest,
  type CustodyRequest,
  type HandoffApply,
  copy,
  custodyTargetFailure,
  handoffRecord,
  invalid,
  preparedHandoff,
  retiredHandoff,
  sameEvidence,
  sameValue,
  undetermined,
} from './journal-handoff-checks.ts'

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

export type JournalRead =
  | 'load'
  | 'inputs'
  | 'readReplyAdmissions'
  | 'readFinish'
  | 'query'
  | 'read'

export type WriteFault =
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'commit-unknown'; outcome: 'applied' | 'dropped' | 'pending' }>

export type ParticipantResponse =
  | 'participate'
  | 'fail'
  | 'fail-unknown'
  | 'conflict'
  | 'unsupported'

type Qualification<P, X> = (input: Access<P> & X) => boolean

export type JointDecision = Readonly<{ evidence: DurableEvidence; digest: string }>

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

  qualifyParticipation?: (
    input: ExecutionMutation<P>,
    method: 'commit' | 'recordResult',
    receipt: CommandReceipt,
  ) => Promise<Outcome<JointDecision, Failure>>

  participates?: (input: ExecutionMutation<P>, method: 'commit' | 'recordResult') => boolean

  retainedToolInvocationFaults?: boolean

  participants?: Iterable<JointCommitKind>

  grant?: Qualification<
    P,
    Readonly<{ execution: AgentExecutionId; grant: DurableEvidence; method: 'open' | 'attach' }>
  >

  custodian?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>

  observer?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>

  readLimit?: number

  eventSchema?: Adoption

  replyAdmissionRule?: Adoption

  cancellation?: Readonly<{
    installation: CancellationPolicyInstallation
    policy: CancellationPolicy
  }>

  hostRecords?: ReadonlyMap<string, TestHostRecord>

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

  seedLegacyCandidate(
    execution: AgentExecutionId,
    candidate: AgentOperationId,
    tenant?: TenantId,
  ): boolean

  applyRetention(execution: AgentExecutionId, tenant?: TenantId): number

  replyAdmissions: SessionReplyAdmissionControls
}>

export type SessionReplyAdmissionControls = Readonly<{
  seed(execution: AgentExecutionId, count: number, tenant?: TenantId): boolean
  damage(execution: AgentExecutionId, damage: AdmissionDamage, tenant?: TenantId): boolean
  limitPages(limits: AdmissionPageLimits): void
  statistics(): Readonly<AdmissionCounters>
  changeRule(
    execution: AgentExecutionId,
    rule: Adoption,
    conversion: 'rebuild' | 'none',
    tenant?: TenantId,
  ): boolean
}>

type Attachment = {
  authority: Authority
  grant: DurableEvidence | null
  status: 'active' | 'detached' | 'superseded'
  handoff: DurableEvidence | null
  handoffRevision: number
}

type Range = Readonly<{ from: number; to: number }>

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

export const DEFAULT_EVENT_SCHEMA: Adoption = Object.freeze({
  owner: JOURNAL_OWNER,
  name: 'agent-event',
  revision: '1',
  digest: 'memory:agent-event',
})

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
  state: JournalCommitState | Extract<ExecutionState, { kind: 'ended' }>
  checkpoint: AgentCheckpoint
  attachments: Attachment[]
  inputs: AcceptedInput[]
  inputRevisions: Map<InputId, number>

  events: AgentEvent[]
  retainedFrom: number
  acknowledged: number
  acknowledgedAt: number
  controls: ControlRecord[]
  results: ResultResponsibility[]
  resultRevisions: Map<string, number>
  effects: EffectIntent[]
  observations: TerminalObservation[]

  stageReceipts: Map<string, CommandReceipt>

  observed: Map<TerminalObservation['passage'], CommandReceipt>
  admissions: AdmissionRecord[]
  admissionLedger: AdmissionLedger
  entries: AgentJournalEntry[]
  handoffs: HandoffRecord[]
  custodyAttempts: Map<AgentOperationId, CustodyAttempt>
  finishing: FinishingRecords
  serial: number
}

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
type Excluded = Readonly<{
  kind: 'excluded'
  key: string
  execution: AgentExecutionId
  operation: AgentOperationId
  reason: ExclusionReason
  evidence: DurableEvidence
}>
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
  drop?: () => void
}>
export type OperationRecord = Committed | Rejected | Excluded | Pending

export type Attempt<R> =
  | Readonly<{ kind: 'answer'; value: Outcome<R, Failure> }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'write'; value: R; receipt: CommandReceipt; apply: () => void }>
  | Readonly<{
      kind: 'batch'
      facts: readonly FactBody[]
      blobs: readonly Blob[]
      kinds: readonly ParticipationKind[]
      derive: (answer: Answer) => R
      project: (batch: PublishedBatch, view: ExecutionView) => void
      receiptState?: CommandReceipt['state']
    }>
  | Readonly<{
      kind: 'reject'
      failure: Extract<Failure, { kind: 'conflict' }>
      audit: DurableEvidence
      facts: readonly FactBody[]
      project: (batch: PublishedBatch, view: ExecutionView) => void
    }>

const CALL_STAGES: ReadonlySet<ControlStage> = new Set([
  'intent-established',
  'producer-confirmed',
  'physically-stopped',
  'duty-released',
])
const STAGES: Readonly<Record<ExecutionControl['kind'], ReadonlySet<ControlStage>>> = {
  'interrupt-model': CALL_STAGES,
  'interrupt-tool': CALL_STAGES,
  'background-tool': CALL_STAGES,
  'release-tool': CALL_STAGES,
  'withdraw-tool': CALL_STAGES,
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

function sameResultKey(
  left: ResultResponsibility['result'],
  right: ResultResponsibility['result'],
) {
  return canonical(left.producer) === canonical(right.producer) && left.version === right.version
}

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
  return record.command.kind.endsWith('-tool')
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

export type AdmissionRecord = Readonly<{
  fact: ModelReplyAdmission
  publication: DurableEvidence
  basis: DurableEvidence | null
  present: boolean
}>

export type AdmissionProjection = Readonly<{
  rule: Adoption
  consecutive: number
  total: number
  last: DurableEvidence | null
  sequence: number
  basis: DurableEvidence
}>

export type AdmissionLedger = Readonly<{
  origin: DurableEvidence | null
  retainedFrom: number
  rangesFrom: number
  projection: AdmissionProjection
}>

export type AdmissionScope = Readonly<{
  parts: readonly string[]
  owner: string
  mint(record: string, revision: number): DurableEvidence
}>

export type AdmissionCounters = {
  seeks: number
  scanned: number
  decoded: number
  pages: number
  folds: number
  loads: number
  checkpointWrites: number
}

function admissionCounters(): AdmissionCounters {
  return { seeks: 0, scanned: 0, decoded: 0, pages: 0, folds: 0, loads: 0, checkpointWrites: 0 }
}

export type AdmissionDamage =
  | Readonly<{ kind: 'missing-fact'; sequence: number }>
  | Readonly<{ kind: 'missing-basis'; sequence: number }>
  | Readonly<{ kind: 'retention'; from: number }>
  | Readonly<{ kind: 'range-unavailable'; below: number }>

export type AdmissionPageLimits = Readonly<{ items: number | null; bytes: number | null }>

const PREFIX = 'reply-admission-prefix'
const RANGE = 'reply-admissions'
const CURSOR = 'rac1.'

function sequenceText(value: number): ReplyAdmissionSequence {
  const decoded = decodeReplyAdmissionSequence(String(value))
  if ('failure' in decoded) throw new Error(`memory Journal minted an invalid sequence: ${value}`)
  return decoded.ok
}

function recordOf(scope: AdmissionScope, kind: string, sequence: number): string {
  return `${JSON.stringify(scope.parts)}/${kind}/${sequence}`
}

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

function admissionKey(fact: ModelReplyAdmission): string {
  return JSON.stringify([fact.call, fact.resultVersion])
}

function throughOf(scope: AdmissionScope, ledger: AdmissionLedger): DurableEvidence {
  const sequence = ledger.projection.sequence
  return scope.mint(recordOf(scope, RANGE, sequence), sequence)
}

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

type Resolved =
  | Readonly<{ kind: 'resolved'; sequence: number }>
  | Readonly<{ kind: 'refused'; failure: Failure }>
  | Readonly<{ kind: 'missing'; sequence: number }>

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

function digestOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 24)
}

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
  const bases: (DurableEvidence | null)[] = []
  for (const [offset, row] of rowsOf(records, start, count, counters).entries()) {
    if (row === undefined || !row.present) {
      if (items.length === 0) return gap('missing-fact')
      break
    }
    const size = canonical(row.fact).length
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

function sameShape(checkpoint: AgentCheckpoint): AgentCheckpoint {
  return {
    ...checkpoint,
    adoptedRequest: checkpoint.adoptedRequest ?? null,
  }
}

function producerCallOf(result: ProducedResult): ProducerCall {
  return {
    ...(result.producer.kind === 'compaction'
      ? { producer: 'compaction' as const, task: result.producer.task }
      : { producer: result.producer.kind, call: String(result.producer.call) }),
    version: result.version,
    delivery: result.delivery,
    source: copy(result.source),
  }
}

function handoffsOf(
  execution: Execution,
  custody: (handoff: HandoffReference) => ExecutionHandoff['custody'],
): readonly ExecutionHandoff[] {
  return execution.handoffs.map(record => ({ ...record, custody: custody(record.handoff) }))
}

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
  // Memos of the ranges an execution minted. Its ids and records encode them, so they do not depend on how a transaction ends: one per execution, not per version.
  const caches = new Map<
    string,
    {
      batches: Map<InputBatchId, Range>
      watermarks: Map<string, Range>
    }
  >()
  const admissionStatistics = admissionCounters()
  let pageLimits: AdmissionPageLimits = { items: null, bytes: null }
  const cache = (execution: Execution) => {
    const at = executionKey(execution.tenant, execution.id)
    let value = caches.get(at)
    if (!value) {
      value = { batches: new Map(), watermarks: new Map() }
      for (const event of execution.events)
        if (event.body.kind === 'input-taken') {
          const range = takenRange(execution, event.body.batch)
          if (range !== undefined) value.batches.set(event.body.batch.id, range)
        }
      caches.set(at, value)
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
      return fail(record.key === key ? copy(record.failure) : conflict(input.operation))
    }
    if (record?.kind !== 'committed') return undefined
    return record.key === key ? succeed(copy(record.value) as R) : fail(conflict(input.operation))
  }

  function nextEvidence(execution: Execution, what: string, revision: number): DurableEvidence {
    const serial = execution.serial + 1
    if (cell.writing()) execution.serial = serial
    return cell.issueEvidence(
      journalEvidence(`${cell.namespace}/${execution.id}/${what}/${serial}`, revision),
    )
  }

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
    if (attachment === undefined) {
      throw new TypeError('the session Journal has an execution without an attachment')
    }
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
    await cell.wait(input, method)
    let decision: JointDecision | null = null
    if (method === 'commit' || method === 'recordResult') {
      const caller =
        method === 'commit'
          ? (input as Parameters<AgentJournal<P>['commit']>[0]).caller
          : (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
      const participates = options.participates?.(input, method) ?? caller.kind !== 'none'
      if (participates && options.qualifyParticipation) {
        const receipt = reservedReceipt(method, input, key)
        if (receipt === undefined) return fail(denied(method))
        const qualified = await options.qualifyParticipation(input, method, receipt)
        if ('failure' in qualified) return qualified
        const current = reservedReceipt(method, input, key)
        if (
          current === undefined ||
          current.revision !== receipt.revision ||
          !sameEvidence(current.evidence, receipt.evidence)
        )
          return fail(outrunParticipation)
        decision = qualified.ok
      }
      if (
        options.prepareResult &&
        (caller.kind === 'custody' || caller.kind === 'processed') &&
        caller.result.producer.kind !== 'compaction'
      ) {
        const refused = beforeRecognition?.()
        if (refused) return fail(refused)
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
        if (advanced) {
          const captured = cell.committed(input, method, receipt)
          if (captured) return { kind: 'answered', value: fail(captured) }
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

  const mint = { owner: JOURNAL_OWNER, session: cell.namespace }

  function viewOf(execution: AgentExecutionId): ExecutionView {
    return state().view.executions.get(execution) ?? emptyExecutionView(execution)
  }

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
    const facts = [...unpublishedExclusions(input, before, prepared.facts), ...prepared.facts]
    const built = buildBatch(before, envelope, facts)
    if ('kind' in built) {
      if (built.kind === 'incomplete') return fail(invalid('facts', built.reason))
      return fail(conflict(input.operation))
    }
    const agent = state()
    const pub = agent.view.head + 1
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
    const receipt: CommandReceipt = {
      ...minted,
      evidence: cell.issueEvidence(minted.evidence),
      state: prepared.receiptState ?? minted.state,
    }
    const value = prepared.derive(
      'receipt' in derived ? ({ ...derived, receipt } as Answer) : derived,
    )
    prepared.project(batch, folded)
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

  function recognitionBatch(
    target: AgentOperationId | undefined,
    revision: number,
    receiptState: CommandReceipt['state'],
  ): Attempt<CommandReceipt> {
    return recognitionOf(target, revision, receipt => receipt, receiptState)
  }

  function reachedBy(execution: AgentExecutionId, revision: number): AgentOperationId | undefined {
    return state().view.executions.get(execution)?.reached.get(revision)
  }

  function receiptIn(derived: Answer): CommandReceipt {
    if (!('receipt' in derived)) throw new TypeError(`a ${derived.kind} answer carries no receipt`)
    return derived.receipt
  }

  function ownEvidence(
    execution: AgentExecutionId,
    key: string,
    revision: number,
  ): DurableEvidence {
    const coordinates = { execution, pub: state().view.head + 1, envelope: { digest: key } }
    return cell.issueEvidence(batchEvidence(mint, coordinates as PublishedBatch, revision))
  }

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

  function plannedOf(derived: Answer, planned: CommandReceipt): CommandReceipt {
    if (!('receipt' in derived) || !sameValue(derived.receipt, planned))
      throw new TypeError('the finishing batch derived another receipt than the planned one')
    return derived.receipt
  }

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

  function unpublishedExclusions(
    input: Pick<ExecutionMutation<P>, 'tenant' | 'execution'>,
    before: ExecutionView,
    facts: readonly FactBody[],
  ): FactBody[] {
    const carried = new Set(
      facts.flatMap(fact => (fact.kind === 'op.excluded' ? [fact.operation] : [])),
    )
    const out: FactBody[] = []
    for (const [at, record] of state().operations.excludedOf(input.execution)) {
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

  function fencedOperations(execution: Execution): FactBody[] {
    const out: FactBody[] = []
    for (const [, record] of state().operations.pendingOf(execution.id)) {
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
    for (const [key, record] of state().operations.pendingOf(execution.id)) {
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
    for (const [, record] of state().operations.pendingOf(execution.id))
      if (pendingOf(record, execution)) unresolved.push(record.operation)
    const emitted = execution.events.length
    const groups = custodyGroups(execution)
    const shown = stateOf(execution)
    // One-level copy is enough: the core replaces elements and never mutates them in place, so a snapshot keeps what it saw. A deep copy cost every `load` the whole history.
    return succeed<ExecutionSnapshot>({
      ...copy({
        execution: execution.id,
        revision: revisionOf(execution.revision),
        state: shown,
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
      terminalObservations: [...execution.observations],
      ...openSnapshotItems(
        { execution, shown, from: takenFrom(execution) },
        handoffsOf(execution, handoff => custodyOf(execution, handoff, groups)),
      ),
    })
  }

  function takenFrom(execution: Execution): number {
    const taken = execution.checkpoint.inputBatch
    return taken === null ? 0 : (cache(execution).batches.get(taken.id)?.from ?? 0)
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

  function stateOf(execution: Execution): ExecutionState {
    if (execution.state.kind !== 'settling') return execution.state
    const intent = intentOf(execution.finishing)
    if (intent === undefined)
      throw new Error('session Journal defect: a settling execution without a candidate')
    return { kind: 'settling', intent }
  }

  function pendingWrites(execution: Execution, operation: AgentOperationId) {
    const found: { operation: AgentOperationId; method: string }[] = []
    for (const [, record] of state().operations.pendingOf(execution.id)) {
      if (pendingOf(record, execution) && record.operation !== operation)
        found.push({ operation: record.operation, method: record.key.split(':')[0] ?? '' })
    }
    return found
  }

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

  function coordination(execution: Execution): DurableEvidence {
    return journalEvidence(`${cell.namespace}/${execution.id}/coordination`, 0)
  }

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

  function settleRefusal(
    input: Access<P> &
      Readonly<{ execution: AgentExecutionId; authorization: FinishAuthorization }>,
  ): Failure | undefined {
    return input.authorization.kind === 'cancel' ? cell.authorize(input, 'settle') : undefined
  }

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

  function custodyGroups(
    execution: Execution,
  ): ReadonlyMap<string, readonly (readonly [AgentOperationId, CustodyAttempt])[]> {
    const groups = new Map<string, (readonly [AgentOperationId, CustodyAttempt])[]>()
    for (const entry of execution.custodyAttempts.entries()) {
      const key = canonicalOfKept(entry[1].handoff)
      const group = groups.get(key)
      if (group === undefined) groups.set(key, [entry])
      else group.push(entry)
    }
    return groups
  }

  function custodyOf(
    execution: Execution,
    handoff: HandoffReference,
    groups: ReadonlyMap<
      string,
      readonly (readonly [AgentOperationId, CustodyAttempt])[]
    > = custodyGroups(execution),
  ): Exclude<ExecutionHandoff['custody'], null> | null {
    const attempts = groups.get(canonicalOfKept(handoff)) ?? []
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

  type CandidateVariant = CandidateRequest<P>
  type CancellationRoute = Extract<FinishRoute, { kind: 'cancellation' }>

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

  function settleCandidate(
    execution: Execution,
    input: CandidateVariant,
    key: string,
  ): Attempt<SettlementResult> {
    const installed = options.cancellation
    if (installed === undefined)
      return answer(fail(damaged('no cancellation policy is installed on this binding')))
    if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
    const checked = cancelCheck(execution, input.authorization, 'commitSettlement')
    if (checked.kind === 'failure') return answer(fail(checked.failure))
    const control = checked.control
    if (control.command.kind !== 'cancel')
      throw new Error('session Journal defect: an effective cancel without a cancel command')
    const cause = control.command.reason
    const installation = installed.installation
    if (!sameEvidence(installation.record, input.installation))
      return answer(fail({ kind: 'changed' }))
    if (input.expected !== revisionOf(execution.revision)) return answer(fail({ kind: 'changed' }))
    const finishing = execution.finishing
    const current = currentCandidate(finishing)
    const route = currentRoute(finishing)
    const revision = execution.revision + 1
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

  function settleCustody(
    execution: Execution,
    input: CustodyRequest<P>,
    key: string,
  ): Attempt<SettlementResult> {
    const finishing = execution.finishing
    const target = custodyTargetFailure(execution, input)
    if (target !== undefined) return answer(fail(target))
    const source = input.kind === 'record-card-reconciliation' ? input.original : input.source
    const record = options.hostRecords?.get(source.record)
    if (record === undefined)
      return answer(fail(damaged(`the host answers no record for ${source.record}`)))
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
    capabilities: Object.freeze({ coordination: 'coordinated' as const, participants }),

    open(input) {
      const key = openKey(input)
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
        if (initial.source === null) return answer(fail(denied('open')))
        const authority: Authority = {
          execution: input.execution,
          executionAttachment: attachmentIdOf(input.execution, 1),
          instance: runtime.instance,
          generation: '1',
          source: attachmentEvidence(input.execution, 'attach', 1, 1),
        }
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
        const allocated = input.events.find(
          body => (body.kind as string) === 'entry' || (body.kind as string) === 'ended',
        )
        if (allocated !== undefined)
          return answer(
            fail(invalid('events', `the Journal allocates the ${allocated.kind} event body`)),
          )
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
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (input.expected !== revisionOf(execution.revision)) {
          return answer(fail({ kind: 'changed' }))
        }
        const finishing = execution.finishing
        const current = currentCandidate(finishing)
        if (input.state.kind === 'settling' && input.finish === null && current === undefined)
          return answer(fail(invalid('state', 'a settling commit before any candidate')))
        if (
          input.finish !== null &&
          input.finish.conclusion.kind !== 'cancelled' &&
          effectiveCancels(execution).length > 0
        )
          return answer(fail({ kind: 'changed' }))
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
        const compacted = input.caller.kind === 'context-transition' ? input.caller.value : null
        const consumed =
          input.caller.kind === 'processed' && input.caller.result.producer.kind === 'compaction'
            ? input.caller
            : compacted === null
              ? null
              : {
                  result: {
                    producer: { kind: 'compaction' as const, task: compacted.task },
                    version: compacted.result.version,
                    delivery: null,
                    source: compacted.result.evidence,
                  },
                  consumption: compacted.consumption,
                }
        const resultIndex =
          consumed === null
            ? -1
            : execution.results.findIndex(
                item =>
                  sameValue(item.result, consumed.result) &&
                  item.consumption === consumed.consumption,
              )
        const responsibility = execution.results[resultIndex]
        if (consumed !== null && responsibility === undefined)
          return answer(
            fail(invalid('caller', 'the result has no durable consumer responsibility')),
          )
        if (compacted !== null) {
          const task = execution.checkpoint.compaction
          const preparation = execution.checkpoint.requestPreparation
          const held = cell.state().receiving.materials.get(canonical(compacted.received))
          const material = held?.value
          if (
            task === null ||
            !sameValue(task.task, compacted.task) ||
            task.consumption !== compacted.consumption ||
            !sameValue(task.result, compacted.result) ||
            !sameValue(task.received, compacted.received) ||
            !sameValue(responsibility?.custody, compacted.received) ||
            preparation?.kind !== 'needs-compaction' ||
            preparation.id !== compacted.preparation ||
            !sameValue(preparation.input, task.input) ||
            !sameValue(compacted.history, task.input.source) ||
            !sameValue(compacted.message.derivation, compactionGeneration(task.task)) ||
            responsibility?.completion !== null
          )
            return answer(
              fail(
                invalid('caller', 'the compaction result is not the current unprocessed result'),
              ),
            )
          if (
            held?.execution !== execution.id ||
            material?.kind !== 'compaction' ||
            !sameValue(material.result, consumed?.result) ||
            material.outcome.kind !== 'completed' ||
            !sameValue(material.outcome.message, compacted.message)
          )
            return answer(
              fail(invalid('caller', 'the compaction message is not the durably retained result')),
            )
        }
        if (
          consumed !== null &&
          input.caller.kind === 'processed' &&
          responsibility?.completion !== null &&
          !sameValue(responsibility?.completion, input.caller.completion)
        )
          return answer(fail(conflict(input.operation)))
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
        const completion = caller.kind === 'processed' ? caller.completion : evidence
        if (consumed !== null)
          facts.push({
            kind: 'result.handled',
            consumption: consumed.consumption,
            result: producerCallOf(consumed.result),
            stage: 'processed',
            evidence: copy(completion),
            step: null,
          })
        const view = viewOf(execution.id)
        const taken = input.checkpoint.inputBatch
        if (
          taken !== null &&
          !view.steps.some(item => item.batch.id === taken.id) &&
          !input.events.some(body => body.kind === 'input-taken')
        )
          facts.push({ kind: 'step.begun', step: input.checkpoint.step, batch: copy(taken) })
        const adopted = input.checkpoint.adoptedRequest ?? null
        const adoptedBefore = execution.checkpoint.adoptedRequest ?? null
        if (adopted !== null && canonical(adopted) !== canonical(adoptedBefore)) {
          blobs.push(blobOf(adopted.record))
          facts.push({
            kind: 'request.adopted',
            step: input.checkpoint.step,
            attempt: modelAttempt(input.checkpoint),
            reference: adopted.reference,
            fixed: copy(adopted.fixed),
            schema: copy(adopted.schema),
            record: refOf(adopted.record),
            coverage: input.checkpoint.adoptedContext,
          })
        }
        const voidedNow = input.checkpoint.voided.slice(execution.checkpoint.voided.length)
        const closed = voidedFacts(view, voidedNow)
        if (closed === null)
          return answer(fail(invalid('checkpoint.voided', 'the voided request was not adopted')))
        facts.push(...closed)
        for (const body of input.events) {
          if (body.kind === 'input-taken')
            facts.push({ kind: 'step.begun', step: input.checkpoint.step, batch: copy(body.batch) })
          if (body.kind === 'waiting') {
            blobs.push(blobOf(body.waits))
            facts.push({
              kind: 'wait.entered',
              step: input.checkpoint.step,
              waits: refOf(body.waits),
            })
          }
          if (body.kind === 'message' && admission === null) {
            blobs.push(blobOf(body.message))
            facts.push({
              kind: 'message.published',
              step: input.checkpoint.step,
              message: refOf(body.message),
              source: copy(body.source),
            })
          }
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
          if (admitted.record.basis === null)
            throw new TypeError('a new reply admission has no prefix basis')
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
        const routeRecord = journalEvidence(
          `${cell.namespace}/${execution.id}/route/${input.operation}`,
          revision,
        )
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
        const bound = receiving.newBindings(
          {
            ...execution,
            checkpoint: input.checkpoint,
            effects: openEffectsAt(execution, stateOf(execution), input.checkpoint),
          },
          input.authority.instance,
        )
        facts.push(...bound.facts)
        blobs.push(...bound.blobs)
        return {
          kind: 'batch',
          facts,
          blobs,
          kinds:
            caller.kind === 'none' ||
            ((caller.kind === 'custody' || caller.kind === 'processed') &&
              caller.result.producer.kind === 'compaction')
              ? []
              : [caller.kind],
          derive: receiptIn,
          project: (_batch, folded) => {
            if (folded.revision !== revision)
              throw new TypeError('the commit batch reached another revision than it judged')
            handoffChange.ok(revision, evidence)
            const checkpoint = checkpointOf(folded, state().blobs)
            if (
              semanticKey('checkpoint', sameShape(checkpoint)) !==
              semanticKey('checkpoint', sameShape(input.checkpoint))
            )
              throw new TypeError('the folded facts name another checkpoint than the commit')
            execution.checkpoint = checkpoint
            if (consumed !== null && responsibility !== undefined) {
              execution.results[resultIndex] = { ...responsibility, completion: copy(completion) }
              execution.resultRevisions.set(
                semanticKey('responsibility', [
                  consumed.result.producer,
                  consumed.result.version,
                  consumed.consumption,
                ]),
                revision,
              )
            }
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
              execution.admissions = [...execution.admissions, admitted.record]
              execution.admissionLedger = admitted.ledger
            }
            admissionStatistics.checkpointWrites += 1
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
          return recognitionBatch(entry.operation, at, 'accepted')
        }
        if (known !== undefined) return answer(fail(conflict(input.operation)))
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
        if (
          known !== undefined &&
          semanticKey('responsibility', known) === semanticKey('responsibility', responsibility)
        ) {
          const at = execution.resultRevisions.get(resultKey) ?? execution.revision
          return recognitionBatch(reachedBy(execution.id, at), at, 'applied')
        }
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
          kinds:
            transfer.kind === 'none' || input.result.producer.kind === 'compaction'
              ? []
              : [transfer.kind],
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
            const first = execution.stageReceipts.get(stageKey)
            if (first !== undefined) {
              const at = Number(first.revision)
              return recognitionBatch(reachedBy(execution.id, at), at, 'applied')
            }
          }
          const ended = execution.state.kind === 'ended'
          if (
            ended &&
            !sameFact &&
            fact?.state !== 'reached' &&
            (input.stage === 'intent-established' || input.stage === 'qualification-revoked')
          ) {
            return answer(fail({ kind: 'terminal' }))
          }
          if (!sameFact && fact !== undefined && fact.state === 'reached') {
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
        const at = operationKey(input.tenant, input.execution, input.operation)
        const fixed = at === undefined ? undefined : state().operations.get(at)
        if (fixed?.kind === 'excluded')
          return answer(fail(invalid('operation', 'operation-permanently-excluded')))
        const checked = validated(execution)
        if ('failure' in checked) return answer(checked)
        const record = handoffRecord(execution, reference)
        if (record === undefined) throw new Error('recordHandoff: the validated record is missing')
        execution.custodyAttempts.set(input.operation, checked.ok)
        const custody = input.custody
        const facts: FactBody[] = []
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
            if (execution.state.kind === 'ended' && record.history.kind === 'pending')
              record.history = { kind: 'retained', disposition: execution.state.disposition }
            execution.revision = view.revision
          },
        }
      }
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
          if (authorization.kind === 'advancement' && !holds(execution, authorization.authority))
            return answer(fail({ kind: 'stale-advance' }))
          if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
          if (authorization.kind === 'cancel') {
            const checked = cancelCheck(execution, authorization, 'prepareFinish')
            if (checked.kind === 'failure') return answer(fail(checked.failure))
          }
          const finishing = execution.finishing
          const candidate = candidateOf(finishing, input.candidate)
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
          const planned = plannedReceipt(execution, input.operation, key)
          const evidence = planned.evidence
          const built = obligationsOf(execution, candidate, input.operation)
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
          const given = input.intent.obligations
          if (given === null)
            return answer(fail(invalid('intent.obligations', 'the obligations are not issued')))
          const list = finishing.issued.get(given.record)
          if (list === undefined || !sameEvidence(list.evidence, given))
            return answer(fail(invalid('intent.obligations', 'not a list this Journal issued')))
          if (list.candidate !== candidate.candidate)
            return answer(fail(invalid('intent.obligations', 'the list of another candidate')))
          if (semanticKey('finish-intent', intent) !== semanticKey('finish-intent', input.intent))
            return changed
          const closure = obligationsOf(execution, candidate, input.operation).items
          if (projectionOf(closure) !== projectionOf(list.items)) return changed
          const boundary = watermarkRange(execution, candidate.inputWatermark.record)
          if (boundary === undefined || boundary.to < execution.inputs.length) return changed
          const check = blockedReason(execution, candidate, closure, list.items)
          if (check.kind === 'changed') return changed
          if (check.kind === 'blocked') return answer(succeed(copy(check.value)))
          if (check.kind === 'unknown') return answer(fail(damaged(check.diagnostic)))
          const receipt = plannedReceipt(execution, input.operation, key)
          const participation = cell.participate(input, 'tryFinish', receipt, null)
          if (participation !== undefined) {
            return participation.kind === 'changed' ? changed : answer(fail(participation))
          }
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

    async inputAcceptance(input) {
      const found = owned(input, 'inputAcceptance')
      if ('failure' in found) return found
      return succeed(copy(acceptanceIn(found.ok.handoffs, input.input)))
    },

    async readFinish(input) {
      const fault = readFault('readFinish')
      if (fault !== undefined) return fault
      const found = owned(input, 'readFinish')
      if ('failure' in found) return found
      const execution = found.ok
      if (execution.state.kind !== 'settling' && execution.state.kind !== 'ended')
        return succeed(null)
      const intent = intentOf(execution.finishing)
      if (intent === undefined)
        return fail(damaged(`a ${execution.state.kind} execution without a finish candidate`))
      return succeed(copy(intent))
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
        for (const [key, record] of state().operations.pendingOf(execution)) {
          if (
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

  function only(id: AgentExecutionId, tenant: TenantId | undefined): Execution | undefined {
    const matches = [...state().executions.values()].filter(
      value => value.id === id && (tenant === undefined || tenantEquals(tenant, value.tenant)),
    )
    return matches.length === 1 ? matches[0] : undefined
  }
}
