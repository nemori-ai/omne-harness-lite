// The production Agent Journal provider on the Session log (AG-07, AD-01): the Agent records of
// one session live in the `execution-record` participant of the session's transaction domain, and
// the Journal provider is itself the committer of the first publication point (P5, split X).
//
// The Agent rules (the decision order, recognition, revisions, the finishing protocol) are the
// Journal core of this member, the same one the `./testing` double runs. Per session the provider
// keeps the core over an in-process root that is a disposable copy of the durable records: before
// each call it compares the publication count of the session with the one its copy reflects and
// rebuilds the copy from storage when they differ. A write prepares the next state in the copy;
// the provider then commits that state, the index rows and the derived Session participation in
// one storage commit. Only a committed receipt makes the answer of the call; any other result
// discards the copy, so the next call starts from the durable records.
import { createHash, randomUUID } from 'node:crypto'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  AgentReceivedProvider,
  CallerCommit,
  CommandReceipt,
  DurableEvidence,
  ExecutionMutation,
  Failure,
} from '@omne-harness/agent-contract'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  commandDigest,
  deriveDriveOperation,
  deriveSessionOperation,
  judgeCompletion,
  mutationAccessRequest,
  type ConsumptionId,
  type InputId,
  type SessionAccessCheck,
  type SessionCommand,
  type SessionFailure,
  type SessionId,
  type SessionLogConsequence,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  SESSION_HISTORY_ROOT_HANDLER,
  SESSION_PROTOCOL,
  SESSION_WORK_HANDLER,
  decodeExecutionRecordReply,
  decodeExecutionRecordState,
  decodeSessionHistoryRoot,
  decodeSessionReply,
  decodeSessionWork,
  executionRecordFacts,
  sessionCheckFacts,
  sessionCommandFacts,
  type ExecutionAdmissionRecord,
  type ExecutionBatchRecord,
  type ExecutionBoundaryRecord,
  type ExecutionFactRecord,
  type SessionCheck,
} from '@omne-harness/session-storage-sql/participants'
import type {
  DomainRef,
  FactCommandV2,
  JsonValue,
  ReadRequest,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { commitJournal, standingOf, type JournalCombination } from '../journal-commit.ts'
import {
  participationAccessFailure,
  participationFailure,
  type ParticipationMethod,
} from '../participation-mapping.ts'
import { canonical } from '../testing/canonical.ts'
import {
  HistoryFailure,
  captureEventOriginal,
  normalizeAgentEvent,
  normalizedResult,
} from '../testing/history.ts'
import {
  createJournal,
  operationText,
  outrunParticipation,
  type JointDecision,
  type JournalWrite,
  type MemoryAgentJournalOptions,
  type MemoryExecution,
} from '../testing/journal.ts'
import { JOURNAL_OWNER } from '../testing/journal-values.ts'
import {
  createCell,
  operationSemantic,
  type CommonRoot,
  type JournalCell,
} from '../testing/root.ts'
import {
  emptyNotes,
  encodeState,
  eventKey,
  recordsOf,
  stateOf,
  type DurableAgentRecords,
  type DurableJournalState,
  type InterpretationNotes,
} from './journal-state.ts'

export type SessionLogJournalOptions<P> = Readonly<{
  storage: SqlStorage
  /** The trusted lookup of the tenant's transaction domain; it never registers a tenant. */
  tenantDomainLookup: TenantDomainLookup
  /** Decides each derived Session participation as the Session operation it is (P6). */
  sessionAccessCheck: SessionAccessCheck<P>
  /** The combination version and manifest digest of the Session log combination. */
  combination: JournalCombination
  cancellation?: MemoryAgentJournalOptions<P>['cancellation']
  hostRecords?: MemoryAgentJournalOptions<P>['hostRecords']
}>

export type SessionLogJournalProvider<P> = AgentReceivedProvider<P, ContentBlock> & {
  received: NonNullable<AgentReceivedProvider<P, ContentBlock>['received']>
}

type Scratch = {
  checks: SessionCheck[]
  commands: SessionCommand[]
  snapshot: WorkSnapshot | null
}

type Copy<P> = Readonly<{
  cell: JournalCell<P>
  core: ReturnType<typeof createJournal<P>>
  /** The interpretation notes of the durable state the copy reflects. */
  notes: InterpretationNotes
}>

type CustodyAttempt =
  MemoryExecution['custodyAttempts'] extends Map<infer _Operation, infer Attempt> ? Attempt : never

/**
 * A write of this process whose storage outcome stayed unknown. The durable records know nothing
 * of it until the storage decides, so the provider keeps what the call left and puts it back into
 * every copy it rebuilds: while the storage has not decided, the operation is pending in the copy
 * (a `query` answers unknown and the finishing list of its execution carries an unknown operation
 * item); once the storage proves the generation never ran, it is excluded, with the custody
 * attempt the write had reached. A committed generation needs no entry: the durable records hold it.
 */
type Held = {
  readonly execution: AgentExecutionId
  readonly operation: AgentOperationId
  /** The record key the Journal core gave the write: it tells a retry of it from another write. */
  readonly key: string
  readonly storageOperation: string
  readonly attempt: number
  /** The custody attempt of a recordHandoff that reached the write step; its chain needs it. */
  readonly custody: CustodyAttempt | null
  standing: 'unknown' | 'excluded'
}

type Book<P> = {
  readonly tenant: TenantId
  readonly tenantText: string
  readonly session: SessionId
  copy: Copy<P> | null
  /** The publication count the copy reflects; null when the copy must be rebuilt. */
  published: string | null
  scratch: Scratch | null
  queue: Promise<unknown>
  /** The unknown writes of this process, by the Journal core's operation key. */
  readonly held: Map<string, Held>
}

const PARTICIPANTS = ['message', 'context-transition', 'custody', 'processed'] as const
/**
 * The rounds one call may redo itself when its publication loses a race (a revision or publication
 * count conflict, or a recalled operation). A fixed policy of this provider, not a configuration:
 * four lost races in a row is a session under contention that a fifth round does not help, and the
 * call then answers `unavailable` (session-adapters SPEC, "生产提供者的实现现状" step 6).
 */
const ROUNDS = 4
/** The calls that only read: they need no Session snapshot for the advance check. */
const READS: ReadonlySet<string> = new Set([
  'load',
  'readCancellationInstallation',
  'inputs',
  'readReplyAdmissions',
  'query',
  'output.read',
  'materials.read',
  'received.query',
])
const OWNER = 'session-log-journal'

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})

