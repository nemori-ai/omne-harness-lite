// The memory `AgentJournal`: a single-process, non-durable Journal provider for tests. It follows
// the same-shape list of docs/architecture/mechanisms.md "两种实现必须同形的事实" (facts 1 to 15), so
// the tests written against it carry over to a durable provider. Every write runs synchronously
// between two awaits, which makes one write atomic and gives all writes of the process one order.
// Nothing survives the process, and fencing holds only inside it.
//
// Three choices wait for #558 (AGENT-M04). Each is marked "临时做法，待 #558 裁定" where it is made:
// M04-4 (which writes advance the revision), M04-5 (`recordResult.transfer` without a declared
// participant) and M04-7 (`open` appends no event). Writes that no contract type carries yet
// (final request record, backoff and next check instants; M04-2) are not implemented.
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
  ExecutionSnapshot,
  ExecutionState,
  Failure,
  FinishResult,
  InputBatchId,
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
  | 'tryFinish'
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

/** A joint commit that the participant saved together with the Journal's own facts. */
export type JointFact = Readonly<{
  execution: AgentExecutionId
  operation: AgentOperationId
  caller: Exclude<CallerCommit, { kind: 'none' }>
}>

type Qualification<P, X> = (input: Access<P> & X) => boolean

export type MemoryAgentJournalOptions<P> = Readonly<{
  /** Explicitly enables retained invocation corruption controls. Default: false. */
  retainedToolInvocationFaults?: boolean
  /** The joint-commit kinds whose participant this provider declares. Default: none. */
  participants?: Iterable<JointCommitKind>
  /**
   * Whether a non-null grant of `open` or `attach` holds. Default: no grant holds, because an
   * assembly without an external coordinator has no participant that can check one.
   */
  grant?: Qualification<P, Readonly<{ execution: AgentExecutionId; grant: DurableEvidence }>>
  /** Whether `open` and `attach` need a non-null grant. Default: `false`. */
  requireGrant?: boolean
  /** Whether the caller of `recordResult` or `received` is the lawful custodian or processor. Default: yes. */
  custodian?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>
  /** Whether the caller of `recordTerminalObservation` may observe and record. Default: yes. */
  observer?: Qualification<P, Readonly<{ execution: AgentExecutionId }>>
  /** The largest `limit` that `read` accepts. Default: 100. */
  readLimit?: number
  /** The schema of every event that this Journal writes. */
  eventSchema?: Adoption
  /** The rule of the reply-admission projection. */
  replyAdmissionRule?: Adoption
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
  /** Queues how the participant of `kind` answers the next joint commit. Default: participate. */
  respond(kind: JointCommitKind, response: ParticipantResponse): void
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
   * Applies the retention policy to one execution: drops the acknowledged events. Unacknowledged
   * events are kept, as SPEC "终态后与 ended" requires. Returns how many events were dropped.
   */
  applyRetention(execution: AgentExecutionId, tenant?: TenantId): number
}>

type Attachment = {
  authority: Authority
  status: 'active' | 'detached' | 'superseded'
  handoff: DurableEvidence | null
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
  batches: Map<InputBatchId, Range>
  watermarks: Map<string, Range>
  /** Every event ever written; those before `retainedFrom` are dropped by retention. */
  events: AgentEvent[]
  retainedFrom: number
  acknowledged: number
  controls: ControlRecord[]
  results: ResultResponsibility[]
  effects: EffectIntent[]
  observations: TerminalObservation[]
  /** The receipt that first recorded each control stage fact, by target and stage. */
  stageReceipts: Map<string, CommandReceipt>
  /** The receipt of the first registration of each post-terminal observation. */
  observed: Map<TerminalObservation['passage'], CommandReceipt>
  admissions: Readonly<{ sequence: number; fact: ModelReplyAdmission }>[]
  admissionThroughs: Map<string, number>
  entries: AgentJournalEntry[]
  serial: number
  waiters: Set<() => void>
}

type Execution = MemoryExecution

