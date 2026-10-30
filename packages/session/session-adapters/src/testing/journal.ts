import { pendingCalls } from './pending.ts'
import type { JournalCell } from './root.ts'
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
  CommandReceipt,
  ControlRecord,
  ControlStage,
  EffectIntent,
  EventPage,
  DurableEvidence,
  ExecutionControl,
  ExecutionMutation,
  ExecutionRevision,
  ExecutionSnapshot,
  ExecutionState,
  Failure,
  FinishResult,
  InputBatchId,
  InputId,
  ModelReplyAdmission,
  PendingCall,
  ReplyAdmissionPage,
  ResultResponsibility,
  TerminalObservation,
  Adoption,
  Access,
  AgentJournalEntry,
  AgentReceivedProvider,
} from '@omne-harness/agent-contract'
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
import type { ModelReceptionTargets } from './reception-targets.ts'
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
  | 'tryFinish'
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
}>

export type MemoryAgentJournal<P> = Readonly<{
  port: AgentJournal<P>
  provider: AgentReceivedProvider<P, ContentBlock> & {
    received: NonNullable<AgentReceivedProvider<P, ContentBlock>['received']>
  }
  targets: ModelReceptionTargets<P>
  receiving: JournalReceivingControls<P>
  durability: 'none'

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
  state: ExecutionState
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
  admissions: Readonly<{ sequence: number; fact: ModelReplyAdmission }>[]
  entries: AgentJournalEntry[]
  serial: number
}

type Execution = MemoryExecution

type Committed = Readonly<{
  kind: 'committed'
  key: string
  value: unknown
  receipt: CommandReceipt
}>
type Excluded = Readonly<{ kind: 'excluded'; key: string; evidence: DurableEvidence }>
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
}>
export type OperationRecord = Committed | Rejected | Excluded | Pending

export type Attempt<R> =
  | Readonly<{ kind: 'answer'; value: Outcome<R, Failure> }>
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'write'; value: R; receipt: CommandReceipt; apply: () => void }>
  /** A new operation that recognizes an existing fact: only its index is saved, at the fact's revision. */
  | Readonly<{ kind: 'recognize'; value: R; receipt: CommandReceipt }>
  /** Contradicting evidence: the audit is saved with one new revision and the conflict is fixed. */
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
  if (exactDataFields(fault, ['kind']) && fault.kind === 'malformed') return key
  if (!exactDataFields(fault, ['kind', 'reference']) || fault.kind !== 'foreign-tenant')
    return undefined
  const resolved = resolveToolInvocationRef(fault.reference, input.tenant)
  return 'failure' in resolved && resolved.failure.kind === 'foreign-tenant' ? key : undefined
}

type LocalAttachment = Readonly<{
  kind: 'local'
  reference: ToolOperationRef
  parts: ToolOperationParts
}>
type SuppliedAttachment =
  | LocalAttachment
  | Readonly<{ kind: 'malformed'; reference: ToolOperationRef }>
  | Readonly<{ kind: 'foreign' }>

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

type Attached =
  | Readonly<{ kind: 'unchanged' }>
  | Readonly<{ kind: 'attached'; record: ToolControlRecord }>

const damaged = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: 'AgentJournal',
  diagnostic,
})

function retainedFailure(
  failure: Readonly<{ kind: 'malformed' | 'foreign-tenant' }>,
  diagnostic: string,
): Failure {
  return failure.kind === 'foreign-tenant' ? denied('recordControl') : damaged(diagnostic)
}

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