type OpenInput<P> = Parameters<AgentJournal<P>['open']>[0]
type AttachInput<P> = Parameters<AgentJournal<P>['attach']>[0]

/** The storage operation of one Agent operation of one execution. */
function storageOperation(execution: string, operation: string): string {
  return `aop_${createHash('sha256')
    .update(JSON.stringify([execution, operation]))
    .digest('hex')
    .slice(0, 40)}`
}

/** What a write of `method` changed: its execution, operation and semantic digest. */
type Written = Readonly<{
  method: string
  execution: string | null
  operation: string | null
  digest: string
}>

/**
 * A material preserve names an execution only as its route (K-9): it writes the session's received
 * state and never that execution's records, so it is not a write of the execution.
 */
const ROUTE_ONLY: ReadonlySet<string> = new Set(['preserve'])

function writtenOf(method: string, input: object): Written {
  const value = input as { execution?: unknown; operation?: unknown }
  return {
    method,
    execution:
      typeof value.execution === 'string' && !ROUTE_ONLY.has(method) ? value.execution : null,
    operation: typeof value.operation === 'string' ? value.operation : null,
    digest: `sha256:${operationSemantic(input as ExecutionMutation<unknown>)}`,
  }
}

function changedExecutions(before: CommonRoot, after: CommonRoot): MemoryExecution[] {
  const out: MemoryExecution[] = []
  for (const [key, value] of after.agent.executions)
    if (before.agent.executions.get(key) !== value) out.push(value)
  return out
}

function receiptOf(answer: Outcome<unknown, Failure>): CommandReceipt | null {
  if (!('ok' in answer) || typeof answer.ok !== 'object' || answer.ok === null) return null
  const value = answer.ok as Record<string, unknown>
  const receipt = 'receipt' in value ? value['receipt'] : value
  return typeof receipt === 'object' &&
    receipt !== null &&
    'evidence' in receipt &&
    'revision' in receipt
    ? (receipt as CommandReceipt)
    : null
}

/** What of the copy is durable: a pending operation is a held write, not data (see `Held`). */
function durableRecords(root: CommonRoot): DurableAgentRecords {
  const records = recordsOf(root)
  return {
    ...records,
    operations: new Map([...records.operations].filter(([, record]) => record.kind !== 'pending')),
  }
}

/**
 * The Session consequences of one event as the shared normalization of the memory reference gives
 * them, from the original fragments of the same root; null when the fragments do not decide them
 * (a control event, an original that this root does not hold). Nothing is invented for a null.
 */
function consequencesOf(
  root: CommonRoot,
  execution: MemoryExecution,
  event: MemoryExecution['events'][number],
): readonly SessionLogConsequence[] | null {
  try {
    return normalizeAgentEvent(root, execution, event)
  } catch (error) {
    if (error instanceof HistoryFailure || error instanceof TypeError) return null
    throw error
  }
}

/** The placeholder head of an execution that another execution's call changed (SPEC K-5). */
function placeholderHead(execution: MemoryExecution): DurableEvidence {
  return {
    owner: OWNER,
    record: `${execution.id}/head`,
    revision: String(execution.revision),
    digest: 'unknown',
  }
}

/**
 * The same-root index rows of the executions a write changed (AD-02 table, Agent side). The kinds
 * of each new event are the kinds of its normalized consequences, and `notes` takes the same
 * consequences and the head the boundary names, so a later interpretation reads what the index
 * says. An event whose consequences the fragments do not decide has empty kinds.
 */
function indexOf(
  before: CommonRoot,
  after: CommonRoot,
  changed: readonly MemoryExecution[],
  receipt: CommandReceipt | null,
  notes: InterpretationNotes,
): Readonly<{
  boundaries: ExecutionBoundaryRecord[]
  facts: ExecutionFactRecord[]
  batches: ExecutionBatchRecord[]
}> {
  const boundaries: ExecutionBoundaryRecord[] = []
  const facts: ExecutionFactRecord[] = []
  const batches: ExecutionBatchRecord[] = []
  for (const execution of changed) {
    const prior = [...before.agent.executions.values()].find(item => item.id === execution.id)
    const fresh = execution.events.slice(prior?.events.length ?? 0)
    for (const event of fresh) {
      if (event === undefined) continue
      const consequences = consequencesOf(after, execution, event)
      notes.consequences.set(eventKey(execution.id, event.sequence), consequences)
      facts.push({
        execution: execution.id,
        sequence: event.sequence,
        source: event.cause,
        kinds: consequences?.map(item => item.kind) ?? [],
      })
      if (event.body.kind === 'input-taken')
        batches.push({
          execution: execution.id,
          sequence: event.sequence,
          source: event.cause,
          batch: encodeState(event.body.batch),
        })
    }
    const head = receipt?.execution === execution.id ? receipt.evidence : null
    notes.heads.set(execution.id, head)
    const last = execution.events.at(-1)
    boundaries.push({
      execution: execution.id,
      revision: String(execution.revision),
      receipt: head ?? placeholderHead(execution),
      emittedThrough: String(execution.events.length),
      ended:
        last !== undefined && last.body.kind === 'ended'
          ? { sequence: last.sequence, source: last.cause }
          : null,
    })
  }
  return { boundaries, facts, batches }
}