type Committed = Readonly<{
  kind: 'committed'
  key: string
  value: unknown
  receipt: CommandReceipt
}>
type Excluded = Readonly<{ kind: 'excluded'; key: string; evidence: DurableEvidence }>
type Pending = Readonly<{
  kind: 'pending'
  key: string
  tenant: TenantId
  execution: AgentExecutionId
  operation: AgentOperationId
  run: () => void
}>
export type OperationRecord = Committed | Excluded | Pending

/** The outcome of preparing one write: either an answer without a write, or a write to apply. */
export type Attempt<R> =
  | Readonly<{ kind: 'answer'; value: Outcome<R, Failure> }>
  /** A declared participant could not tell whether its part held; nothing is saved yet. */
  | Readonly<{ kind: 'unknown' }>
  | Readonly<{ kind: 'write'; value: R; receipt: CommandReceipt; apply: () => void }>

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
const denied = (action: string): Failure => ({ kind: 'denied', action })
const conflict = (operation: AgentOperationId): Failure => ({ kind: 'conflict', operation })
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
  owner: 'AgentJournal',
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

/** Creates an empty memory Journal. Each call has its own records; nothing is shared. */
export function createMemoryAgentJournal<P>(
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
  const executions = new Map<string, Execution>()
  const executionKey = (tenant: TenantId, id: AgentExecutionId) => {
    const encoded = tenantCodec.encode(tenant)
    return JSON.stringify([encoded.ok ? encoded.value : null, id])
  }
  const operations = new Map<string, OperationRecord>()
  const writeFaults = new Map<JournalWrite, WriteFault[]>()
  const readFaults = new Map<JournalRead, number>()
  const responses = new Map<JointCommitKind, ParticipantResponse[]>()
  const jointFacts: JointFact[] = []

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
    if (record?.kind !== 'committed') return undefined
    // The record of this operation was written by the same method, whose key starts with its name,
    // so its value has the type R of that method.
    return record.key === key ? succeed(copy(record.value) as R) : fail(conflict(input.operation))
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
    if (attachment === undefined) return
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
  ): Promise<Outcome<R, Failure>> {
    const entered = enter(method, input)
    if ('failure' in entered) return entered
    return run(method, entered.ok.fault, input, key, prepare, beforeRecognition)
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
      if (operations.get(at)?.kind === 'committed') return
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
      prepared.apply()
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
      if (operations.get(at)?.kind === 'committed') return
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

  function grantHolds(
    input: Access<P> & Readonly<{ execution: AgentExecutionId; grant: DurableEvidence | null }>,
  ): boolean {
    if (input.grant === null) return options.requireGrant !== true
    if (options.grant === undefined) return false
    return options.grant({
      principal: input.principal,
      tenant: input.tenant,
      execution: input.execution,
      grant: input.grant,
    })
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
      state: execution.state,
      checkpoint: execution.checkpoint,
      inputWatermark: watermarkOf(execution),
      history: journalEvidence(`${execution.id}/history`, execution.revision),
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

  /**
   * The first responsibility of its own that the Journal sees still open, in the order operations,
   * controls, inputs, custody; `undefined` when none is. SPEC "条件终结" names the reasons but not
   * every condition; where it is not precise, the stricter (blocking) reading is taken.
   *
   * - operations: a write of this execution is still pending (listed in `unresolved`).
   * - controls: an applicable stage of a control is recorded `unresolved`. 临时做法，待 #558 裁定。
   * - inputs: an ordinary end leaves accepted inputs that no taken batch covers. A cancel keeps its
   *   unprocessed inputs with their original owner (SPEC "条件终结"), so it is not blocked by them.
   *   临时做法，待 #558 裁定。
   * - custody: a result has neither custody nor completion evidence.
   *
   * passages is not checked: whether the before-terminal passages are complete and bound to this
   * candidate is a fact of the coordinator, not of the Journal's own records. 临时做法，待 #558 裁定。
   */
  function blockedReason(
    execution: Execution,
    operation: AgentOperationId,
    authorization: 'advancement' | 'cancel',
  ): Extract<FinishResult, { kind: 'blocked' }> | undefined {
    const source = (what: string) =>
      journalEvidence(`${execution.id}/blocked/${what}`, execution.revision)
    for (const record of operations.values()) {
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

  // ------------------------------------------------------------------------------------------
  // The port

  const port: AgentJournal<P> = {
    capabilities: Object.freeze({ participants }),

    open(input) {
      const key = semanticKey('open', input)
      return write('open', input, key, () => {
        const existing = executions.get(executionKey(input.tenant, input.execution))
        if (existing !== undefined && !tenantEquals(existing.tenant, input.tenant)) {
          return answer(fail(denied('open')))
        }
        const original = recognized<{ receipt: CommandReceipt; authority: Authority }>(input, key)
        if (original !== undefined) return answer(original)
        // Another operation already opened this execution identity: same identity, other input.
        if (existing !== undefined) return answer(fail(conflict(input.operation)))
        if (!grantHolds(input)) return answer(fail(denied('open')))
        const execution: Execution = {
          id: input.execution,
          tenant: input.tenant,
          revision: 1,
          state: { kind: 'advancing' },
          checkpoint: copy(input.checkpoint),
          attachments: [],
          inputs: [copy(input.initial)],
          batches: new Map(),
          watermarks: new Map(),
          events: [],
          retainedFrom: 1,
          acknowledged: 0,
          controls: [],
          results: [],
          effects: [],
          observations: [],
          stageReceipts: new Map(),
          observed: new Map(),
          admissions: [],
          admissionThroughs: new Map(),
          entries: [],
          serial: 0,
          waiters: new Set(),
        }
        const evidence = nextEvidence(execution, 'open', 1)
        const authority: Authority = {
          execution: input.execution,
          executionAttachment: attachmentIdOf(input.execution, 1),
          instance: input.instance,
          generation: '1',
          source: evidence,
        }
        execution.attachments.push({ authority, status: 'active', handoff: null })
        const receipt = receiptOf(execution, input.operation, 1, evidence, 'applied')
        // 临时做法，待 #558 裁定（M04-7）：open 不追加事件。SPEC 逐操作表的 Journal.open、attach 行写
        // 事件为无，open 也没有事件输入；第一个事件来自之后的一次提交。
        return {
          kind: 'write',
          value: { receipt, authority },
          receipt,
          apply: () => {
            executions.set(executionKey(input.tenant, input.execution), execution)
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
        if (!grantHolds(input)) return answer(fail(denied('attach')))
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
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
            execution.attachments.push({ authority, status: 'active', handoff: null })
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
        if (target.handoff !== null) return answer(succeed(copy(target.handoff)))
        // Without business qualification, detach only recognizes an existing handoff.
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
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        if (!holds(execution, input.authority)) return answer(fail({ kind: 'stale-advance' }))
        if (input.expected !== revisionOf(execution.revision)) {
          return answer(fail({ kind: 'changed' }))
        }
        for (const effect of input.effects) {
          const known = execution.effects.find(existing => existing.action === effect.action)
          if (
            known !== undefined &&
            semanticKey('effect', known) !== semanticKey('effect', effect)
          ) {
            return answer(fail(conflict(input.operation)))
          }
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
        // 临时做法，待 #558 裁定（M04-4）：每次成功写入都推进 revision。
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
      return write('submit', input, key, () => {
        const found = owned(input, 'submit')
        if ('failure' in found) return answer(found)
        const execution = found.ok
        const original = recognized<CommandReceipt>(input, key)
        if (original !== undefined) return answer(original)
        if (execution.state.kind === 'ended') return answer(fail({ kind: 'terminal' }))
        const known = execution.inputs.find(accepted => accepted.id === input.value.id)
        if (known !== undefined) {
          // Fact 8: the same input identity with the same content is the original acceptance.
          if (semanticKey('input', known) !== semanticKey('input', input.value)) {
            return answer(fail(conflict(input.operation)))
          }
        }
        // 临时做法，待 #558 裁定（M04-4）：按原操作幂等的记录成功写入时也推进 revision。
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'submit', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'accepted')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            if (known === undefined) execution.inputs.push(copy(input.value))
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
        const target = controlTarget(input.command, execution.checkpoint.calls, execution.tenant)
        if ('failure' in target) return answer(target)
        // 临时做法，待 #558 裁定（M04-4）：按原操作幂等的记录成功写入时也推进 revision。
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
            // 临时做法，待 #558 裁定（M04-1 的读法）：按 SPEC「六个阶段」把受理这一阶段事实投影为
            // control 事件。
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
        // 临时做法，待 #558 裁定（M04-4）：按原操作幂等的记录成功写入时也推进 revision。
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'acknowledge', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            // A lower `through` recognizes the acknowledged prefix and never moves it back.
            execution.acknowledged = Math.max(execution.acknowledged, through)
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
        // 临时做法，待 #558 裁定（M04-5）：transfer 为 custody 或 processed 时，未声明对应参加者也由
        // 提供者自行建立保管或完成依据（SPEC「提交与保管」、上下文页交接清单第 3 项）。
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
        // 临时做法，待 #558 裁定（M04-4）：按原操作幂等的记录成功写入时也推进 revision。
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'result', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        const responsibility: ResultResponsibility = {
          result: copy(input.result),
          consumption: input.consumption,
          custody,
          completion,
          release: copy(input.release),
        }
        return {
          kind: 'write',
          value: receipt,
          receipt,
          apply: () => {
            const index = execution.results.indexOf(known ?? responsibility)
            if (index === -1) execution.results.push(responsibility)
            else execution.results[index] = responsibility
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
          // SPEC "六个阶段": the same stage fact without a new reference recognizes the first receipt;
          // it is not recorded twice.
          const first = execution.stageReceipts.get(stageKey)
          if (first !== undefined) return answer(succeed(copy(first)))
        }
        if (!sameFact && fact !== undefined && fact.state === 'reached') {
          return answer(fail(conflict(input.operation)))
        }
        // 临时做法，待 #558 裁定（M04-4）：按原操作幂等的记录成功写入时也推进 revision。
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'record-control', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
        const ended = execution.state.kind === 'ended'
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
            // 临时做法，待 #558 裁定：ended 之后 recordControl 照常记录阶段事实，但不投影事件，因为
            // ended 事件是 execution 的最后一个事件（SPEC「条件终结」「终态后与 ended」）。
            if (ended || sameFact) return
            // 临时做法，待 #558 裁定（M04-1 的读法）：按 SPEC「六个阶段」把阶段事实投影为 control 事件。
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
        if (execution.state.kind === 'ended') return changed
        const authorization = input.authorization
        const cancels = execution.controls.filter(
          record =>
            record.command.kind === 'cancel' &&
            record.stages['intent-established']?.state === 'reached',
        )
        if (authorization.kind === 'advancement') {
          if (!holds(execution, authorization.authority))
            return answer(fail({ kind: 'stale-advance' }))
          // An effective cancel takes precedence over an ordinary end.
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
        const boundary = execution.watermarks.get(input.intent.inputWatermark.record)
        if (boundary === undefined || boundary.to < execution.inputs.length) return changed
        const blocked = blockedReason(execution, input.operation, authorization.kind)
        if (blocked !== undefined) return answer(succeed(blocked))
        const revision = execution.revision + 1
        const evidence = nextEvidence(execution, 'finish', revision)
        const receipt = receiptOf(execution, input.operation, revision, evidence, 'applied')
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
          // Fact 12: the same value recognizes the first registration.
          const first = execution.observed.get(input.passage)
          if (first !== undefined) return answer(succeed(copy(first)))
        }
        // 临时做法，待 #558 裁定（M04-4）：按原操作幂等的记录成功写入时也推进 revision。
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
      return succeed({
        kind: 'page',
        through: copy(input.through),
        items: items.map(item => ({ sequence: String(item.sequence), fact: copy(item.fact) })),
        next: complete ? null : String(last),
        complete,
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
    project: (execution, entry, cause) =>
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