export function createJournal<P>(
  cell: JournalCell<P>,
  options: MemoryAgentJournalOptions<P> = {},
): MemoryAgentJournal<P> {
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
  const state = () => cell.state().agent
  const caches = new WeakMap<
    Execution,
    {
      batches: Map<InputBatchId, Range>
      watermarks: Map<string, Range>
      admissionThroughs: Map<string, number>
    }
  >()
  const cache = (execution: Execution) => {
    let value = caches.get(execution)
    if (!value) {
      const original = cell.original(execution)
      const prior = original === undefined ? undefined : caches.get(original)
      if (prior) {
        value = {
          batches: new Map(prior.batches),
          watermarks: new Map(prior.watermarks),
          admissionThroughs: new Map(prior.admissionThroughs),
        }
        caches.set(execution, value)
        return value
      }
      value = { batches: new Map(), watermarks: new Map(), admissionThroughs: new Map() }
      for (const event of execution.events)
        if (event.body.kind === 'input-taken') {
          const ordered = event.body.batch.ordered
          const from = execution.inputs.findIndex(input => input.id === ordered[0])
          if (from >= 0) value.batches.set(event.body.batch.id, { from, to: from + ordered.length })
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

  function owned(
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
    action: string,
  ): Outcome<Execution, Failure> {
    const rejected = cell.authorize(input, action)
    if (rejected) return fail(rejected)
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

  /** The receipt of a new operation that recognizes a fact established at `revision`. */
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
    const what = method === 'commit' ? 'commit' : 'result'
    return receiptOf(
      execution,
      input.operation,
      revision,
      nextEvidence(execution, what, revision),
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
      if (caller.kind !== 'none' && options.qualifyParticipation) {
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
            run(method, entered.ok.fault, input, key, prepare, beforeRecognition, decision),
          )
        if (preview.kind === 'unknown')
          return fail({ kind: 'commit-unknown', operation: input.operation })
        const failure = await options.prepareResult(input, method)
        if (failure) return fail(failure)
      }
    }
    return cell.transact(input, method, () =>
      run(method, entered.ok.fault, input, key, prepare, beforeRecognition, decision),
    )
  }

  function enter(
    method: JournalWrite,
    input: Access<P> & Readonly<{ execution: AgentExecutionId }>,
  ): Outcome<Readonly<{ fault: WriteFault | undefined }>, Failure> {
    const fault = writeFaults.get(method)?.shift()
    const refused = cell.authorize(input, method)
    if (refused) return fail(refused)
    const target = state().executions.get(executionKey(input.tenant, input.execution))
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
    decision: JointDecision | null = null,
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
      const found = owned(input, method)
      return 'failure' in found ? found.failure : beforeRecognition()
    }
    const pending = state().operations.get(at)
    if (pending?.kind === 'pending') {
      if (fault !== undefined)
        return fault.kind === 'unavailable' ? scriptedUnavailable : commitUnknown
      const rejected = check()
      if (rejected !== undefined) return fail(rejected)
      return pending.key === key ? commitUnknown : fail(conflict(input.operation))
    }
    const exclude = (reason: string) => {
      const fixed = state().operations.get(at)?.kind
      if (fixed === 'committed' || fixed === 'rejected') return
      cell.touch()
      state().operations.set(at, {
        kind: 'excluded',
        key,
        evidence: journalEvidence(
          `${cell.namespace}/${input.execution}/excluded/${input.operation}/${reason}`,
          0,
        ),
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
        cell.touch()
        state().operations.set(at, {
          kind: 'rejected',
          key,
          failure: prepared.failure,
          audit: prepared.audit,
          revision: revisionOf(prepared.revision),
        })
        return { kind: 'answered', value: fail(prepared.failure) }
      }
      if (prepared.kind === 'write') {
        prepared.apply()
        const captured = cell.committed(input, method, prepared.receipt)
        if (captured) return { kind: 'answered', value: fail(captured) }
        // tryFinish asked the participant before preparing its write (see the port).
        if (method !== 'tryFinish') {
          const participation = cell.participate(input, method, prepared.receipt, decision)
          if (participation !== undefined) return { kind: 'answered', value: fail(participation) }
        }
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
    for (const [key, record] of state().operations) {
      if (!pendingOf(record, execution) || record.key.startsWith('received:')) continue
      state().operations.set(key, {
        kind: 'excluded',
        key: record.key,
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
    const range = taken === null ? undefined : cache(execution).batches.get(taken)
    if (taken !== null && range === undefined)
      throw new Error('original input batch range is unavailable')
    const from = range?.to ?? 0
    return { from, to: execution.inputs.length }
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

  function admissionsThrough(execution: Execution): DurableEvidence {
    const count = execution.admissions.length
    const evidence = journalEvidence(
      `${cell.namespace}/${execution.id}/reply-admissions/${count}`,
      count,
    )
    cache(execution).admissionThroughs.set(evidence.record, count)
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
    for (const record of state().operations.values()) {
      if (pendingOf(record, execution)) {
        unresolved.push(record.operation)
      }
    }
    const emitted = execution.events.length
    return copy({
      execution: execution.id,
      revision: revisionOf(execution.revision),
      state: execution.state,
      checkpoint: execution.checkpoint,
      inputWatermark: watermarkOf(execution),
      history: journalEvidence(`${cell.namespace}/${execution.id}/history`, execution.revision),
      replyAdmissions: {
        through: admissionsThrough(execution),
        rule: admissionRule,
        lastAdmission: last,
        consecutiveDenials: String(consecutive),
        totalDenials: String(total),
      },
      executionAttachment: activeAttachment(execution)?.authority ?? null,
      unresolved,
      controls: execution.controls,
      results: execution.results,
      entries: execution.entries,
      effects: execution.effects,
      terminalObservations: execution.observations,
      output: {
        emittedThrough: emitted === 0 ? null : String(emitted),
        acknowledgedThrough: execution.acknowledged === 0 ? null : String(execution.acknowledged),
      },
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

  function blockedReason(
    execution: Execution,
    operation: AgentOperationId,
    authorization: 'advancement' | 'cancel',
  ): Extract<FinishResult, { kind: 'blocked' }> | undefined {
    const source = (what: string) =>
      journalEvidence(`${cell.namespace}/${execution.id}/blocked/${what}`, execution.revision)
    for (const record of state().operations.values()) {
      if (pendingOf(record, execution) && record.operation !== operation) {
        return { kind: 'blocked', reason: 'operations', source: source(record.operation) }
      }
    }
    for (const control of execution.controls) {
      const stages = Object.values(control.stages)
      if (stages.some(fact => fact?.state === 'unresolved')) {
        return { kind: 'blocked', reason: 'controls', source: source(control.operation) }
      }
    }
    if (
      authorization === 'advancement' &&
      inputBoundary(execution).from < execution.inputs.length
    ) {
      return { kind: 'blocked', reason: 'inputs', source: source('inputs') }
    }
    const custody = execution.results.find(
      item => item.custody === null && item.completion === null,
    )
    if (custody !== undefined) {
      return { kind: 'blocked', reason: 'custody', source: copy(custody.result.source) }
    }
    return undefined
  }

  const port: AgentJournal<P> = {
    // The session-log binding is Agent's coordinated binding (AD-01, PA-04).
    capabilities: Object.freeze({ coordination: 'coordinated' as const, participants }),

    open(input) {
      const key = semanticKey('open', input)
      return write('open', input, key, () => {
        const existing = state().executions.get(executionKey(input.tenant, input.execution))
        if (existing !== undefined && !tenantEquals(existing.tenant, input.tenant)) {
          return answer(fail(denied('open')))
        }
        const original = recognized<{ receipt: CommandReceipt; authority: Authority }>(input, key)
        if (original !== undefined) return answer(original)
        if (existing !== undefined) return answer(fail(conflict(input.operation)))
        if (!grantHolds(input, 'open')) return answer(fail(denied('open')))
        // The Session source (SE13) is co-checked by the participant in the same write; a null
        // source cannot pass it (PA-01 item 1).
        if (input.initial.source === null) return answer(fail(denied('open')))
        const execution: Execution = {
          id: input.execution,
          tenant: input.tenant,
          revision: 1,
          state: { kind: 'advancing' },
          checkpoint: copy(input.checkpoint),
          attachments: [],
          inputs: [copy(input.initial)],
          inputRevisions: new Map([[input.initial.id, 1]]),
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
          entries: [],
          serial: 0,
        }
        const evidence = nextEvidence(execution, 'open', 1)
        const authority: Authority = {
          execution: input.execution,
          executionAttachment: attachmentIdOf(input.execution, 1),
          instance: input.instance,
          generation: '1',
          source: evidence,
        }
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
            state().executions.set(executionKey(input.tenant, input.execution), execution)
            receiving.remember(execution, input.instance)
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
        // The type excludes these bodies; a caller that bypasses it gets invalid (SPEC
        // "AgentJournal.commit" row): `entry` is allocated by the entry ports, `ended` by tryFinish.
        const allocated = input.events.find(
          body => (body.kind as string) === 'entry' || (body.kind as string) === 'ended',
        )
        if (allocated !== undefined)
          return answer(
            fail(invalid('events', `the Journal allocates the ${allocated.kind} event body`)),
          )
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        // Agent SPEC "判定次序与失败映射": stale-advance before terminal, terminal before changed.
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (input.expected !== revisionOf(execution.revision)) {
          return answer(fail({ kind: 'changed' }))
        }
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
          if (
            !fact.step ||
            !fact.action ||
            !fact.call ||
            !fact.resultVersion ||
            !completeEvidence(fact.source)
          )
            return answer(fail(invalid('replyAdmission', 'incomplete original admission')))
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
          semanticKey('checkpoint', execution.checkpoint) ===
            semanticKey('checkpoint', input.checkpoint) &&
          semanticKey('state', execution.state) === semanticKey('state', input.state) &&
          input.events.length === 0 &&
          !newEffect &&
          admission === null &&
          input.caller.kind === 'none'
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
            execution.checkpoint = copy(input.checkpoint)
            receiving.remember(execution, input.authority.instance)
            execution.state = copy(input.state)
            for (const effect of input.effects) {
              if (!execution.effects.some(existing => existing.action === effect.action)) {
                execution.effects.push(copy(effect))
              }
            }
            if (admission !== null) execution.admissions.push(admission)
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
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        const known = execution.inputs.find(accepted => accepted.id === input.value.id)
        if (known !== undefined) {
          // Same input identity with other content conflicts; with the same content a new operation
          // recognizes the original acceptance at its revision (Agent SPEC "输入内容与水位线").
          if (semanticKey('input', known) !== semanticKey('input', input.value)) {
            return answer(fail(conflict(input.operation)))
          }
          const at = execution.inputRevisions.get(known.id) ?? 1
          const receipt = recognition(execution, input.operation, at, 'accepted')
          return recognize(receipt, receipt)
        }
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        // The Session source (SE11) is co-checked by the participant; a null source cannot pass it.
        if (input.value.source === null) return answer(fail(denied('submit')))
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'submit', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'accepted')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            execution.inputs.push(copy(input.value))
            execution.inputRevisions.set(input.value.id, revision)
            execution.revision = revision
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
        // A `through` within the acknowledged prefix recognizes that prefix and never moves it back.
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
          // After a lawful ended only the three late duty stages may be saved (Agent SPEC "六个阶段").
          if (
            ended &&
            !sameFact &&
            (input.stage === 'intent-established' || input.stage === 'qualification-revoked')
          ) {
            return answer(fail({ kind: 'terminal' }))
          }
          if (!sameFact && fact !== undefined && fact.state === 'reached') {
            // Contradicting evidence: the persistent rejection saves an audit with one revision.
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
        }),
      )
    },

    tryFinish(input) {
      const key = semanticKey('tryFinish', input)
      return write('tryFinish', input, key, () => {
        const found = owned(input, 'tryFinish')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<FinishResult>(input, key)
        if (original !== undefined) return answer(original)
        const changed = answer<FinishResult>(
          succeed({ kind: 'changed', revision: revisionOf(execution.revision) }),
        )
        const authorization = input.authorization
        // Agent SPEC "判定次序与失败映射": a superseded advancement is stale-advance before terminal.
        if (authorization.kind === 'advancement' && !holds(execution, authorization.authority))
          return answer(fail({ kind: 'stale-advance' }))
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        const cancels = execution.controls.filter(
          record =>
            record.command.kind === 'cancel' &&
            record.stages['intent-established']?.state === 'reached',
        )
        if (authorization.kind === 'advancement') {
          if (cancels.length > 0) return changed
        } else {
          const cancel = cancels.find(record => record.operation === authorization.control)
          if (cancel === undefined || input.intent.conclusion.kind !== 'cancelled') {
            return answer(fail(denied('tryFinish')))
          }
        }
        if (input.expected !== revisionOf(execution.revision)) return changed
        if (input.intent.beforeTerminal === null)
          return answer(
            fail(invalid('intent.beforeTerminal', 'the terminal passage has not completed')),
          )
        if (
          execution.state.kind === 'settling' &&
          semanticKey('finish-intent', execution.state.intent) !==
            semanticKey('finish-intent', input.intent)
        )
          return changed
        const boundary = cache(execution).watermarks.get(input.intent.inputWatermark.record)
        if (boundary === undefined || boundary.to < execution.inputs.length) return changed
        const blocked = blockedReason(execution, input.operation, authorization.kind)
        if (blocked !== undefined) return answer(succeed(blocked))
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'finish', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        // The Session participant is read-only, so it is asked before the write: its conflict is
        // FinishResult.changed, not a failure (Agent SPEC "条件终结", PA-02).
        const participation = cell.participate(input, 'tryFinish', receipt, null)
        if (participation !== undefined) {
          return participation.kind === 'changed' ? changed : answer(fail(participation))
        }
        const conclusion = copy(input.intent.conclusion)
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
            execution.revision = revision
            appendEvents(
              execution,
              [{ kind: 'ended', conclusion, disposition: evidence }],
              evidence,
            )
          },
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
      const range = cache(execution).watermarks.get(input.watermark.record)
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
      const through = cache(execution).admissionThroughs.get(input.through.record)
      if (
        through === undefined ||
        !sameEvidence(
          input.through,
          journalEvidence(`${cell.namespace}/${execution.id}/reply-admissions/${through}`, through),
        )
      )
        return fail(invalid('through', 'not a range of this execution'))
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
      return succeed({
        kind: 'page',
        through: copy(input.through),
        items: items.map(item => ({ sequence: String(item.sequence), fact: copy(item.fact) })),
        next: complete ? null : String(last),
        complete,
      })
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
    write,
    holds,
    receiptOf,
    nextEvidence,
    projectEntry: (execution, entry, cause) =>
      appendEvents(execution, [{ kind: 'entry', entry }], cause),
    ...(options.custodian === undefined ? {} : { custodian: options.custodian }),
  })
  return {
    port,
    provider: { journal: port, ...receiving.ports },
    targets: receiving.targets,
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
        const reference =
          input.fault.kind === 'malformed'
            ? MALFORMED_RETAINED_TOOL_INVOCATION
            : input.fault.reference
        if (original === undefined) retainedToolInvocationBaselines.set(key, record.toolInvocation)
        execution.controls[index] = { ...record, toolInvocation: reference }
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
            state().operations.set(key, {
              kind: 'excluded',
              key: record.key,
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
  }
}