/**
 * Captures the original fragments of the events that one write of `execution` appended, with the
 * write's receipt, as the memory double does in its commit hook. A fragment that cannot be read is
 * left out, not the write: the event's consequences are then not decided, and its fact row says so
 * with empty kinds.
 */
function captureFresh(root: CommonRoot, execution: string, receipt: CommandReceipt): void {
  const found = [...root.agent.executions.values()].find(item => item.id === execution)
  if (found === undefined) return
  const old = root.agent.indexedEvents.get(execution) ?? 0
  for (const event of found.events.slice(old)) {
    try {
      captureEventOriginal(root, found, event, receipt)
    } catch (error) {
      if (!(error instanceof HistoryFailure || error instanceof TypeError)) throw error
    }
  }
  root.agent.indexedEvents.set(execution, found.events.length)
}

/**
 * The tenant text and session that a material source of this provider names, or null for a source
 * it did not make. The Journal core makes every material source (a `materials.preserve` and the
 * material of a `received` commit) with `journalEvidence`: its record is a canonical array that
 * opens with the namespace of the session's cell, the JSON text `[tenant, session]`, and the kind
 * of the material.
 */
export function materialSessionOf(
  source: DurableEvidence,
): Readonly<{ tenant: string; session: SessionId }> | null {
  if (source.owner !== JOURNAL_OWNER) return null
  const head = /^\["((?:[^"\\]|\\.)*)","(?:material|received-material)",/u.exec(source.record)
  if (head === null) return null
  let namespace: unknown
  try {
    namespace = JSON.parse(JSON.parse(`"${head[1]}"`) as string)
  } catch {
    return null
  }
  if (!Array.isArray(namespace) || namespace.length !== 2) return null
  const [tenant, session] = namespace as unknown[]
  return typeof tenant === 'string' && typeof session === 'string'
    ? { tenant, session: session as SessionId }
    : null
}

/** One event of an execution with what its interpretation commits (AD-02). */
export type InterpretableEvent = Readonly<{
  sequence: string
  source: DurableEvidence
  /** The normalized consequences, the same the fact row's kinds name; null: not decided. */
  consequences: readonly SessionLogConsequence[] | null
}>

/**
 * One execution of a session's durable Agent records as AD-02 interprets it: its head revision, the
 * head receipt its boundary row names (null: the placeholder, which the Session side answers
 * `unavailable` for), and its events after a sequence, all from one read of one publication.
 */
export type ExecutionInterpretation = Readonly<{
  revision: string
  head: DurableEvidence | null
  emittedThrough: string
  events: readonly InterpretableEvent[]
}>

