// Every write runs synchronously between two awaits: that makes a write atomic and gives the
// writes of the process one order.
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
import {
  decodeActionId,
  decodeAgentExecutionId,
  decodeAgentOperationId,
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
import type { ModelReceptionTargets } from '../receiving-types.ts'
import { createJournalReceiving, type JournalReceivingControls } from './journal-receiving.ts'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
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
import { canonical } from '../canonical.ts'
import {
  admissionCounters,
  admissionKey,
  admit,
  checkReadPosition,
  damaged as damagedLedger,
  originLedger,
  projectionOf as admissionProjectionOf,
  readAdmissionPage,
  rebuild,
  type AdmissionDamage,
  type AdmissionLedger,
  type AdmissionPageLimits,
  type AdmissionRecord,
  type AdmissionScope,
} from './journal-admissions.ts'
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

export type CoordinatedOperation = 'open' | 'attach' | 'submit' | 'tryFinish'

export type JointFact = Readonly<{
  execution: AgentExecutionId
  operation: AgentOperationId
  caller: Exclude<CallerCommit, { kind: 'none' }>
}>

type Qualification<P, X> = (input: Access<P> & X) => boolean

export type MemoryAgentJournalOptions<P> = Readonly<{
  coordination: JournalCapabilities['coordination']
  retainedToolInvocationFaults?: boolean
  participants?: Iterable<JointCommitKind>
  coordinator?: Readonly<{
    grant?: Qualification<P, Readonly<{ execution: AgentExecutionId; grant: DurableEvidence }>>
    source?: Qualification<P, Readonly<{ execution: AgentExecutionId; source: DurableEvidence }>>
  }>
  custodian?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>
  observer?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>
  qualification?: Qualification<
    P,
    Readonly<{ execution: AgentExecutionId; operation: SettlementQualification }>
  >
  readLimit?: number
  eventSchema?: Adoption
  replyAdmissionRule?: Adoption
  reader?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>
  cancellation?: Readonly<{
    installation: CancellationPolicyInstallation
    policy: CancellationPolicy
  }>
  hostRecords?: ReadonlyMap<string, TestHostRecord>
}>

export type MemoryAgentJournal<P> = Readonly<{
  port: AgentJournal<P>
  provider: AgentReceivedProvider<P, ContentBlock>
  targets: ModelReceptionTargets<P>
  receiving: JournalReceivingControls<P>
  durability: 'none'
  referencedSources(
    input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
  ): readonly DurableEvidence[]
  handoffRecords(
    input: Readonly<{ tenant: TenantId; execution: AgentExecutionId }>,
  ): readonly ExecutionHandoff[]
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
  respond(kind: JointCommitKind | CoordinatedOperation, response: ParticipantResponse): void
  settle(
    execution: AgentExecutionId,
    operation: AgentOperationId,
    outcome: 'applied' | 'dropped',
    tenant?: TenantId,
  ): boolean
  joint(): readonly JointFact[]
  seedLegacyCandidate(
    execution: AgentExecutionId,
    candidate: AgentOperationId,
    tenant?: TenantId,
  ): boolean
  participantCondition(condition: TerminalParticipantFact['condition']): void
  applyRetention(execution: AgentExecutionId, tenant?: TenantId): number
  replyAdmissions: MemoryReplyAdmissionControls
}>

export type MemoryReplyAdmissionControls = Readonly<{
  seed(execution: AgentExecutionId, count: number, tenant?: TenantId): boolean
  damage(execution: AgentExecutionId, damage: AdmissionDamage, tenant?: TenantId): boolean
  limitPages(limits: AdmissionPageLimits): void
  statistics(): Readonly<ReturnType<typeof admissionCounters>>
  changeRule(
    execution: AgentExecutionId,
    rule: Adoption,
    conversion: 'rebuild' | 'none',
    tenant?: TenantId,
  ): boolean
}>

type Attachment = {
  authority: Authority
  status: 'active' | 'detached' | 'superseded'
  handoff: DurableEvidence | null
  handoffRevision: number
}

type Range = Readonly<{ from: number; to: number }>

export type MemoryExecution = {
  id: AgentExecutionId
  tenant: TenantId
  revision: number
  state: JournalCommitState | Extract<ExecutionState, { kind: 'ended' }>
  checkpoint: AgentCheckpoint
  attachments: Attachment[]
  inputs: AcceptedInput[]
  inputRevisions: Map<InputId, number>
  batches: Map<InputBatchId, Range>
  watermarks: Map<string, Range>
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
  admissionKeys: Map<string, number>
  admissionLedger: AdmissionLedger
  entries: AgentJournalEntry[]
  handoffs: HandoffRecord[]
  custodyAttempts: Map<AgentOperationId, CustodyAttempt>
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
  | Readonly<{ kind: 'recognize'; value: R; receipt: CommandReceipt }>
  | Readonly<{
      kind: 'reject'
      failure: Extract<Failure, { kind: 'conflict' }>
      audit: DurableEvidence
      revision: number
      apply: () => void
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

function operationText(tenant: string, execution: AgentExecutionId, operation: AgentOperationId) {
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
  owner: 'agentJournal',
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

function sameEvidence(left: DurableEvidence | null, right: DurableEvidence | null): boolean {
  if (left === null || right === null) return left === right
  return (
    left.owner === right.owner &&
    left.record === right.record &&
    left.revision === right.revision &&
    left.digest === right.digest
  )
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}

function handoffRecord(
  execution: Execution,
  reference: HandoffReference,
): HandoffRecord | undefined {
  return execution.handoffs.find(record => sameValue(record.handoff, reference))
}

function undetermined(record: HandoffRecord): boolean {
  return record.history.kind === 'pending' && record.retirement === null
}

function finishing(execution: Execution): boolean {
  return execution.state.kind === 'settling' || execution.state.kind === 'ended'
}

function openResult(result: ResultResponsibility): boolean {
  return result.completion === null || result.release.kind === 'pending'
}

function openEffect(checkpoint: AgentCheckpoint, effect: EffectIntent): boolean {
  return (
    checkpoint.calls.some(call => call.action === effect.action) ||
    (checkpoint.batch?.actions.some(action => action.id === effect.action) ?? false)
  )
}

function openHandoff(execution: Execution, record: ExecutionHandoff): boolean {
  if (record.history.kind === 'pending') return true
  if (record.custody !== null && record.custody.committed === null) return true
  if (finishing(execution)) return true
  const { checkpoint } = execution
  const same = (reference: HandoffReference | null) =>
    reference !== null && canonical(reference) === canonical(record.handoff)
  if (same(checkpoint.currentHandoff)) return true
  if (checkpoint.batch?.slots.some(slot => same(slot.handoff)) ?? false) return true
  if (record.handoff.kind === 'input') return openInput(execution, record.handoff.input)
  return record.request.kind === 'execution' && record.request.position.step === checkpoint.step
}

function openInput(execution: Execution, input: InputId): boolean {
  const index = execution.inputs.findIndex(accepted => accepted.id === input)
  if (index < 0) return true
  const taken = execution.checkpoint.inputBatch
  const from = taken === null ? 0 : (execution.batches.get(taken.id)?.from ?? 0)
  return index >= from
}

function handoffsOf(
  execution: Execution,
  custody: (handoff: HandoffReference) => ExecutionHandoff['custody'],
): readonly ExecutionHandoff[] {
  return execution.handoffs.map(record => ({
    ...copy(record),
    custody: custody(record.handoff),
  }))
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
  let admissionRule: Adoption = options.replyAdmissionRule ?? {
    owner: JOURNAL_OWNER,
    name: 'reply-admission-projection',
    revision: '1',
    digest: 'memory:reply-admission-projection',
  }
  const executions = new Map<string, Execution>()
  const admissionStatistics = admissionCounters()
  let pageLimits: AdmissionPageLimits = { items: null, bytes: null }
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

  const operationKey = (
    tenant: TenantId,
    execution: AgentExecutionId,
    operation: AgentOperationId,
  ): string | undefined => {
    const text = tenantCodec.encode(tenant)
    return text.ok ? operationText(text.value, execution, operation) : undefined
  }

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

  function recognized<R>(
    input: ExecutionMutation<P>,
    key: string,
  ): Outcome<R, Failure> | undefined {
    const at = operationKey(input.tenant, input.execution, input.operation)
    const record = at === undefined ? undefined : operations.get(at)
    if (record?.kind === 'rejected') {
      return fail(record.key === key ? copy(record.failure) : conflict(input.operation))
    }
    if (record?.kind !== 'committed') return undefined
    return record.key === key ? succeed(copy(record.value) as R) : fail(conflict(input.operation))
  }

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
    if (attachment === undefined) {
      throw new TypeError('the memory Journal has an execution without an attachment')
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
      const waiters = [...execution.waiters]
      execution.waiters.clear()
      for (const wake of waiters) wake()
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
    return run(method, entered.ok.fault, input, key, prepare, beforeRecognition, onDropped)
  }

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
      if (method !== 'open') {
        const found = owned(input, method)
        if ('failure' in found) return found.failure
      }
      return beforeRecognition()
    }
    const pending = operations.get(at)
    if (pending?.kind === 'pending') {
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

  function pendingOf(record: OperationRecord, execution: Execution): record is Pending {
    return (
      record.kind === 'pending' &&
      record.execution === execution.id &&
      tenantEquals(record.tenant, execution.tenant)
    )
  }

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

  function standaloneRefusal(...given: readonly (DurableEvidence | null)[]): Failure | undefined {
    return coordination === 'standalone' && given.some(value => value !== null)
      ? { kind: 'unsupported' }
      : undefined
  }

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

  function coordinated<R>(kind: CoordinatedOperation, conflict: () => Attempt<R>) {
    return coordination === 'coordinated' ? participation(kind, conflict) : undefined
  }

  function inputBoundary(execution: Execution): Range {
    const taken = execution.checkpoint.inputBatch
    const from = taken === null ? 0 : (execution.batches.get(taken.id)?.to ?? 0)
    return { from, to: execution.inputs.length }
  }

  function watermarkOf(execution: Execution): DurableEvidence {
    const range = inputBoundary(execution)
    const evidence = journalEvidence(`${execution.id}/inputs/${range.from}-${range.to}`, range.to)
    execution.watermarks.set(evidence.record, range)
    return evidence
  }

  function admissionScope(tenant: TenantId, id: AgentExecutionId): AdmissionScope {
    const encoded = tenantCodec.encode(tenant)
    return {
      parts: [encoded.ok ? encoded.value : '', id],
      owner: JOURNAL_OWNER,
      mint: journalEvidence,
    }
  }

  function unreadable(
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
    action: string,
  ): Failure | undefined {
    return options.reader === undefined || options.reader(input) ? undefined : denied(action)
  }

  function snapshotOf(execution: Execution): Outcome<ExecutionSnapshot, Failure> {
    const replyAdmissions = admissionProjectionOf(
      admissionScope(execution.tenant, execution.id),
      execution.admissionLedger,
      admissionRule,
    )
    if ('failure' in replyAdmissions) return replyAdmissions
    const unresolved: AgentOperationId[] = []
    for (const record of operations.values()) {
      if (pendingOf(record, execution)) {
        unresolved.push(record.operation)
      }
    }
    const emitted = execution.events.length
    return succeed<ExecutionSnapshot>(
      copy({
        execution: execution.id,
        revision: revisionOf(execution.revision),
        state: stateOf(execution),
        checkpoint: execution.checkpoint,
        inputWatermark: watermarkOf(execution),
        history: journalEvidence(`${execution.id}/history`, execution.revision),
        replyAdmissions: replyAdmissions.ok,
        executionAttachment: activeAttachment(execution)?.authority ?? null,
        unresolved,
        controls: execution.controls,
        results: execution.results.filter(result => finishing(execution) || openResult(result)),
        effects: execution.effects.filter(
          effect => finishing(execution) || openEffect(execution.checkpoint, effect),
        ),
        terminalObservations: execution.observations,
        handoffs: handoffsOf(execution, handoff => custodyOf(execution, handoff)).filter(record =>
          openHandoff(execution, record),
        ),
        finishObligations: currentObligations(execution.finishing) ?? null,
        settlement: settlementOf(execution.finishing),
        output: {
          emittedThrough: emitted === 0 ? null : String(emitted),
          acknowledgedThrough: execution.acknowledged === 0 ? null : String(execution.acknowledged),
        },
      }),
    )
  }

  function stateOf(execution: Execution): ExecutionState {
    if (execution.state.kind !== 'settling') return execution.state
    const intent = intentOf(execution.finishing)
    if (intent === undefined)
      throw new Error('memory Journal defect: a settling execution without a candidate')
    return { kind: 'settling', intent }
  }

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
      return blocked(first.category, judgment.evidence)
    }
    if (candidate.candidate !== judgment.candidate) return { kind: 'changed' }
    return { kind: 'clear' }
  }

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

  function settleRefusal(
    input: Access<P> &
      Readonly<{ execution: AgentExecutionId; authorization: FinishAuthorization }>,
  ): Failure | undefined {
    return input.authorization.kind === 'cancel' && !qualified(input, 'settle')
      ? denied('settle')
      : undefined
  }

  function routeControlFailure(
    route: FinishRoute | undefined,
    authorization: Extract<FinishAuthorization, { kind: 'cancel' }>,
  ): Failure | undefined {
    return route?.kind === 'cancellation' && route.control !== authorization.control
      ? invalid('authorization.control', 'not the control of the current route')
      : undefined
  }

  function kindMismatch(
    candidate: FinishCandidate | undefined,
    authorization: FinishAuthorization,
  ): boolean {
    return (
      candidate !== undefined &&
      (candidate.conclusion.kind === 'cancelled') !== (authorization.kind === 'cancel')
    )
  }

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

  type HandoffApply = (revision: number, evidence: DurableEvidence) => void

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
        if (execution.checkpoint.currentHandoff !== null)
          return fail(invalid('checkpoint.currentHandoff', 'another H holds the pointer'))
        if (!sameValue(pointer, reference))
          return fail(invalid('checkpoint.currentHandoff', 'P points the checkpoint at its H'))
        if (request.predecessor !== input.expected)
          return fail(invalid('handoff', 'the predecessor of P is the expected revision'))
        if (handoffRecord(execution, reference) !== undefined)
          return fail(invalid('handoff', 'the H is already prepared'))
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

  type CandidateVariant = Extract<
    SettlementRequest<P>,
    { kind: 'establish-cancellation' | 'migrate-cancellation' | 'judge-cancellation' }
  >
  type CustodyVariant = Exclude<SettlementRequest<P>, CandidateVariant>

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
        if (
          input.predecessor !== null &&
          !finishing.candidates.some(item => item.candidate === input.predecessor)
        )
          return answer(fail(invalid('predecessor', 'not a candidate of this execution')))
        if ((current?.candidate ?? null) !== input.predecessor)
          return answer(fail({ kind: 'changed' }))
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
        const reference = resolveToolInvocationRef(record.returned.reference, execution.tenant)
        if ('failure' in reference)
          return answer(fail(invalid('source', 'the returned reference is malformed')))
        if (!sameValue(record.intent, input.intent) || !sameEvidence(record.request, input.request))
          return answer(fail(invalid('source', 'not the return of this intent')))
        const effect = execution.effects.find(item => item.action === input.intent.action)
        if (effect === undefined)
          throw new Error('memory Journal defect: the Tool intent was checked before the source')
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
      const key = openKey(input)
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
          checkpoint: copy(input.checkpoint),
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
          admissionKeys: new Map(),
          admissionLedger: originLedger(
            admissionScope(input.tenant, input.execution),
            admissionRule,
            1,
          ),
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
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (input.expected !== revisionOf(execution.revision)) {
          return answer(fail({ kind: 'changed' }))
        }
        if (
          input.finish !== null &&
          input.finish.conclusion.kind !== 'cancelled' &&
          effectiveCancels(execution).length > 0
        )
          return answer(fail({ kind: 'changed' }))
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
        let admission: ModelReplyAdmission | null = null
        if (input.replyAdmission !== null) {
          const fact = input.replyAdmission
          const known = execution.admissionKeys.get(admissionKey(fact))
          const original = known === undefined ? undefined : execution.admissions[known]
          if (original !== undefined && original.fact.decision !== fact.decision) {
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
        if (input.caller.kind !== 'none') {
          const refused = participation<CommandReceipt>(input.caller.kind, () =>
            answer(fail({ kind: 'changed' })),
          )
          if (refused !== undefined) return refused
        }
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
            if (admission !== null) {
              const admitted = admit(
                scope,
                execution.admissionLedger,
                admission,
                revision,
                evidence,
              )
              execution.admissionKeys.set(admissionKey(admission), execution.admissions.length)
              execution.admissions.push(admitted.record)
              execution.admissionLedger = admitted.ledger
            }
            admissionStatistics.checkpointWrites += 1
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
        if (
          ended &&
          !sameFact &&
          fact?.state !== 'reached' &&
          (input.stage === 'intent-established' || input.stage === 'qualification-revoked')
        ) {
          return answer(fail({ kind: 'terminal' }))
        }
        if (!sameFact && fact !== undefined && fact.state === 'reached') {
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
        const fixed = at === undefined ? undefined : operations.get(at)
        if (fixed?.kind === 'excluded')
          return answer(fail(invalid('operation', 'operation-permanently-excluded')))
        const checked = validated(execution)
        if ('failure' in checked) return answer(checked)
        const record = handoffRecord(execution, reference)
        if (record === undefined) throw new Error('recordHandoff: the validated record is missing')
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
            if (execution.state.kind === 'ended' && record.history.kind === 'pending')
              record.history = { kind: 'retained', disposition: execution.state.disposition }
            execution.revision = revision
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
          const current = obligationsOf(execution, candidate, input.operation).items
          if (projectionOf(current) !== projectionOf(list.items)) return changed
          const boundary = execution.watermarks.get(candidate.inputWatermark.record)
          if (boundary === undefined || boundary.to < execution.inputs.length) return changed
          const check = finishCheck(execution, candidate, current, list.items)
          if (check.kind === 'changed') return changed
          if (check.kind === 'blocked') return answer(succeed(check.value))
          if (check.kind === 'unavailable') return answer(fail(damaged(check.diagnostic)))
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

    async readCancellationInstallation(input) {
      const fault = readFault('load')
      if (fault !== undefined) return fault
      const found = owned(input, 'load')
      if ('failure' in found) return found
      const refused = unreadable(input, 'load')
      if (refused !== undefined) return fail(refused)
      return options.cancellation === undefined
        ? fail(damaged('no cancellation policy is installed on this binding'))
        : succeed(copy(options.cancellation.installation.record))
    },

    async load(input) {
      const fault = readFault('load')
      if (fault !== undefined) return fault
      const found = owned(input, 'load')
      if ('failure' in found) return found
      const refused = unreadable(input, 'load')
      if (refused !== undefined) return fail(refused)
      admissionStatistics.loads += 1
      return snapshotOf(found.ok)
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
      const refused = unreadable(input, 'readReplyAdmissions')
      if (refused !== undefined) return fail(refused)
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
      const rejected = receiving.queryQualification(input) ?? unreadable(input, 'query')
      if (rejected) return fail(rejected)
      const fault = readFault('query')
      if (fault !== undefined) return fault
      const execution = executions.get(executionKey(input.tenant, input.execution))
      if (execution !== undefined && !tenantEquals(execution.tenant, input.tenant)) {
        return fail(denied('query'))
      }
      const at = operationKey(input.tenant, input.execution, input.operation)
      const record = at === undefined ? undefined : operations.get(at)
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
    referencedSources(input) {
      const execution = executions.get(executionKey(input.tenant, input.execution))
      if (execution === undefined || !tenantEquals(execution.tenant, input.tenant)) return []
      const sources: DurableEvidence[] = []
      for (const entry of execution.entries)
        if (entry.kind === 'received') sources.push(entry.material)
      for (const effect of execution.effects) sources.push(effect.pending.fixed)
      for (const action of execution.checkpoint.batch?.actions ?? [])
        if (action.judgment.kind === 'allowed') sources.push(action.judgment.request)
      for (const control of execution.controls)
        for (const stage of Object.values(control.stages)) sources.push(stage.source)
      return copy(sources)
    },
    handoffRecords(input) {
      const execution = executions.get(executionKey(input.tenant, input.execution))
      if (execution === undefined || !tenantEquals(execution.tenant, input.tenant)) return []
      return handoffsOf(execution, handoff => custodyOf(execution, handoff))
    },
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
      if (original === undefined) retainedToolInvocationBaselines.set(key, record.toolInvocation)
      execution.controls[index] = { ...record, toolInvocation: MALFORMED_RETAINED_TOOL_INVOCATION }
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
    replyAdmissions: {
      seed(id, count, tenant) {
        const execution = only(id, tenant)
        if (execution === undefined || execution.state.kind === 'ended') return false
        const scope = admissionScope(execution.tenant, execution.id)
        const revision = execution.revision + 1
        for (let index = 0; index < count; index += 1) {
          const sequence = execution.admissionLedger.projection.sequence + 1
          const call = decodeModelCallId(`mcall_seed${String(sequence).padStart(12, '0')}`)
          const action = decodeActionId(`seed-${sequence}/action`)
          if ('failure' in call || 'failure' in action) return false
          const fact: ModelReplyAdmission = {
            step: execution.checkpoint.step,
            action: action.ok,
            call: call.ok,
            resultVersion: 'v1',
            decision: 'admitted',
            source: journalEvidence(`${execution.id}/seed/${sequence}`, revision),
          }
          const publication = nextEvidence(execution, 'commit', revision)
          const admitted = admit(scope, execution.admissionLedger, fact, revision, publication)
          execution.admissionKeys.set(admissionKey(fact), execution.admissions.length)
          execution.admissions.push(admitted.record)
          execution.admissionLedger = admitted.ledger
        }
        execution.revision = revision
        return true
      },
      damage(id, damage, tenant) {
        const execution = only(id, tenant)
        if (execution === undefined) return false
        const next = damagedLedger(execution.admissions, execution.admissionLedger, damage)
        if (next === undefined) return false
        execution.admissions = next.records.filter(
          (record): record is AdmissionRecord => record !== undefined,
        )
        execution.admissionLedger = next.ledger
        return true
      },
      limitPages(limits) {
        pageLimits = { ...limits }
      },
      statistics: () => ({ ...admissionStatistics }),
      changeRule(id, rule, conversion, tenant) {
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
      },
    },
  }

  function only(id: AgentExecutionId, tenant: TenantId | undefined): Execution | undefined {
    const matches = [...executions.values()].filter(
      value => value.id === id && (tenant === undefined || tenantEquals(tenant, value.tenant)),
    )
    return matches.length === 1 ? matches[0] : undefined
  }
}