export type InterpretationRead =
  | Readonly<{ kind: 'read'; execution: ExecutionInterpretation | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Reads the events of one execution after `after` from the durable Agent records of its session,
 * with the consequences and the head the same publication wrote beside its index rows. `null`
 * execution: the session's records hold no such execution. It reads only; it never writes.
 */
export async function readExecutionInterpretation(
  options: Readonly<{ storage: SqlStorage; tenantDomainLookup: TenantDomainLookup }>,
  target: Readonly<{ tenant: TenantId; session: SessionId; execution: string; after: string }>,
): Promise<InterpretationRead> {
  const unread = (diagnostic: string): InterpretationRead => ({ kind: 'unavailable', diagnostic })
  const text = tenantCodec.encode(target.tenant)
  if (!text.ok) return unread('the tenant was not minted by legal-identity')
  let result
  try {
    const found = await options.tenantDomainLookup.lookup({ tenant: text.value })
    if (found.kind !== 'ready')
      return unread(
        found.kind === 'unregistered' ? 'the tenant has no transaction domain' : found.diagnostic,
      )
    result = await options.storage.read({
      domain: found.domain,
      handler: EXECUTION_RECORD_HANDLERS.state,
      protocol: EXECUTION_RECORD_PROTOCOL,
      requestKey: randomUUID(),
      input: { tenant: text.value, session: target.session },
    })
  } catch (error) {
    return unread(`the read of the Agent records threw: ${String(error)}`)
  }
  if (result.kind !== 'read') return unread('the Agent records of the session are not readable')
  const state = decodeExecutionRecordState(result.output)
  if (state === null) return unread('the Agent records of the session do not decode')
  if (state.state === null) return { kind: 'read', execution: null }
  let records: DurableJournalState
  try {
    records = stateOf(state.state)
  } catch (error) {
    return unread(`the Agent records do not decode: ${String(error)}`)
  }
  const execution = [...records.executions.values()].find(item => item.id === target.execution)
  if (execution === undefined) return { kind: 'read', execution: null }
  const events = execution.events.slice(Number(target.after)).map(event => ({
    sequence: event.sequence,
    source: event.cause,
    consequences: records.notes.consequences.get(eventKey(execution.id, event.sequence)) ?? null,
  }))
  return {
    kind: 'read',
    execution: {
      revision: String(execution.revision),
      head: records.notes.heads.get(execution.id) ?? null,
      emittedThrough: String(execution.events.length),
      events,
    },
  }
}

export function createSessionLogJournal<P>(options: SessionLogJournalOptions<P>) {
  const books = new Map<string, Book<P>>()

  function bookOf(tenant: TenantId, session: SessionId): Book<P> | null {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) return null
    const key = JSON.stringify([text.value, session])
    let book = books.get(key)
    if (book === undefined) {
      book = {
        tenant,
        tenantText: text.value,
        session,
        copy: null,
        published: null,
        scratch: null,
        queue: Promise.resolve(),
        held: new Map(),
      }
      books.set(key, book)
    }
    return book
  }

  /** Runs `task` after every earlier task of the same book: one writer per session in-process. */
  function serial<T>(book: Book<P>, task: () => Promise<T>): Promise<T> {
    const run = book.queue.then(task, task)
    book.queue = run.catch(() => undefined)
    return run
  }

  async function domainOf(book: Book<P>): Promise<Outcome<DomainRef, Failure>> {
    let found
    try {
      found = await options.tenantDomainLookup.lookup({ tenant: book.tenantText })
    } catch (error) {
      return fail(unavailable(`tenant domain lookup threw: ${String(error)}`))
    }
    // An unregistered tenant is not registered here; nothing is written (assembly page :307).
    return found.kind === 'ready'
      ? succeed(found.domain)
      : fail(
          unavailable(
            found.kind === 'unregistered'
              ? 'the tenant has no transaction domain'
              : found.diagnostic,
          ),
        )
  }

  async function read(domain: DomainRef, handler: string, protocol: string, input: JsonValue) {
    const request: ReadRequest = { domain, handler, protocol, requestKey: randomUUID(), input }
    const result = await options.storage.read(request)
    return result.kind === 'read' ? result.output : null
  }

  /** The Session snapshot the `advances` check of this call reads. */
  async function snapshotOf(book: Book<P>, domain: DomainRef): Promise<WorkSnapshot | null> {
    const output = await read(domain, SESSION_WORK_HANDLER, SESSION_PROTOCOL, {
      tenant: book.tenantText,
      session: book.session,
    })
    const work = output === null ? null : decodeSessionWork(output)
    return work?.kind === 'state' ? work.snapshot : null
  }

  function participation(
    book: Book<P>,
    cell: JournalCell<P>,
    input: ExecutionMutation<P>,
    method: JournalWrite,
    receipt: CommandReceipt,
    decision: JointDecision | null,
  ): Failure | undefined {
    const scratch = book.scratch
    if (scratch === null) return unavailable('a participation outside a provider call')
    const scope = { tenant: book.tenant, session: book.session, execution: input.execution }
    switch (method) {
      case 'open': {
        const value = input as OpenInput<P>
        const entry = value.original.entry
        const initial = entry.kind === 'invoke' ? entry.initial : entry.value
        if (value.runtime.grant === null || initial.source === null)
          return { kind: 'denied', action: 'open' }
        scratch.checks.push({
          ...scope,
          kind: 'open',
          grant: value.runtime.grant,
          initial: {
            input: String(initial.id) as InputId,
            origin: initial.source,
            message: initial.content,
          },
        })
        return undefined
      }
      case 'attach': {
        const value = input as AttachInput<P>
        if (value.grant === null) return { kind: 'denied', action: 'attach' }
        scratch.checks.push({ ...scope, kind: 'attach', grant: value.grant })
        return undefined
      }
      case 'submit': {
        const value = (input as Parameters<AgentJournal<P>['submit']>[0]).value
        if (value.source === null) return { kind: 'denied', action: 'submit' }
        scratch.checks.push({
          ...scope,
          kind: 'submit',
          value: {
            input: String(value.id) as InputId,
            origin: value.source,
            message: value.content,
          },
        })
        return undefined
      }
      case 'tryFinish': {
        const value = input as Parameters<AgentJournal<P>['tryFinish']>[0]
        const conclusion = value.intent.conclusion.kind
        scratch.checks.push({
          ...scope,
          kind: 'finish',
          conclusion: conclusion === 'fail' ? 'failed' : conclusion,
          control:
            value.authorization.kind === 'cancel' ? String(value.authorization.control) : null,
        })
        return undefined
      }
      default:
        break
    }
    const derived = jointCommand(book, cell, input, method, receipt)
    if (derived === undefined) return undefined
    if ('failure' in derived) return derived.failure
    if (decision === null) return unavailable('participation without a current Session decision')
    if (decision.digest !== commandDigest(derived.ok)) return outrunParticipation
    scratch.commands.push(derived.ok)
    return undefined
  }

  /** The Session command one `commit` or `recordResult` derives from its caller (AD-01 table). */
  function jointCommand(
    book: Book<P>,
    cell: JournalCell<P>,
    input: ExecutionMutation<P>,
    method: JournalWrite,
    receipt: CommandReceipt,
  ): Outcome<SessionCommand, Failure> | undefined {
    let caller: CallerCommit = { kind: 'none' }
    if (method === 'commit') caller = (input as Parameters<AgentJournal<P>['commit']>[0]).caller
    if (method === 'recordResult')
      caller = (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
    if (caller.kind === 'none') return undefined
    const operation = deriveSessionOperation({
      kind: 'participation',
      execution: input.execution,
      operation: input.operation,
      joint: caller.kind,
    })
    const common = { tenant: book.tenant, session: book.session, operation }
    const participation = {
      execution: input.execution,
      operation: input.operation,
      joint: caller.kind,
      written: receipt.revision,
      handover: receipt.evidence,
    }
    switch (caller.kind) {
      case 'message':
        return succeed({
          kind: 'recordMessage',
          input: {
            ...common,
            participation,
            value: {
              message: caller.message,
              source: caller.source,
              admission: caller.admission,
              consumption: null,
            },
          },
        })
      case 'context-transition':
        if (caller.value.message.role !== 'compaction')
          return fail({ kind: 'invalid', field: 'caller.value.message', reason: 'not compaction' })
        return succeed({
          kind: 'commitDerived',
          input: {
            ...common,
            participation,
            value: { kind: 'compaction', message: caller.value.message },
            judgment: caller.admission,
          },
        })
      case 'custody':
      case 'processed': {
        const root = cell.state()
        const execution = [...root.agent.executions.values()].find(
          item => item.id === input.execution,
        )
        if (execution === undefined) return fail({ kind: 'denied', action: method })
        let result
        try {
          result = normalizedResult(root, execution, caller.consumption, caller.result).result
        } catch (error) {
          return fail(unavailable(error instanceof Error ? error.message : 'original result'))
        }
        const consumption = String(caller.consumption) as ConsumptionId
        return succeed(
          caller.kind === 'custody'
            ? {
                kind: 'preserveResult',
                input: { ...common, participation, consumption, result, custody: caller.retained },
              }
            : {
                kind: 'completeConsumption',
                input: {
                  ...common,
                  participation,
                  completion: { consumption, result, completion: caller.completion },
                },
              },
        )
      }
    }
  }

  /** P6: the derived participation is decided as the Session operation it is, once per call. */
  async function qualify(
    book: Book<P>,
    cell: JournalCell<P>,
    input: ExecutionMutation<P>,
    method: 'commit' | 'recordResult',
    receipt: CommandReceipt,
  ): Promise<Outcome<JointDecision, Failure>> {
    const derived = jointCommand(book, cell, input, method, receipt)
    if (derived === undefined)
      return fail(unavailable('qualification of a write without participation'))
    if ('failure' in derived) return derived
    const request = mutationAccessRequest(
      { principal: input.principal, tenant: input.tenant, session: book.session },
      derived.ok,
    )
    let decision
    try {
      decision = await options.sessionAccessCheck.check(request)
    } catch (error) {
      return fail(unavailable(`the access check threw: ${String(error)}`))
    }
    if (decision.kind !== 'allowed') return fail(participationAccessFailure(decision, method))
    return succeed({ evidence: decision.evidence, digest: commandDigest(derived.ok) })
  }

  /** The terminal condition of the Session participant for a cancellation judgment (AD-01). */
  function terminalParticipant(
    book: Book<P>,
    cell: JournalCell<P>,
    execution: AgentExecutionId,
    control: string,
  ) {
    const unread = {
      owner: OWNER,
      record: `${book.tenantText}/${book.session}/participant/unread`,
      revision: '0',
      digest: 'unread',
    }
    const fact = (source: typeof unread, condition: { kind: 'ready' | 'changed' | 'unknown' }) => ({
      owner: 'session',
      protocol: {
        owner: '@omne-harness/session-contract',
        name: 'pa-02-terminal-participation',
        revision: '1',
        digest: 'session-log:pa-02',
      },
      source,
      version: source,
      condition,
      purpose: {
        owner: OWNER,
        record: `${cell.namespace}/participant/judge-cancellation`,
        revision: '0',
        digest: 'purpose',
      },
    })
    const snapshot = book.scratch?.snapshot ?? null
    if (snapshot === null) return fact(unread, { kind: 'unknown' })
    const judged = judgeCompletion(snapshot, execution)
    switch (judged.kind) {
      case 'allowed':
        return fact(unread, { kind: 'ready' })
      case 'blocked':
        return fact(unread, { kind: 'unknown' })
      case 'terminal':
        return fact(judged.terminal.evidence, { kind: 'changed' })
      case 'cancelled': {
        // The cancel control of this Run as the snapshot records it; SE26 refers to that control.
        const cancels = snapshot.controls.filter(
          item => item.intent.kind === 'control' && item.intent.value.kind === 'cancel-run',
        )
        const own = cancels.length === 1 ? cancels[0] : undefined
        const matches =
          own !== undefined &&
          deriveDriveOperation({ kind: 'control', execution, control: own.operation }) === control
        return fact(judged.terminal.evidence, { kind: matches ? 'ready' : 'changed' })
      }
    }
  }

  /**
   * The open or attach of an ordinary grant: the attempt it names is the advance of the active Run
   * of this execution, and the check in the same commit verifies it. A cancel wind-down attachment
   * has none.
   */
  function rememberAuthority(book: Book<P>, cell: JournalCell<P>, input: ExecutionMutation<P>) {
    const snapshot = book.scratch?.snapshot ?? null
    const root = cell.state()
    const execution = [...root.agent.executions.values()].find(item => item.id === input.execution)
    const authority = execution?.attachments.at(-1)?.authority
    if (
      authority === undefined ||
      snapshot === null ||
      snapshot.run.kind !== 'active' ||
      snapshot.run.advance === null ||
      snapshot.run.execution.execution !== input.execution
    )
      return
    const grant =
      'runtime' in input ? (input as OpenInput<P>).runtime.grant : (input as AttachInput<P>).grant
    root.agent.authorities.set(`${input.execution}\0${canonical(authority)}`, {
      run: snapshot.run.run,
      attempt: snapshot.run.advance.attempt,
      execution: input.execution,
      ordinal: snapshot.run.ordinal,
      started: grant ?? receiptStub(input.execution),
    })
  }

  /** Fills a new root with the durable state of the session. */
  function restore(cell: JournalCell<P>, records: DurableJournalState): void {
    cell.mutate(() => {
      const root = cell.state()
      const into = <K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>) => {
        for (const [key, value] of source) target.set(key, value)
      }
      into(root.agent.executions, records.executions)
      into(root.agent.operations, records.operations)
      root.agent.jointFacts.push(...records.jointFacts)
      into(root.agent.authorities, records.authorities)
      into(root.agent.eventReceipts, records.eventReceipts)
      into(root.agent.pendingEvents, records.pendingEvents)
      into(root.agent.callOrigins, records.callOrigins)
      into(root.agent.human, records.human)
      into(root.agent.indexedEvents, records.indexedEvents)
      // A state written before the fragments were kept: its events are not captured again with a
      // later receipt; their fragments stay absent.
      for (const execution of root.agent.executions.values())
        if (!root.agent.indexedEvents.has(execution.id))
          root.agent.indexedEvents.set(execution.id, execution.events.length)
      for (const name of Object.keys(records.receiving) as (keyof CommonRoot['receiving'])[])
        into(
          root.receiving[name] as Map<unknown, unknown>,
          records.receiving[name] as Map<unknown, unknown>,
        )
      cell.touch()
    })
  }

  function build(book: Book<P>, state: JsonValue | null): Copy<P> {
    const cell: JournalCell<P> = createCell<P>(book.tenant, book.session, {
      authorize: () => undefined,
      advances(execution, authority): boolean {
        const snapshot = book.scratch?.snapshot ?? null
        if (snapshot === null || snapshot.run.kind !== 'active' || snapshot.run.advance === null)
          return false
        if (snapshot.run.execution.execution !== execution) return false
        const attempt = cell.state().agent.authorities.get(`${execution}\0${canonical(authority)}`)
        return attempt?.attempt === snapshot.run.advance.attempt
      },
      participate: (input, method, receipt, decision) =>
        participation(book, cell, input, method, receipt, decision),
      committed(input, method, receipt) {
        if (method === 'open' || method === 'attach') rememberAuthority(book, cell, input)
        captureFresh(cell.state(), input.execution, receipt)
        return undefined
      },
    })
    let notes = emptyNotes()
    if (state !== null) {
      const records = stateOf(state)
      restore(cell, records)
      notes = records.notes
    }
    putBack(book, cell)
    const core = createJournal<P>(cell, {
      participants: PARTICIPANTS,
      grant: () => true,
      qualifyParticipation: (input, method, receipt) => qualify(book, cell, input, method, receipt),
      terminalParticipant: input => terminalParticipant(book, cell, input.execution, input.control),
      ...(options.cancellation === undefined ? {} : { cancellation: options.cancellation }),
      ...(options.hostRecords === undefined ? {} : { hostRecords: options.hostRecords }),
    })
    return { cell, core, notes }
  }

  /** Puts the held writes back into a rebuilt copy, unless the durable records already decided them. */
  function putBack(book: Book<P>, cell: JournalCell<P>): void {
    if (book.held.size === 0) return
    cell.mutate(() => {
      const root = cell.state()
      for (const [at, held] of book.held) {
        if (root.agent.operations.has(at)) continue
        // The reference core keeps the custody attempt of a write while it is pending and after it
        // is excluded, so the custody chain of the H goes on from it in both cases.
        if (held.custody !== null) {
          const execution = [...root.agent.executions.values()].find(
            item => item.id === held.execution,
          )
          execution?.custodyAttempts.set(held.operation, held.custody)
        }
        if (held.standing === 'unknown') {
          root.agent.operations.set(at, {
            kind: 'pending',
            key: held.key,
            tenant: book.tenant,
            execution: held.execution,
            operation: held.operation,
            // The storage, not the copy, decides a held write; there is nothing to run or drop here.
            run: () => undefined,
          })
          continue
        }
        const record = `${cell.namespace}/${held.execution}/excluded/${held.operation}/dropped`
        root.agent.operations.set(at, {
          kind: 'excluded',
          key: held.key,
          evidence: {
            owner: OWNER,
            record,
            revision: '0',
            digest: `sha256:${createHash('sha256').update(record).digest('hex')}`,
          },
        })
      }
      cell.touch()
    })
  }

  /**
   * Asks the storage about each held write that is still undecided. True when one of them turned
   * out excluded, so the cached copy, which still holds it as pending, must be rebuilt.
   */
  async function settleHeld(book: Book<P>, domain: DomainRef): Promise<boolean> {
    let changed = false
    for (const [at, held] of book.held) {
      if (held.standing !== 'unknown') continue
      const standing = await standingOf(
        options.storage,
        domain,
        held.storageOperation,
        held.attempt,
      )
      if (standing === 'committed') book.held.delete(at)
      else if (standing === 'not-run') {
        held.standing = 'excluded'
        changed = true
      }
    }
    return changed
  }

  const receiptStub = (execution: string) => ({
    owner: OWNER,
    record: `${execution}/grant`,
    revision: '0',
    digest: 'none',
  })

  /** Brings the copy of `book` to the durable records of its session. */
  async function sync(book: Book<P>, domain: DomainRef): Promise<Outcome<Copy<P>, Failure>> {
    const rootOutput = await read(domain, SESSION_HISTORY_ROOT_HANDLER, SESSION_PROTOCOL, {
      tenant: book.tenantText,
      session: book.session,
    })
    const root = rootOutput === null ? null : decodeSessionHistoryRoot(rootOutput)
    if (root === null) return fail(unavailable('the common root of the session is not readable'))
    const excluded = await settleHeld(book, domain)
    if (!excluded && book.copy !== null && book.published === root.published)
      return succeed(book.copy)
    const stateOutput = await read(
      domain,
      EXECUTION_RECORD_HANDLERS.state,
      EXECUTION_RECORD_PROTOCOL,
      {
        tenant: book.tenantText,
        session: book.session,
      },
    )
    const state = stateOutput === null ? null : decodeExecutionRecordState(stateOutput)
    if (state === null)
      return fail(unavailable('the Agent records of the session are not readable'))
    try {
      book.copy = build(book, state.state)
    } catch (error) {
      book.copy = null
      return fail(unavailable(`the Agent records do not decode: ${String(error)}`))
    }
    book.published = state.published
    return succeed(book.copy)
  }

  type Settled<T> =
    | Readonly<{ kind: 'answer'; value: Outcome<T, Failure> }>
    | Readonly<{ kind: 'again' }>

  function participationOf(method: string): ParticipationMethod | null {
    return method === 'open' ||
      method === 'attach' ||
      method === 'submit' ||
      method === 'tryFinish' ||
      method === 'commit' ||
      method === 'recordResult'
      ? method
      : null
  }

  /** Keeps the write the call prepared in its copy, whose storage outcome stayed unknown. */
  function hold(
    book: Book<P>,
    after: CommonRoot,
    written: Written,
    operation: AgentOperationId,
    storageOperation: string,
    attempt: number,
  ): void {
    if (written.execution === null) return
    const at = operationText(book.tenantText, written.execution as AgentExecutionId, operation)
    const record = after.agent.operations.get(at)
    if (record === undefined) return
    const execution = [...after.agent.executions.values()].find(
      item => item.id === written.execution,
    )
    book.held.set(at, {
      execution: written.execution as AgentExecutionId,
      operation,
      key: record.key,
      storageOperation,
      attempt,
      custody: execution?.custodyAttempts.get(operation) ?? null,
      standing: 'unknown',
    })
  }

  /**
   * The reverse input directory rows of an open or a submit: the accepted input, its original grant
   * and attachment, and the original attempt of that attachment as the commit hook of the open or
   * attach recorded it. An attachment without a recorded attempt has none; nothing is guessed from
   * the current advance.
   */
  function admissionsOf(
    after: CommonRoot,
    written: Written,
    own: MemoryExecution | undefined,
    receipt: CommandReceipt | null,
    scratch: Scratch,
  ): ExecutionAdmissionRecord[] {
    if ((written.method !== 'open' && written.method !== 'submit') || own === undefined) return []
    if (receipt === null) return []
    const check = scratch.checks[0]
    const input =
      check?.kind === 'open'
        ? check.initial.input
        : check?.kind === 'submit'
          ? check.value.input
          : null
    const attachment = own.attachments.at(-1)?.authority
    if (input === null || attachment === undefined) return []
    const original = after.agent.authorities.get(`${own.id}\0${canonical(attachment)}`)
    return [
      {
        input,
        execution: own.id,
        operation: written.operation ?? '',
        accepted: receipt.evidence,
        grant: check?.kind === 'open' ? check.grant : receipt.evidence,
        attachment: attachment.executionAttachment,
        ...(original === undefined ? {} : { attempt: original.attempt }),
      },
    ]
  }

  async function publish<T>(
    book: Book<P>,
    domain: DomainRef,
    copy: Copy<P>,
    before: CommonRoot,
    after: CommonRoot,
    written: Written,
    scratch: Scratch,
    answer: Outcome<T, Failure>,
  ): Promise<Settled<T>> {
    // From here on the copy holds an unpublished state: whatever happens, rebuild it next time.
    const published = book.published ?? '0'
    book.copy = null
    book.published = null
    const changed = changedExecutions(before, after)
    const own = changed.find(item => item.id === written.execution) ?? changed[0]
    const prior =
      own === undefined
        ? undefined
        : [...before.agent.executions.values()].find(item => item.id === own.id)
    const receipt = receiptOf(answer)
    const notes: InterpretationNotes = {
      heads: new Map(copy.notes.heads),
      consequences: new Map(copy.notes.consequences),
    }
    const index = indexOf(before, after, changed, receipt, notes)
    const admissions = admissionsOf(after, written, own, receipt, scratch)
    const execution = written.execution ?? own?.id ?? '-'
    const operation = storageOperation(
      execution,
      `${written.method}\0${written.operation ?? randomUUID()}`,
    )
    let facts: FactCommandV2[]
    try {
      facts = [
        executionRecordFacts({
          tenant: book.tenant,
          session: book.session,
          execution,
          expected: prior === undefined ? null : String(prior.revision),
          revision: own === undefined ? '0' : String(own.revision),
          published,
          operation,
          digest: written.digest,
          answer: encodeState(answer),
          state: encodeState({ ...durableRecords(after), notes }),
          ...index,
          admissions,
        }),
        ...scratch.checks.map(check => sessionCheckFacts(check)),
        ...scratch.commands.map(command => sessionCommandFacts(command, [])),
      ]
    } catch (error) {
      return {
        kind: 'answer',
        value: fail(unavailable(`the Agent records are not durable data: ${String(error)}`)),
      }
    }
    if (scratch.checks.length + scratch.commands.length > 1)
      return {
        kind: 'answer',
        value: fail(unavailable('more than one Session participation in one write')),
      }
    const outcome = await commitJournal({
      storage: options.storage,
      domain,
      combination: options.combination,
      operation,
      commands: facts,
    })
    // A write without an Agent operation (the material port) has no identity to name or to recall
    // by: wherever an answer would name one, it is `unavailable`, never an invented identity.
    const agentOperation = written.operation as AgentOperationId | null
    const nameless = (what: string): Settled<T> => ({
      kind: 'answer',
      value: fail(unavailable(`${what} of a write without an Agent operation`)),
    })
    switch (outcome.kind) {
      case 'committed': {
        const entry = outcome.receipt.responses.find(
          item => item.participant === 'execution-record',
        )
        const reply = entry === undefined ? null : decodeExecutionRecordReply(entry.reply)
        if (reply?.kind !== 'published')
          return {
            kind: 'answer',
            value: fail(unavailable('a committed receipt without the Agent records')),
          }
        if (outcome.recalled)
          // An earlier generation committed this operation: the durable records answer it.
          return reply.digest === written.digest
            ? { kind: 'again' }
            : agentOperation === null
              ? nameless('a conflict')
              : { kind: 'answer', value: fail({ kind: 'conflict', operation: agentOperation }) }
        book.copy = { ...copy, notes }
        book.published = reply.published
        // What the copy holds is now durable: an excluded write, and one the Journal core fenced.
        for (const at of book.held.keys()) {
          const record = after.agent.operations.get(at)
          if (record !== undefined && record.kind !== 'pending') book.held.delete(at)
        }
        return { kind: 'answer', value: answer }
      }
      case 'rolled-back': {
        const stop = outcome.receipt.responses.at(-1)
        if (stop === undefined)
          return {
            kind: 'answer',
            value: fail(unavailable('a rolled back receipt without a reply')),
          }
        if (stop.participant === 'execution-record') {
          const reply = decodeExecutionRecordReply(stop.reply)
          switch (reply.kind) {
            case 'revision-conflict':
              return { kind: 'again' }
            case 'operation-conflict':
              if (reply.digest === written.digest) return { kind: 'again' }
              return agentOperation === null
                ? nameless('a conflict')
                : { kind: 'answer', value: fail({ kind: 'conflict', operation: agentOperation }) }
            default:
              return {
                kind: 'answer',
                value: fail(unavailable(`the Agent records were not saved: ${reply.kind}`)),
              }
          }
        }
        const reply = decodeSessionReply(stop.reply)
        const method = participationOf(written.method)
        switch (reply.kind) {
          case 'stopped':
            return {
              kind: 'answer',
              value: fail(
                method === null || agentOperation === null
                  ? unavailable('a Session stop without a participation')
                  : participationFailure(
                      method,
                      reply.failure as SessionFailure,
                      agentOperation,
                      scratch.commands[0]?.kind,
                    ),
              ),
            }
          case 'unsupported':
            return { kind: 'answer', value: fail({ kind: 'unsupported' }) }
          default:
            return {
              kind: 'answer',
              value: fail(unavailable(`the Session participant failed: ${JSON.stringify(reply)}`)),
            }
        }
      }
      case 'unknown': {
        if (agentOperation === null) return nameless('an unknown outcome')
        hold(book, after, written, agentOperation, operation, outcome.attempt)
        return {
          kind: 'answer',
          value: fail({ kind: 'commit-unknown', operation: agentOperation }),
        }
      }
      case 'unavailable':
        return { kind: 'answer', value: fail(unavailable(outcome.diagnostic)) }
    }
  }

  async function perform<T>(
    book: Book<P>,
    method: string,
    input: object,
    call: (core: Copy<P>['core']) => Promise<Outcome<T, Failure>>,
  ): Promise<Outcome<T, Failure>> {
    return serial(book, async () => {
      const domain = await domainOf(book)
      if ('failure' in domain) return domain
      for (let round = 0; round < ROUNDS; round += 1) {
        const synced = await sync(book, domain.ok)
        if ('failure' in synced) return synced
        const copy = synced.ok
        const scratch: Scratch = {
          checks: [],
          commands: [],
          snapshot: READS.has(method) ? null : await snapshotOf(book, domain.ok),
        }
        book.scratch = scratch
        const before = copy.cell.current()
        let answer: Outcome<T, Failure>
        try {
          answer = await call(copy.core)
        } finally {
          book.scratch = null
        }
        const after = copy.cell.current()
        if (after === before) return answer
        const written = writtenOf(method, input)
        const settled = await publish(
          book,
          domain.ok,
          copy,
          before,
          after,
          written,
          scratch,
          answer,
        )
        if (settled.kind === 'answer') return settled.value
      }
      return fail(unavailable('the Agent records of the session kept changing'))
    })
  }

  function forSession(
    scope: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): SessionLogJournalProvider<P> {
    const book = bookOf(scope.tenant, scope.session)
    const refused = (action: string): Failure => ({ kind: 'denied', action })
    const run = <T>(
      input: { tenant: TenantId },
      method: string,
      call: (core: Copy<P>['core']) => Promise<Outcome<T, Failure>>,
    ) => {
      if (book === null || !tenantCodec.encode(input.tenant).ok)
        return Promise.resolve(fail<Failure>(refused(method)))
      return perform(book, method, input, call)
    }
    const journal: AgentJournal<P> = {
      capabilities: { coordination: 'coordinated', participants: new Set(PARTICIPANTS) },
      open: input => run(input, 'open', core => core.port.open(input)),
      attach: input => run(input, 'attach', core => core.port.attach(input)),
      detach: input => run(input, 'detach', core => core.port.detach(input)),
      commit: input => run(input, 'commit', core => core.port.commit(input)),
      submit: input => run(input, 'submit', core => core.port.submit(input)),
      control: input => run(input, 'control', core => core.port.control(input)),
      acknowledge: input => run(input, 'acknowledge', core => core.port.acknowledge(input)),
      recordResult: input => run(input, 'recordResult', core => core.port.recordResult(input)),
      recordControl: input => run(input, 'recordControl', core => core.port.recordControl(input)),
      recordHandoff: input => run(input, 'recordHandoff', core => core.port.recordHandoff(input)),
      prepareFinish: input => run(input, 'prepareFinish', core => core.port.prepareFinish(input)),
      tryFinish: input => run(input, 'tryFinish', core => core.port.tryFinish(input)),
      commitSettlement: input =>
        run(input, 'commitSettlement', core => core.port.commitSettlement(input)),
      recordTerminalObservation: input =>
        run(input, 'recordTerminalObservation', core => core.port.recordTerminalObservation(input)),
      readCancellationInstallation: input =>
        run(
          input,
          'readCancellationInstallation',
          async core =>
            (await core.port.readCancellationInstallation?.(input)) ??
            fail(unavailable('the Journal core holds no cancellation installation read')),
        ),
      load: input => run(input, 'load', core => core.port.load(input)),
      inputs: input => run(input, 'inputs', core => core.port.inputs(input)),
      readReplyAdmissions: input =>
        run(input, 'readReplyAdmissions', core => core.port.readReplyAdmissions(input)),
      query: input => run(input, 'query', core => core.port.query(input)),
      output: {
        read: input => run(input, 'output.read', core => core.port.output.read(input)),
        async *events(input) {
          if (book === null || !tenantCodec.encode(input.tenant).ok) {
            yield fail<Failure>(refused('output.events'))
            return
          }
          // Brought to the durable records first; the stream then reads the in-process copy.
          const copy = await serial(book, async () => {
            const domain = await domainOf(book)
            if ('failure' in domain) return domain
            return sync(book, domain.ok)
          })
          if ('failure' in copy) {
            yield copy
            return
          }
          yield* copy.ok.core.port.output.events(input)
        },
      },
    }
    return {
      journal,
      entries: {
        record: input => run(input, 'record', core => core.provider.entries.record(input)),
      },
      materials: {
        preserve: input => run(input, 'preserve', core => core.provider.materials.preserve(input)),
        read: input => run(input, 'materials.read', core => core.provider.materials.read(input)),
      },
      received: {
        commit: input => run(input, 'received', core => core.provider.received.commit(input)),
        query: input => run(input, 'received.query', core => core.provider.received.query(input)),
      },
    }
  }

  return { forSession, durability: 'storage' as const }
}
