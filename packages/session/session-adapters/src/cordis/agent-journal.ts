// The production Agent Journal provider on the Session log (AG-07, AD-01, R2-D292): the Agent
// facts of one session are the second append-only family of the Session log, in the
// `execution-record` participant of the session's transaction domain, and the Journal provider is
// itself the committer of the first publication point (P5, split X).
//
// The Agent rules (the decision order, recognition, revisions, the finishing protocol) are the
// Journal core of this member, the same one the `./testing` double runs. Per session the provider
// keeps one view folded from the facts (`../journal`), one head position, and the core over a
// disposable in-process copy built from that view. Before each call it reads the publication count
// of the session: equal to its head, it reads nothing; behind, it reads the batches after its head
// and folds them (K-20 is a range read); without a head it reads the open executions and their
// facts (the cold start). A write prepares the next state in the copy; the provider then appends
// one batch: the envelope, the facts of this write and the content blocks they name, with the head
// rows and the derived Session participation, in one storage commit. No answer is stored: the
// answer of an operation is derived from its batch. A publication the storage did not commit
// leaves the copy to be rebuilt from the facts.
//
// K-23 end state (R2-D347 to R2-D349): the core appends the batches of the fact family; the
// reader records of a copy (`MemoryExecution`, the operation records, the event fragments and
// the receiving state) are projected from the fold and the blocks (`../testing/journal-records`),
// never stored beside the facts. A row of the former `core.*` bridge does not decode (malformed).
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
  ExecutionRevision,
  Failure,
  FinishResult,
  ModelReceptionTargets,
  ToolReceptionTargets,
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
  type SessionControlEvidence,
  type SessionLogConsequence,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  EXECUTION_BATCH_MAX_FACTS,
  SESSION_HISTORY_ROOT_HANDLER,
  SESSION_PROTOCOL,
  decodeExecutionRecordReply,
  decodeSessionHistoryRoot,
  decodeSessionReply,
  executionRecordBlobFacts,
  executionRecordFacts,
  readCachedSessionWork,
  registerSessionWorkIndex,
  sessionCheckFacts,
  sessionCommandFacts,
  type ExecutionAdmissionRecord,
  type ExecutionBlobRecord,
  type ExecutionBoundaryRecord,
  type ExecutionFactRecord,
  type SessionCheck,
} from '@omne-harness/session-storage-sql/participants'
import type {
  DomainRef,
  FactCommandV2,
  JsonValue,
  SqlStorage,
  TenantDomainLookup,
} from '@omne-harness/sql-contract'
import {
  commitJournal,
  jointSessionWork,
  refusalFailure,
  standingOf,
  type GenerationMemory,
  type JournalCombination,
} from '../journal-commit.ts'
import {
  BATCH_OVERHEAD_BYTES,
  FACT_MAX_BYTES,
  batchBytes,
  contentPath,
  emptySessionView,
  fold,
  receiptOf as batchReceiptOf,
  type BatchEnvelope,
  type ExecutionView,
  type ParticipationKind,
  type PublishedBatch,
  type RequestView,
  type SessionJournalView,
} from '../journal/index.ts'
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
  DEFAULT_EVENT_SCHEMA,
  DEFAULT_REPLY_ADMISSION_RULE,
  createJournal,
  operationText,
  outrunParticipation,
  type JointDecision,
  type JournalWrite,
  type MemoryAgentJournalOptions,
  type MemoryExecution,
} from '../testing/journal.ts'
import { JOURNAL_OWNER, revisionOf } from '../testing/journal-values.ts'
import { controlEventEvidence } from '../testing/control.ts'
import {
  createCell,
  operationSemantic,
  type CommonRoot,
  type JournalCell,
} from '../testing/root.ts'
import {
  blobRowDigest,
  coreBlobRows,
  factDigestOf,
  type DerivedFact,
  type EventProjection,
} from './journal-batch.ts'
import {
  projectExecution,
  projectRecords,
  type ProjectedRecords,
  type ProjectionContext,
} from '../testing/journal-records.ts'
import {
  readBatches,
  readBlob,
  readColdStart,
  readEvents,
  readOperation,
  readOutput,
  readerOf,
  type ReadBatch,
  type Reader,
} from './journal-read.ts'
import { attemptOfAuthority, attemptOfGrant } from './attempt-grant.ts'

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
  /**
   * Called with a diagnostic for a programming error (a `TypeError`) that the Journal read past
   * while it normalized an event: the event is then left undecided, as for a missing original, and
   * the Agent write keeps its answer. The owner logs it at error level.
   */
  fault?: Fault
  /**
   * Called once for each publication the provider sent to the storage, after the storage answered:
   * the bytes of its commands and the outcome. An `unavailable` or `commit-unknown` outcome carries
   * the diagnostic the call answers with, so a write that the storage refused is visible to the
   * owner (it logs it). A throw is swallowed: the report never changes the answer of the call.
   */
  report?: (report: JournalPublicationReport) => void
}>

/** The channel a defect that the Journal went on past is reported through. */
type Fault = (diagnostic: string) => void

/**
 * One publication of the Agent records (SPEC "发布观测"): who wrote, the UTF-8 bytes of the
 * commands it sent, what of them is the batch and what the blocks, and how the storage answered.
 */
export type JournalPublicationReport = Readonly<{
  /** The tenant text of the session. */
  tenant: string
  session: SessionId
  /** The execution of the write; `-` for a write that names none. */
  execution: string
  /** The Agent operation of the write; null for a write without one (the material port). */
  operation: string | null
  /** The storage operation of the commit. */
  storageOperation: string
  /** The Journal method of the write. */
  method: string
  /** The bytes of the `execution-record` command (the one the storage limits by `maxCommandBytes`). */
  recordBytes: number
  /** The bytes of every command of the commit. */
  bytes: number
  /** The bytes of the batch's own facts: the envelope and the fact bodies, without the blocks. */
  batchBytes: number
  /** The bytes of the content blocks the commit carries. */
  blobBytes: number
  /** How many facts the batch holds, the envelope included. */
  facts: number
  /**
   * `committed`: this call committed it; `recalled`: an earlier generation did; `rolled-back`: a
   * participant stopped it; `commit-unknown`: its outcome is not known; `unavailable`: the storage
   * refused it before accepting it.
   */
  outcome: 'committed' | 'recalled' | 'rolled-back' | 'commit-unknown' | 'unavailable'
  /** The diagnostic of a `commit-unknown` or `unavailable` outcome; null otherwise. */
  diagnostic: string | null
}>

/** The UTF-8 bytes of the JSON text of a command. */
const commandBytes = (command: FactCommandV2): number =>
  Buffer.byteLength(JSON.stringify(command), 'utf8')

export type SessionLogJournalProvider<P> = AgentReceivedProvider<P, ContentBlock> & {
  received: NonNullable<AgentReceivedProvider<P, ContentBlock>['received']>
  /**
   * The original consumption bindings of this session's executions (agent-contract J02 item 1):
   * the bindings that the committed PendingCalls established, kept in the session's Agent records
   * after the checkpoint dropped the call or the attachment ended.
   */
  targets: ModelReceptionTargets<P>
  /** The same bindings of the associated Tool calls (R2-D273). */
  toolTargets: ToolReceptionTargets<P>
}

/**
 * The request that the last main-purpose M0 of the session recorded (FIXED-FACTS F4), read from
 * the `request.adopted` fact of the latest adoption and its record block. `order` is the
 * publication of that fact: the adoption order of the session is the publication order.
 */
export type AdoptedPart = Readonly<{
  order: string
  execution: string
  reference: string
  fixed: DurableEvidence
  coverage: DurableEvidence | null
  schema: RequestView['schema']
  record: JsonValue
}>

/** What the adopted request read gives: the request, none, or why it could not be read. */
export type AdoptedRead =
  | Readonly<{ kind: 'value'; value: AdoptedPart | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type Scratch = {
  checks: SessionCheck[]
  commands: SessionCommand[]
  snapshot: WorkSnapshot | null
}

type Copy<P> = Readonly<{
  cell: JournalCell<P>
  core: ReturnType<typeof createJournal<P>>
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
  /** The view folded from the facts up to `published`. */
  view: SessionJournalView
  /** The content blocks read or written, by row digest: the stored payload text. */
  readonly blobs: Map<string, string>
  /**
   * The blocks decoded, by the digest the facts name. A block is immutable under its digest, so
   * it is decoded once per book, not once per copy built (a copy is rebuilt whenever another
   * writer published; decoding every block again made each rebuild cost the whole history).
   */
  readonly parsed: Map<string, unknown>
  /** The copy of the core over the records at `published`; null when it must be built. */
  copy: Copy<P> | null
  /** The publication the view reflects; null when nothing was read yet (a cold start follows). */
  published: number | null
  /** The executions whose facts were read whole (the open ones at the cold start, and on demand). */
  readonly loaded: Set<string>
  scratch: Scratch | null
  queue: Promise<void>
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
  'materials.describe',
  'entries.read',
  'entries.receivedOf',
  'received.query',
  'targets.forExecution',
  'targets.resolve',
  'toolTargets.forExecution',
  'toolTargets.resolve',
])
const OWNER = 'session-log-journal'
/**
 * The bytes of content blocks one publication carries beside its batch before the blocks go in a
 * commit of their own, first (R2-D292 3.4): a block without a fact that names it is not a fact, so
 * the order is safe, and the batch then stays under the command limit of the storage.
 */
const BLOBS_WITH_BATCH_BYTES = 256 * 1024

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})

type OpenInput<P> = Parameters<AgentJournal<P>['open']>[0]
type AttachInput<P> = Parameters<AgentJournal<P>['attach']>[0]

/**
 * The hand-over the Session participation of one write derives from (AD-01 table). It is the
 * caller of a `commit` or the transfer of a `recordResult`, except for the main reply: a `commit`
 * whose caller is none and that applies the prepared outcome of a model-reply H (the Ja of
 * `handoff.resolve` with its `replyAdmission`) writes the reply into the Session history in the same
 * storage commit, through the same `recordMessage` writer as the `message` hand-over. Its source is
 * the original handoff record and its admission the prepared result (Agent SPEC "真实历史的提交点":
 * the main reply is a core history duty of the Journal and never a CallerCommit.message).
 */
function historyCaller<P>(input: ExecutionMutation<P>, method: JournalWrite): CallerCommit {
  if (method === 'recordResult')
    return (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
  if (method !== 'commit') return { kind: 'none' }
  const commit = input as Parameters<AgentJournal<P>['commit']>[0]
  if (commit.caller.kind !== 'none') return commit.caller
  const handoff = commit.handoff
  if (handoff?.kind !== 'resolve') return commit.caller
  const { request, decision, record } = handoff.outcome
  if (
    request.kind !== 'execution' ||
    request.source.kind !== 'model-reply' ||
    decision.kind !== 'prepared'
  )
    return commit.caller
  return {
    kind: 'message',
    message: decision.message,
    source: record,
    admission: decision.admission,
  }
}

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

/**
 * The result of reading an original fragment, or null when the fragments do not give it. A missing
 * original (`HistoryFailure`) is the expected reason, and nothing is invented for it. A
 * `TypeError` is a defect of the reader, not a fact about the data: it is reported through `fault`
 * and the read still answers null, so the Agent write that triggered it is not lost. Any other
 * error is not this function's to hide.
 */
export function readOrNull<T>(what: string, fault: Fault | undefined, read: () => T): T | null {
  try {
    return read()
  } catch (error) {
    if (error instanceof HistoryFailure) return null
    if (error instanceof TypeError) {
      fault?.(`${what} read past a ${error.name}: ${error.message}`)
      return null
    }
    throw error
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
  fault: Fault | undefined,
): readonly SessionLogConsequence[] | null {
  return readOrNull(`the consequences of ${execution.id}/${event.sequence}`, fault, () =>
    normalizeAgentEvent(root, execution, event),
  )
}

/**
 * The Agent evidence of a control event, whose consequences Session decides when it interprets
 * the event (its row has the deferred marker); null for any other event, or when the original
 * fragments do not give the evidence (the row then keeps empty kinds).
 */
function deferredOf(
  root: CommonRoot,
  execution: MemoryExecution,
  event: MemoryExecution['events'][number],
  fault: Fault | undefined,
): SessionControlEvidence | null {
  if (event.body.kind !== 'control') return null
  return readOrNull(`the control evidence of ${execution.id}/${event.sequence}`, fault, () =>
    controlEventEvidence(root, execution, event),
  )
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

/** The JSON a projection member takes: the consequences or the control evidence as data. */
const projected = (value: unknown): JsonValue =>
  value === null || value === undefined ? null : (JSON.parse(JSON.stringify(value)) as JsonValue)

/**
 * The event projection of one new event of `execution` (AD-02 table, Agent side): the kinds of
 * its normalized consequences, the consequences and the deferred control evidence, the batch of
 * an input-taken event. The row's `event` column keeps it; AD-02 reads what the row says.
 */
function projectionOf(
  root: CommonRoot,
  execution: MemoryExecution,
  event: MemoryExecution['events'][number],
  fault: Fault | undefined,
): EventProjection {
  const consequences = consequencesOf(root, execution, event, fault)
  const control = consequences === null ? deferredOf(root, execution, event, fault) : null
  return {
    sequence: event.sequence,
    source: event.cause,
    kinds: control !== null ? ['deferred'] : (consequences?.map(item => item.kind) ?? []),
    consequences: projected(consequences),
    control: projected(control),
    ...(event.body.kind === 'input-taken' ? { batch: projected(event.body.batch) } : {}),
  }
}

/** The head rows of the executions a write changed (the Agent side of the execution boundary). */
function boundariesOf(
  changed: readonly MemoryExecution[],
  receipt: CommandReceipt | null,
): ExecutionBoundaryRecord[] {
  return changed.map(execution => {
    const head = receipt?.execution === execution.id ? receipt.evidence : null
    const last = execution.events.at(-1)
    return {
      execution: execution.id,
      revision: String(execution.revision),
      receipt: head ?? placeholderHead(execution),
      emittedThrough: String(execution.events.length),
      ended:
        last !== undefined && last.body.kind === 'ended'
          ? { sequence: last.sequence, source: last.cause }
          : null,
    }
  })
}

/**
 * Captures the original fragments of the events that one write of `execution` appended, with the
 * write's receipt, as the memory double does in its commit hook. A fragment that cannot be read is
 * left out, not the write: the event's consequences are then not decided, and its row says so
 * with empty kinds.
 */
function captureFresh(
  root: CommonRoot,
  execution: string,
  receipt: CommandReceipt,
  fault: Fault | undefined,
): void {
  const found = [...root.agent.executions.values()].find(item => item.id === execution)
  if (found === undefined) return
  const old = root.agent.indexedEvents.get(execution) ?? 0
  for (const event of found.events.slice(old))
    readOrNull(`the original of ${execution}/${event.sequence}`, fault, () =>
      captureEventOriginal(root, found, event, receipt),
    )
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
  /** The normalized consequences, the same the row's kinds name; null: not decided. */
  consequences: readonly SessionLogConsequence[] | null
  /** The Agent evidence of a deferred control fact, which Session decides; null otherwise. */
  control: SessionControlEvidence | null
}>

/**
 * One execution of a session's durable Agent records as AD-02 interprets it: its head revision, the
 * head receipt its head row names (null: the placeholder, which the Session side answers
 * `unavailable` for), and its events after a sequence, all from one read of one head.
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

/** The transaction domain of a tenant, or why there is none. */
type DomainResolution =
  | Readonly<{ kind: 'ready'; domain: DomainRef }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * Asks the trusted lookup for the transaction domain of `tenant` (its minted text). A throw and an
 * unregistered tenant are both `unavailable`: nothing is read or written for a tenant without one.
 */
async function resolveDomain(
  lookup: TenantDomainLookup,
  tenant: string,
): Promise<DomainResolution> {
  let found
  try {
    found = await lookup.lookup({ tenant })
  } catch (error) {
    return { kind: 'unavailable', diagnostic: `the tenant domain lookup threw: ${String(error)}` }
  }
  if (found.kind === 'ready') return { kind: 'ready', domain: found.domain }
  return {
    kind: 'unavailable',
    diagnostic:
      found.kind === 'unregistered' ? 'the tenant has no transaction domain' : found.diagnostic,
  }
}

/** The storage and the trusted domain lookup that a reader of the Agent records needs. */
export type JournalStateSource = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
}>

type Resolved = Readonly<{ domain: DomainRef; tenant: string; read: Reader }>

async function resolvedOf(
  options: JournalStateSource,
  tenant: TenantId,
): Promise<Resolved | Readonly<{ kind: 'unavailable'; diagnostic: string }>> {
  const text = tenantCodec.encode(tenant)
  if (!text.ok)
    return { kind: 'unavailable', diagnostic: 'the tenant was not minted by legal-identity' }
  const resolved = await resolveDomain(options.tenantDomainLookup, text.value)
  if (resolved.kind === 'unavailable') return resolved
  return {
    domain: resolved.domain,
    tenant: text.value,
    read: readerOf(options.storage, resolved.domain),
  }
}

/**
 * Reads the events of one execution after `after` (C-WORKCACHE design §5, path P): the head row of
 * the execution and its event rows after `after` by the event index, with the projection each
 * row carries (the consequences the Journal normalized when it wrote the event). Only the events
 * after the reader's progress are read, so a read does not grow with the session or with the
 * records of the execution. `null` execution: the session's records hold no such execution. It
 * reads only; it never writes.
 */
export async function readExecutionInterpretation(
  options: JournalStateSource,
  target: Readonly<{ tenant: TenantId; session: SessionId; execution: string; after: string }>,
): Promise<InterpretationRead> {
  const resolved = await resolvedOf(options, target.tenant)
  if ('kind' in resolved) return resolved
  const read = await readEvents(
    resolved.read,
    { tenant: resolved.tenant, session: target.session },
    target.execution,
    target.after,
  )
  if (read.kind === 'absent') return { kind: 'read', execution: null }
  if (read.kind === 'unavailable') return read
  const receipt = read.receipt as DurableEvidence | null
  return {
    kind: 'read',
    execution: {
      revision: read.revision,
      head: receipt === null || receipt.digest === 'unknown' ? null : receipt,
      emittedThrough: read.emittedThrough,
      events: read.events.map(event => ({
        sequence: event.sequence,
        source: event.source as unknown as DurableEvidence,
        consequences: event.consequences as unknown as readonly SessionLogConsequence[] | null,
        control: event.control as unknown as SessionControlEvidence | null,
      })),
    },
  }
}

/**
 * Fetches into `into` every block of `digests` that it does not hold. The first digest the tenant
 * does not hold, or null when all are there.
 */
async function fetchBlobClosure(
  read: Reader,
  tenant: string,
  digests: Iterable<string>,
  into: Map<string, string>,
): Promise<string | null> {
  for (const digest of digests) {
    if (into.has(digest)) continue
    const payload = await readBlob(read, tenant, digest)
    if (typeof payload !== 'string') return digest
    into.set(digest, payload)
  }
  return null
}

/** The records of one execution a reader outside the provider needs: its handoffs and attachments. */
export type ExecutionRecordsRead =
  | Readonly<{ kind: 'read'; execution: MemoryExecution | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const HEX_DIGEST = /^[0-9a-f]{64}$/

/** The digests of the block references (`{ digest, size }` of `refOf`) anywhere in `value`. */
function refsIn(value: unknown, into = new Set<string>()): Set<string> {
  if (value === null || typeof value !== 'object') return into
  if (value instanceof Map) {
    for (const member of value.values()) refsIn(member, into)
    return into
  }
  if (Array.isArray(value)) {
    for (const item of value) refsIn(item, into)
    return into
  }
  const record = value as Record<string, unknown>
  if (
    typeof record['digest'] === 'string' &&
    HEX_DIGEST.test(record['digest']) &&
    typeof record['size'] === 'number'
  )
    into.add(record['digest'])
  for (const member of Object.values(record)) refsIn(member, into)
  return into
}

/** The obligation block digests an issued list names: `[id, digest]` pairs in its list block. */
function listedDigests(payload: string): string[] {
  const value = JSON.parse(payload) as unknown
  if (!Array.isArray(value)) return []
  return value.flatMap(item =>
    Array.isArray(item) && typeof item[1] === 'string' && HEX_DIGEST.test(item[1]) ? [item[1]] : [],
  )
}

/**
 * Fetches the blocks the facts of `executions` name (the cursor members, the custody of results,
 * the finish records, the materials), then the obligation blocks their issued lists name through
 * the list block (R2-D322: a close names its items by id and digest in a block, not by reference).
 * The digest of the first block that is not readable, or null.
 */
async function fetchNamed(
  read: Reader,
  tenant: string,
  executions: Iterable<ExecutionView>,
  into: Map<string, string>,
): Promise<string | null> {
  const named = new Set<string>()
  const lists: string[] = []
  for (const execution of executions) {
    for (const ref of refsIn(execution)) named.add(blobRowDigest(ref))
    for (const list of execution.finish.lists.values()) lists.push(list.issued.listed.digest)
  }
  const missing = await fetchBlobClosure(read, tenant, named, into)
  if (missing !== null) return missing
  const items = new Set<string>()
  for (const digest of lists) {
    const payload = into.get(blobRowDigest(digest))
    if (payload === undefined) continue
    for (const item of listedDigests(payload)) items.add(blobRowDigest(item))
  }
  return fetchBlobClosure(read, tenant, items, into)
}

/**
 * The fold one reader outside the provider keeps of a session, up to `head`: the facts of the
 * executions it was asked about. The next read folds only the batches after the head (and, for an
 * execution asked about for the first time, that execution's facts), so a read does not grow with
 * the session.
 */
type RecordsFold = {
  head: number
  view: SessionJournalView
  blobs: Map<string, string>
  /** The blocks decoded, by the digest the facts name (see `Book.parsed`). */
  parsed: Map<string, unknown>
  executions: Set<string>
}

/** The folds kept per storage, by tenant, session and execution; the oldest leave at the bound. */
const recordsFolds = new WeakMap<SqlStorage, Map<string, RecordsFold>>()
const RECORDS_FOLDS = 256

function recordsFoldOf(storage: SqlStorage, key: string): RecordsFold {
  let folds = recordsFolds.get(storage)
  if (folds === undefined) {
    folds = new Map()
    recordsFolds.set(storage, folds)
  }
  let found = folds.get(key)
  if (found !== undefined) {
    // Touched: the most recently used fold is the last of the map.
    folds.delete(key)
    folds.set(key, found)
    return found
  }
  found = {
    head: 0,
    view: emptySessionView(),
    blobs: new Map(),
    parsed: new Map(),
    executions: new Set(),
  }
  folds.set(key, found)
  while (folds.size > RECORDS_FOLDS) {
    const oldest = folds.keys().next().value
    if (oldest === undefined) break
    folds.delete(oldest)
  }
  return found
}

/**
 * Reads the records of one execution from its facts: what `message-handoff` and the conditions of
 * AD-05 read of a P and the grant of the attachment an Authority names. The first read of an
 * execution folds its facts from the first publication; a later read folds only the batches after
 * the publication the kept fold reached (session-storage-sql RT-04 owner list, item 3), so one
 * read is bounded by the step, not by the session. It reads only: the record is projected from
 * the fold and the blocks it names, as the provider's own copy is.
 */
export async function readExecutionRecords(
  options: JournalStateSource,
  target: Readonly<{ tenant: TenantId; session: SessionId; execution: string }>,
): Promise<ExecutionRecordsRead> {
  const resolved = await resolvedOf(options, target.tenant)
  if ('kind' in resolved) return resolved
  const scope = { tenant: resolved.tenant, session: target.session }
  const kept = recordsFoldOf(options.storage, JSON.stringify([resolved.tenant, target.session]))
  const known = kept.executions.has(target.execution)
  const own = await readBatches(resolved.read, scope, known ? kept.head : 0, target.execution)
  if (own.kind === 'unavailable') return own
  const head = Math.max(kept.head, own.published)
  const batches = [...own.batches]
    .filter(batch => batch.pub <= head)
    .sort((left, right) => left.pub - right.pub)
  for (const batch of batches) if (batch.batch !== null) kept.view = fold(kept.view, batch.batch)
  kept.view = { ...kept.view, head: Math.max(kept.view.head, head) }
  kept.head = head
  kept.executions.add(target.execution)
  const found = kept.view.executions.get(target.execution as AgentExecutionId)
  if (found === undefined || found.opened === null) return { kind: 'read', execution: null }
  const missing = await fetchNamed(resolved.read, resolved.tenant, [found], kept.blobs)
  if (missing !== null)
    return { kind: 'unavailable', diagnostic: `the content block ${missing} is not readable` }
  try {
    const execution = projectExecution(
      found,
      projectionContext(target.tenant, resolved.tenant, target.session, kept.blobs, kept.parsed),
    ) as MemoryExecution
    return { kind: 'read', execution }
  } catch (error) {
    return { kind: 'unavailable', diagnostic: `the Agent records do not decode: ${String(error)}` }
  }
}

/** What a projection reads besides the view: the blocks by the digest the facts name, and the mint. */
function projectionContext(
  tenant: TenantId,
  tenantText: string,
  session: SessionId,
  rows: ReadonlyMap<string, string>,
  parsed: Map<string, unknown>,
): ProjectionContext {
  // The blocks not decoded yet join the decoded ones; the rest are kept as they are.
  for (const [row, payload] of rows) {
    const digest = factDigestOf(row)
    if (!parsed.has(digest)) parsed.set(digest, JSON.parse(payload) as unknown)
  }
  return {
    tenant,
    blobs: parsed,
    mint: { owner: JOURNAL_OWNER, session: JSON.stringify([tenantText, session]) },
    eventSchema: DEFAULT_EVENT_SCHEMA,
    admissionRule: DEFAULT_REPLY_ADMISSION_RULE,
  }
}

export function createSessionLogJournal<P>(options: SessionLogJournalOptions<P>) {
  const books = new Map<string, Book<P>>()
  const generations: GenerationMemory = new Map()

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
        view: emptySessionView(),
        blobs: new Map(),
        parsed: new Map(),
        copy: null,
        published: null,
        loaded: new Set(),
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
    const run = book.queue.then(task, task).finally(() => {
      if (
        book.held.size === 0 &&
        book.view.executions.size > 0 &&
        [...book.view.executions.values()].every(execution => execution.finish.ended !== null)
      )
        book.copy = null
    })
    book.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function domainOf(book: Book<P>): Promise<Outcome<DomainRef, Failure>> {
    // An unregistered tenant is not registered here; nothing is written (assembly page :307).
    const resolved = await resolveDomain(options.tenantDomainLookup, book.tenantText)
    return resolved.kind === 'ready'
      ? succeed(resolved.domain)
      : fail(unavailable(resolved.diagnostic))
  }

  const scopeOf = (book: Book<P>) => ({ tenant: book.tenantText, session: book.session })
  // The mint of the batch evidence is the core's (its owner and the session namespace): what the
  // provider derives from a stored batch is what the core answered when it wrote it.
  const mintOf = (book: Book<P>) => ({
    owner: JOURNAL_OWNER,
    session: JSON.stringify([book.tenantText, book.session]),
  })

  /**
   * The Session snapshot the `advances` check of this call reads, through the work cache of the
   * storage (session-storage-sql RT-04): a version read, and a whole read only after a commit.
   */
  async function snapshotOf(book: Book<P>, domain: DomainRef): Promise<WorkSnapshot | null> {
    const work = await readCachedSessionWork(options.storage, domain, book.tenantText, book.session)
    return work.kind === 'state' ? work.snapshot : null
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
    const caller = historyCaller(input, method)
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
          return fail(
            unavailable(
              error instanceof HistoryFailure && error.failure.kind === 'unavailable'
                ? error.failure.diagnostic
                : error instanceof Error
                  ? error.message
                  : 'original result',
            ),
          )
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

  /** Fills a new root with the records of the session, projected from its fold and blocks. */
  function restore(book: Book<P>, cell: JournalCell<P>, records: ProjectedRecords): void {
    cell.mutate(() => {
      const root = cell.state()
      const into = <K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>) => {
        for (const [key, value] of source) target.set(key, value)
      }
      // The fact family of the core is the book's: the view at the publication count, the blocks
      // by the digest the facts name. The core appends at `view.head + 1`; its log holds only the
      // batches it appends from here, which the provider publishes.
      root.agent.view = book.view
      root.agent.log = []
      for (const [digest, value] of book.parsed) root.agent.blobs.set(digest, value)
      into(root.agent.executions, records.executions)
      into(root.agent.operations, records.operations)
      into(root.agent.eventReceipts, records.fragments.eventReceipts)
      into(root.agent.pendingEvents, records.fragments.pendingEvents)
      into(root.agent.callOrigins, records.fragments.callOrigins)
      into(root.agent.human, records.fragments.human)
      into(root.agent.indexedEvents, records.fragments.indexedEvents)
      for (const name of Object.keys(records.receiving) as (keyof CommonRoot['receiving'])[])
        into(
          root.receiving[name] as Map<unknown, unknown>,
          records.receiving[name] as Map<unknown, unknown>,
        )
      cell.touch()
    })
  }

  /** The copy of `book` over the records its fold holds: a new cell and core. */
  function build(book: Book<P>): Copy<P> {
    const cell: JournalCell<P> = createCell<P>(book.tenant, book.session, {
      authorize: () => undefined,
      // R2-D348: the Authority's attachment names its grant; the Session's attempt records of
      // the snapshot name the attempt that grant was issued for (R2-D349); it must be the advance.
      advances(execution, authority): boolean {
        const snapshot = book.scratch?.snapshot ?? null
        if (snapshot === null || snapshot.run.kind !== 'active' || snapshot.run.advance === null)
          return false
        if (snapshot.run.execution.execution !== execution) return false
        const own = [...cell.state().agent.executions.values()].find(item => item.id === execution)
        const attempt = attemptOfAuthority(
          own?.attachments ?? [],
          snapshot.historyIndex?.attempts,
          authority,
        )
        return attempt?.attempt === snapshot.run.advance.attempt
      },
      participate: (input, method, receipt, decision) =>
        participation(book, cell, input, method, receipt, decision),
      committed(input, method, receipt) {
        captureFresh(cell.state(), input.execution, receipt, options.fault)
        return undefined
      },
    })
    restore(
      book,
      cell,
      projectRecords(
        book.view,
        projectionContext(book.tenant, book.tenantText, book.session, book.blobs, book.parsed),
      ),
    )
    putBack(book, cell)
    const core = createJournal<P>(cell, {
      participants: PARTICIPANTS,
      grant: () => true,
      participates: (input, method) => historyCaller(input, method).kind !== 'none',
      qualifyParticipation: (input, method, receipt) => qualify(book, cell, input, method, receipt),
      terminalParticipant: input => terminalParticipant(book, cell, input.execution, input.control),
      ...(options.cancellation === undefined ? {} : { cancellation: options.cancellation }),
      ...(options.hostRecords === undefined ? {} : { hostRecords: options.hostRecords }),
    })
    return { cell, core }
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
          const found = [...root.agent.executions].find(([, item]) => item.id === held.execution)
          if (found !== undefined) {
            const [key, execution] = found
            const custodyAttempts = new Map(execution.custodyAttempts)
            custodyAttempts.set(held.operation, held.custody)
            root.agent.executions.set(key, { ...execution, custodyAttempts })
          }
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
          execution: held.execution,
          operation: held.operation,
          reason: 'dropped',
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

  /** The common root of the session in one read, or the diagnostic of why it is not readable. */
  async function readRoot(book: Book<P>, domain: DomainRef) {
    const output = await readOutput(options.storage, {
      domain,
      handler: SESSION_HISTORY_ROOT_HANDLER,
      protocol: SESSION_PROTOCOL,
      input: { tenant: book.tenantText, session: book.session },
    })
    const unreadable = 'the common root of the session is not readable'
    if (output.kind === 'unread') return `${unreadable}: ${output.reason}`
    return decodeSessionHistoryRoot(output.output) ?? unreadable
  }

  /** Folds the batches read into the view; the copy is then stale. */
  function foldRead(book: Book<P>, batches: readonly ReadBatch[], published: number): void {
    for (const batch of batches) if (batch.batch !== null) book.view = fold(book.view, batch.batch)
    book.view = { ...book.view, head: Math.max(book.view.head, published) }
    book.published = published
    book.copy = null
  }

  /**
   * Folds the facts of one execution read whole, after the view's head moved past them (an ended
   * execution the cold start did not read): they fold into a view of their own, which is then
   * joined to the book's.
   */
  function foldExecution(book: Book<P>, batches: readonly ReadBatch[]): void {
    let side = emptySessionView()
    for (const batch of batches) if (batch.batch !== null) side = fold(side, batch.batch)
    book.view = {
      head: book.view.head,
      executions: new Map([...book.view.executions, ...side.executions]),
      ops: new Map([...side.ops, ...book.view.ops]),
      excluded: new Map([...side.excluded, ...book.view.excluded]),
    }
    book.copy = null
  }

  /**
   * Reads the facts of `execution` when the view does not hold it: an execution that ended before
   * the cold start, which read the open ones only. Read once per execution; nothing is read for an
   * execution the session never had, beyond the one read that finds no fact of it.
   */
  async function loadExecution(
    book: Book<P>,
    domain: DomainRef,
    execution: string,
  ): Promise<Outcome<Copy<P>, Failure>> {
    const read = readerOf(options.storage, domain)
    const found = await readBatches(read, scopeOf(book), 0, execution)
    if (found.kind === 'unavailable') return fail(unavailable(found.diagnostic))
    book.loaded.add(execution)
    if (found.batches.length > 0) foldExecution(book, found.batches)
    if (book.copy !== null) return succeed(book.copy)
    const missing = await fetchBlobs(book, read)
    if (missing !== null) return fail(missing)
    try {
      book.copy = build(book)
    } catch (error) {
      book.copy = null
      return fail(unavailable(`the Agent records do not decode: ${String(error)}`))
    }
    return succeed(book.copy)
  }

  /** Fetches the content blocks the facts of the view name that the book does not hold yet. */
  async function fetchBlobs(book: Book<P>, read: Reader): Promise<Failure | null> {
    // The blocks the facts of the view refer to: the core reads them by digest.
    const missing = await fetchNamed(
      read,
      book.tenantText,
      book.view.executions.values(),
      book.blobs,
    )
    return missing === null
      ? null
      : unavailable(`the content block ${missing} of the Agent records is not readable`)
  }

  /**
   * Brings the copy of `book` to the durable records of its session: a point read of the count;
   * nothing more when the view is at it; the batches after the head when behind; the open
   * executions and their facts when nothing was read yet.
   */
  async function sync(book: Book<P>, domain: DomainRef): Promise<Outcome<Copy<P>, Failure>> {
    const root = await readRoot(book, domain)
    if (typeof root === 'string') return fail(unavailable(root))
    const excluded = await settleHeld(book, domain)
    const published = Number(root.published)
    const read = readerOf(options.storage, domain)
    if (book.published === null) {
      const cold = await readColdStart(read, scopeOf(book))
      if (cold.kind === 'unavailable') return fail(unavailable(cold.diagnostic))
      foldRead(book, cold.batches, cold.published)
      for (const execution of cold.executions) book.loaded.add(execution)
    } else if (book.published < published) {
      const found = await readBatches(read, scopeOf(book), book.published)
      if (found.kind === 'unavailable') return fail(unavailable(found.diagnostic))
      foldRead(book, found.batches, found.published)
    } else if (!excluded && book.copy !== null) return succeed(book.copy)
    const missing = await fetchBlobs(book, read)
    if (missing !== null) return fail(missing)
    try {
      book.copy = build(book)
    } catch (error) {
      book.copy = null
      return fail(unavailable(`the Agent records do not decode: ${String(error)}`))
    }
    return succeed(book.copy)
  }

  /**
   * The request the last main-purpose M0 of the session recorded, at the publication count of this
   * read: the latest `request.adopted` fact across the executions of the view and its record block.
   */
  async function readAdopted(
    scope: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<AdoptedRead> {
    const book = bookOf(scope.tenant, scope.session)
    if (book === null) return { kind: 'unavailable', diagnostic: 'the tenant is not minted' }
    return serial(book, async () => {
      const domain = await domainOf(book)
      if ('failure' in domain)
        return {
          kind: 'unavailable',
          diagnostic:
            domain.failure.kind === 'unavailable' ? domain.failure.diagnostic : domain.failure.kind,
        }
      const synced = await sync(book, domain.ok)
      if ('failure' in synced)
        return {
          kind: 'unavailable',
          diagnostic:
            synced.failure.kind === 'unavailable' ? synced.failure.diagnostic : synced.failure.kind,
        }
      let latest: Readonly<{ execution: string; request: RequestView }> | null = null
      for (const execution of book.view.executions.values())
        if (
          execution.adopted !== null &&
          (latest === null || execution.adopted.pub > latest.request.pub)
        )
          latest = { execution: execution.execution, request: execution.adopted }
      if (latest === null) return { kind: 'value', value: null }
      // The adoption order of the session: one more for each request adopted up to this one.
      let order = 0
      for (const execution of book.view.executions.values())
        for (const request of execution.requests) if (request.pub <= latest.request.pub) order += 1
      const digest = blobRowDigest(latest.request.record.digest)
      let payload = book.blobs.get(digest)
      if (payload === undefined) {
        const read = await readBlob(readerOf(options.storage, domain.ok), book.tenantText, digest)
        if (typeof read !== 'string')
          return { kind: 'unavailable', diagnostic: `the record block ${digest} is not readable` }
        book.blobs.set(digest, read)
        payload = read
      }
      try {
        return {
          kind: 'value',
          value: {
            order: String(order),
            execution: latest.execution,
            reference: String(latest.request.reference),
            fixed: latest.request.fixed,
            coverage: latest.request.coverage,
            schema: latest.request.schema,
            record: JSON.parse(payload) as JsonValue,
          },
        }
      } catch (error) {
        return {
          kind: 'unavailable',
          diagnostic: `the record block does not decode: ${String(error)}`,
        }
      }
    })
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
   * and attachment, and the original attempt of that attachment: the attempt the Session issued
   * the attachment's grant for, in the snapshot of this write (R2-D349). An attachment whose grant
   * names no attempt has none; nothing is guessed from the current advance.
   */
  function admissionsOf(
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
    const attachment = own.attachments.at(-1)
    if (input === null || attachment === undefined) return []
    const original = attemptOfGrant(
      scratch.snapshot?.historyIndex?.attempts,
      own.id,
      attachment.grant,
    )
    return [
      {
        input,
        execution: own.id,
        operation: written.operation ?? '',
        accepted: receipt.evidence,
        grant: check?.kind === 'open' ? check.grant : receipt.evidence,
        attachment: attachment.authority.executionAttachment,
        ...(original === undefined ? {} : { attempt: original.attempt }),
      },
    ]
  }

  /** The batch of one write, prepared: the rows the store takes, the blocks and the family's batch. */
  type Prepared = Readonly<{
    envelope: BatchEnvelope
    derived: readonly DerivedFact[]
    records: readonly ExecutionFactRecord[]
    blobs: readonly ExecutionBlobRecord[]
    /** The bytes of the envelope and the fact bodies, without the blocks. */
    batchBytes: number
  }>

  /** The participation kinds of the batch: the Session commands the same commit carries. */
  function kindsOf(scratch: Scratch): ParticipationKind[] {
    const kinds: ParticipationKind[] = []
    for (const command of scratch.commands)
      switch (command.kind) {
        case 'recordMessage':
          kinds.push('message')
          break
        case 'commitDerived':
          kinds.push('context-transition')
          break
        case 'preserveResult':
          kinds.push('custody')
          break
        case 'completeConsumption':
          kinds.push('processed')
          break
        default:
          break
      }
    return kinds
  }

  /**
   * Prepares the batch of one write: the facts of the family the core appended, each fact that is
   * an event with the projection of that event (the Session reads it from the row), the envelope,
   * and the blocks the facts name. A family fact that carries content or exceeds `FACT_MAX_BYTES`
   * is refused as `invalid` (the run-time guard of P3); a batch of more facts than the store takes
   * is `unavailable`; facts that do not name the events the write appended, in order, are a defect
   * of the writer and `unavailable`.
   */
  function prepare(
    book: Book<P>,
    after: CommonRoot,
    own: MemoryExecution | undefined,
    appended: readonly PublishedBatch[],
    written: Written,
    scratch: Scratch,
  ): Outcome<Prepared, Failure> {
    const blobs = new Map<string, ExecutionBlobRecord>()
    // The batches the core appended in this write: its facts are the family's facts, its blocks
    // the rows to store.
    coreBlobRows(after.agent.blobs, row => book.blobs.has(row), blobs)
    // The event each event fact projects: the fold decides which facts are events and numbers
    // them (`eventOf`, the one place of the rule); the core's view after the write holds the
    // fold of the appended batches. The writer numbers its events the same way
    // (`tests/journal-records-parity.spec.ts` holds the two equal).
    const execution = appended[0]!.execution
    const events = new Map(
      (after.agent.view.executions.get(execution)?.events ?? []).map(
        event => [`${String(event.pub)}/${String(event.ord)}`, event] as const,
      ),
    )
    const derived: DerivedFact[] = []
    for (const batch of appended)
      for (const [index, fact] of batch.facts.entries()) {
        const folded = events.get(`${String(batch.pub)}/${String(index + 1)}`)
        if (folded === undefined) {
          derived.push({ fact, event: null })
          continue
        }
        const event = own?.events[folded.eseq - 1]
        if (own === undefined || event === undefined || event.body.kind !== folded.kind) {
          const first = [...events.values()][0]?.eseq ?? folded.eseq
          const appended = (own?.events ?? []).slice(first - 1).map(item => item.body.kind)
          const projected = [...events.values()].map(item => item.kind)
          return fail(
            unavailable(
              `the facts of ${written.method} do not name the events it appended (fact ${fact.kind} at ${String(folded.eseq)}; the facts project [${projected.join(', ')}], the write appended [${appended.join(', ')}])`,
            ),
          )
        }
        derived.push({ fact, event: projectionOf(after, own, event, options.fault) })
      }
    for (const [index, item] of derived.entries()) {
      const found = contentPath(item.fact)
      if (found !== null)
        return fail({
          kind: 'invalid',
          field: `facts[${String(index)}].${found}`,
          reason: 'content',
        })
      if (Buffer.byteLength(canonical(item.fact), 'utf8') > FACT_MAX_BYTES)
        return fail({ kind: 'invalid', field: `facts[${String(index)}]`, reason: 'oversize' })
    }
    // The envelope is the core's: the answer the core derived was minted on it, and a reader
    // derives the same answer from the stored batch. The participation kinds are the provider's:
    // the Session commands this commit carries.
    const envelope: BatchEnvelope = { ...appended.at(-1)!.envelope, kinds: kindsOf(scratch) }
    const records: ExecutionFactRecord[] = [
      { execution, kind: 'batch', body: envelope as unknown as JsonValue },
      ...derived.map(item => ({
        execution,
        kind: item.fact.kind,
        body: item.fact as unknown as JsonValue,
        ...(item.event === null ? {} : { event: item.event }),
      })),
    ]
    if (records.length > EXECUTION_BATCH_MAX_FACTS)
      return fail(
        unavailable(
          `the batch of ${written.method} holds ${String(records.length)} facts, more than ${String(EXECUTION_BATCH_MAX_FACTS)}`,
        ),
      )
    return succeed({
      envelope,
      derived,
      records,
      blobs: [...blobs.values()],
      batchBytes: batchBytes({
        execution: execution as AgentExecutionId,
        envelope,
        facts: derived.map(item => item.fact),
      }),
    })
  }

  /**
   * Stores the blocks that do not go with the batch, in commits of their own before it (R2-D292
   * 3.4). A block of its own above the storage's command limit cannot be stored: `unavailable`.
   */
  async function storeBlobsFirst(
    book: Book<P>,
    domain: DomainRef,
    execution: string,
    blobs: readonly ExecutionBlobRecord[],
  ): Promise<Outcome<readonly ExecutionBlobRecord[], Failure>> {
    const sizeOf = (blob: ExecutionBlobRecord) => Buffer.byteLength(blob.payload, 'utf8')
    const total = blobs.reduce((sum, blob) => sum + sizeOf(blob), 0)
    if (total <= BLOBS_WITH_BATCH_BYTES) return succeed(blobs)
    const largest = [...blobs].sort((left, right) => sizeOf(right) - sizeOf(left))
    const withBatch: ExecutionBlobRecord[] = []
    let chunk: ExecutionBlobRecord[] = []
    let chunkBytes = 0
    let kept = 0
    const flush = async (): Promise<Failure | null> => {
      if (chunk.length === 0) return null
      const digests = chunk.map(blob => blob.digest).join(',')
      const operation = storageOperation(
        execution,
        `blobs\0${createHash('sha256').update(digests).digest('hex')}`,
      )
      const outcome = await commitJournal({
        storage: options.storage,
        domain,
        combination: options.combination,
        operation,
        commands: [executionRecordBlobFacts({ tenant: book.tenant, blobs: chunk })],
        generations,
      })
      chunk = []
      chunkBytes = 0
      if (outcome.kind === 'committed') return null
      if (outcome.kind === 'refused') return refusalFailure(outcome.reason)
      return unavailable(
        outcome.kind === 'unavailable' || outcome.kind === 'unknown'
          ? `the content blocks were not stored: ${outcome.diagnostic}`
          : 'the content blocks were not stored: rolled back',
      )
    }
    for (const blob of largest) {
      const bytes = sizeOf(blob)
      if (kept + bytes <= BLOBS_WITH_BATCH_BYTES) {
        withBatch.push(blob)
        kept += bytes
        continue
      }
      if (chunkBytes + bytes > BLOBS_WITH_BATCH_BYTES) {
        const failed = await flush()
        if (failed !== null) return fail(failed)
      }
      chunk.push(blob)
      chunkBytes += bytes
    }
    const failed = await flush()
    if (failed !== null) return fail(failed)
    return succeed(withBatch)
  }

  async function publish<T>(
    book: Book<P>,
    domain: DomainRef,
    copy: Copy<P>,
    before: CommonRoot,
    after: CommonRoot,
    written: Written,
    input: object,
    scratch: Scratch,
    answer: Outcome<T, Failure>,
  ): Promise<Settled<T>> {
    // From here on the copy holds an unpublished state: whatever happens, rebuild it from the
    // facts next time. The view and its head stay: a rebuild folds only what is after the head.
    const published = book.published ?? 0
    book.copy = null
    const changed = changedExecutions(before, after)
    const own = changed.find(item => item.id === written.execution) ?? changed[0]
    const prior =
      own === undefined
        ? undefined
        : [...before.agent.executions.values()].find(item => item.id === own.id)
    const receipt = receiptOf(answer)
    // The batches the core appended in this write: those after the publication count the view is
    // at. A write that changed the records without a batch is a defect of the core, not a
    // publication the provider makes up.
    const appended = after.agent.log.filter(batch => batch.pub > book.view.head)
    if (appended.length === 0)
      return {
        kind: 'answer',
        value: fail(unavailable(`a ${written.method} changed the Agent records without a batch`)),
      }
    const execution = appended[0]!.execution
    // The storage operation of the write is derived from the execution and the Agent operation
    // alone, so a reader with those two (`query`) finds the batch of the operation.
    const operation = storageOperation(
      execution,
      written.operation ?? `${written.method}\0${randomUUID()}`,
    )
    let prepared: Prepared
    try {
      const made = prepare(book, after, own, appended, written, scratch)
      if ('failure' in made) return { kind: 'answer', value: made }
      prepared = made.ok
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
    const blobs = await storeBlobsFirst(book, domain, execution, prepared.blobs)
    if ('failure' in blobs) return { kind: 'answer', value: blobs }
    const commands: FactCommandV2[] = [
      executionRecordFacts({
        tenant: book.tenant,
        session: book.session,
        execution,
        expected: prior === undefined ? null : String(prior.revision),
        revision: own === undefined ? '0' : String(own.revision),
        published: String(published),
        operation,
        digest: written.digest,
        facts: prepared.records,
        blobs: blobs.ok,
        boundaries: boundariesOf(changed, receipt),
        admissions: admissionsOf(written, own, receipt, scratch),
      }),
      ...scratch.checks.map(check => sessionCheckFacts(check)),
      ...scratch.commands.map(command => sessionCommandFacts(command, [])),
    ]
    const outcome = await commitJournal({
      storage: options.storage,
      domain,
      combination: options.combination,
      operation,
      commands,
      generations,
    })
    reportPublication(book, written, execution, operation, commands, prepared, outcome)
    const settled = settle(
      {
        book,
        copy,
        after,
        prepared,
        execution,
        written,
        prior: prior === undefined ? null : revisionOf(prior.revision),
        scratch,
        answer,
      },
      operation,
      outcome,
    )
    // The publication moved the count of the Agent records: the work cache replaces the index of
    // the Session snapshot it holds, or folds the batch of a Session participation of the same
    // commit, instead of reading the snapshot whole (session-storage-sql RT-04).
    if (outcome.kind === 'committed' && !outcome.recalled && book.published !== null)
      await registerSessionWorkIndex(
        options.storage,
        domain,
        book.tenantText,
        book.session,
        String(book.published),
        jointSessionWork(outcome),
      )
    return settled
  }

  /** Tells the owner about one publication the storage answered; a failing report is ignored. */
  function reportPublication(
    book: Book<P>,
    written: Written,
    execution: string,
    storageOperation: string,
    commands: readonly FactCommandV2[],
    prepared: Prepared,
    outcome: Awaited<ReturnType<typeof commitJournal>>,
  ): void {
    const report = options.report
    if (report === undefined) return
    const sizes = commands.map(command => [command.participant, commandBytes(command)] as const)
    const known =
      outcome.kind === 'committed'
        ? { outcome: outcome.recalled ? ('recalled' as const) : ('committed' as const) }
        : outcome.kind === 'rolled-back'
          ? { outcome: 'rolled-back' as const }
          : {
              outcome:
                outcome.kind === 'unknown' ? ('commit-unknown' as const) : ('unavailable' as const),
              diagnostic: outcome.diagnostic,
            }
    try {
      report({
        tenant: book.tenantText,
        session: book.session,
        execution,
        operation: written.operation,
        storageOperation,
        method: written.method,
        recordBytes: sizes.find(([participant]) => participant === 'execution-record')?.[1] ?? 0,
        bytes: sizes.reduce((total, [, size]) => total + size, 0),
        batchBytes: prepared.batchBytes + BATCH_OVERHEAD_BYTES,
        blobBytes: prepared.blobs.reduce(
          (sum, blob) => sum + Buffer.byteLength(blob.payload, 'utf8'),
          0,
        ),
        facts: prepared.records.length,
        diagnostic: null,
        ...known,
      })
    } catch {
      // The report is an observation; the answer of the call does not depend on it.
    }
  }

  /** What one publication needs to turn a storage outcome into the call's answer. */
  type Published<T> = Readonly<{
    book: Book<P>
    copy: Copy<P>
    after: CommonRoot
    prepared: Prepared
    execution: string
    written: Written
    /** The revision of the written execution before the write; null when the write opened it. */
    prior: ExecutionRevision | null
    scratch: Scratch
    answer: Outcome<T, Failure>
  }>
  type Settling<T> = Published<T> &
    Readonly<{
      /** The Agent operation of the write; null for a write without one (the material port). */
      agentOperation: AgentOperationId | null
    }>
  /**
   * A write without an Agent operation (the material port) has no identity to name or to recall
   * by: wherever an answer would name one, it is `unavailable`, never an invented identity.
   */
  function nameless<T>(what: string): Settled<T> {
    return {
      kind: 'answer',
      value: fail(unavailable(`${what} of a write without an Agent operation`)),
    }
  }

  /** A conflict on the operation of the write: the same digest is the write itself, again. */
  function conflicting<T>(job: Settling<T>, digest: string): Settled<T> {
    if (digest === job.written.digest) return { kind: 'again' }
    return job.agentOperation === null
      ? nameless('a conflict')
      : { kind: 'answer', value: fail({ kind: 'conflict', operation: job.agentOperation }) }
  }

  /** The write committed: the call's answer, and the view and copy then reflect it. */
  function settleCommitted<T>(
    job: Settling<T>,
    receipt: Extract<Awaited<ReturnType<typeof commitJournal>>, { kind: 'committed' }>,
  ): Settled<T> {
    const entry = receipt.receipt.responses.find(item => item.participant === 'execution-record')
    const reply = entry === undefined ? null : decodeExecutionRecordReply(entry.reply)
    if (reply?.kind !== 'published')
      return {
        kind: 'answer',
        value: fail(unavailable('a committed receipt without the Agent records')),
      }
    // An earlier generation committed this operation: the durable records answer it.
    if (receipt.recalled) return conflicting(job, reply.digest)
    const { book, prepared } = job
    const pub = Number(reply.published)
    const batch: PublishedBatch = {
      execution: job.execution as AgentExecutionId,
      envelope: prepared.envelope,
      facts: prepared.derived.map(item => item.fact),
      pub,
    }
    book.view = fold(book.view, batch)
    book.view = { ...book.view, head: Math.max(book.view.head, pub) }
    for (const blob of prepared.blobs) book.blobs.set(blob.digest, blob.payload)
    book.published = pub
    // The published fold is the one source of position: the core's view is set to it, and the
    // batches the core appended for this publication leave its log; the next command appends at
    // the next publication count. (The cell keeps a draft only when it is touched.)
    job.copy.cell.mutate(() => {
      const root = job.copy.cell.state()
      root.agent.view = book.view
      root.agent.log = []
      job.copy.cell.touch()
      for (const blob of prepared.blobs)
        root.agent.blobs.set(factDigestOf(blob.digest), JSON.parse(blob.payload) as unknown)
    })
    book.copy = job.copy
    // What the copy holds is now durable: an excluded write, and one the Journal core fenced.
    for (const at of book.held.keys()) {
      const record = job.after.agent.operations.get(at)
      if (record !== undefined && record.kind !== 'pending') book.held.delete(at)
    }
    return { kind: 'answer', value: job.answer }
  }

  /** The `execution-record` participant stopped the write: a lost race is `again`. */
  function settleRecordStop<T>(
    job: Settling<T>,
    reply: ReturnType<typeof decodeExecutionRecordReply>,
  ): Settled<T> {
    switch (reply.kind) {
      case 'revision-conflict':
        return { kind: 'again' }
      case 'operation-conflict':
        return conflicting(job, reply.digest)
      default:
        return {
          kind: 'answer',
          value: fail(
            unavailable(
              `the Agent records were not saved: ${reply.kind}${'diagnostic' in reply ? ` (${reply.diagnostic})` : ''}`,
            ),
          ),
        }
    }
  }

  /**
   * PA-02: the conflict of the finish check is `FinishResult.changed` at the revision the call was
   * checked against, never `Failure.changed` (Agent SPEC "条件终结" result table). The caller
   * reloads and evaluates again; nothing was written.
   */
  function finishChanged<T>(job: Settling<T>): Settled<T> {
    if (job.prior === null)
      return { kind: 'answer', value: fail(unavailable('a finish check without its execution')) }
    const changed: FinishResult = { kind: 'changed', revision: job.prior }
    // The written method is tryFinish, whose answer is a FinishResult.
    return { kind: 'answer', value: succeed(changed) as Outcome<T, Failure> }
  }

  /** The Session participant stopped the write. */
  function settleSessionStop<T>(
    job: Settling<T>,
    stop: Parameters<typeof decodeSessionReply>[0],
  ): Settled<T> {
    const reply = decodeSessionReply(stop)
    const method = participationOf(job.written.method)
    switch (reply.kind) {
      case 'stopped': {
        if (method === null || job.agentOperation === null)
          return {
            kind: 'answer',
            value: fail(unavailable('a Session stop without a participation')),
          }
        const failure = participationFailure(
          method,
          reply.failure as SessionFailure,
          job.agentOperation,
          job.scratch.commands[0]?.kind,
        )
        return method === 'tryFinish' && failure.kind === 'changed'
          ? finishChanged(job)
          : { kind: 'answer', value: fail(failure) }
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

  /**
   * What one storage outcome of a publication answers: the call's answer once the write committed
   * (the copy then reflects it), `again` for a lost race or a recalled own write, and the failure
   * the outcome means otherwise. An unknown outcome keeps the write as held.
   */
  function settle<T>(
    published: Published<T>,
    operation: string,
    outcome: Awaited<ReturnType<typeof commitJournal>>,
  ): Settled<T> {
    const { book, after, written } = published
    const agentOperation = written.operation as AgentOperationId | null
    const job: Settling<T> = { ...published, agentOperation }
    switch (outcome.kind) {
      case 'committed':
        return settleCommitted(job, outcome)
      case 'rolled-back': {
        const stop = outcome.receipt.responses.at(-1)
        if (stop === undefined)
          return {
            kind: 'answer',
            value: fail(unavailable('a rolled back receipt without a reply')),
          }
        return stop.participant === 'execution-record'
          ? settleRecordStop(job, decodeExecutionRecordReply(stop.reply))
          : settleSessionStop(job, stop.reply)
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
      case 'refused':
        return { kind: 'answer', value: fail(refusalFailure(outcome.reason)) }
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
      const named = (input as { execution?: unknown }).execution
      for (let round = 0; round < ROUNDS; round += 1) {
        let synced = await sync(book, domain.ok)
        if ('failure' in synced) return synced
        if (
          typeof named === 'string' &&
          !ROUTE_ONLY.has(method) &&
          !book.loaded.has(named) &&
          !book.view.executions.has(named as AgentExecutionId)
        )
          synced = await loadExecution(book, domain.ok, named)
        if ('failure' in synced) return synced
        const copy = synced.ok
        const scratch: Scratch = {
          checks: [],
          commands: [],
          snapshot: READS.has(method) ? null : await snapshotOf(book, domain.ok),
        }
        book.scratch = scratch
        // The Session's attempt records of this call's snapshot, with the grant each was issued
        // for (R2-D349): the core resolves an Authority's attempt through them (`history.ts`).
        // Adopted before `before` is taken, so adopting alone is not a write.
        const attempts = scratch.snapshot?.historyIndex?.attempts
        if (attempts !== undefined) copy.cell.mutate(() => copy.cell.adoptAttemptRecords(attempts))
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
          input,
          scratch,
          answer,
        )
        if (settled.kind === 'answer') return settled.value
      }
      return fail(unavailable('the Agent records of the session kept changing'))
    })
  }

  /**
   * The cold path of `query` (R2-D292 6.4): an operation the copy does not hold (an ended
   * execution the cold start did not read) is looked up by its key; its batch answers `committed`
   * with the receipt derived from the batch.
   */
  async function queryCold(
    book: Book<P>,
    input: Parameters<AgentJournal<P>['query']>[0],
    answer: Awaited<ReturnType<AgentJournal<P>['query']>>,
  ): Promise<typeof answer> {
    if ('failure' in answer || answer.ok.kind !== 'unknown') return answer
    const domain = await domainOf(book)
    if ('failure' in domain) return answer
    const found = await readOperation(
      readerOf(options.storage, domain.ok),
      book.tenantText,
      storageOperation(input.execution, input.operation) as AgentOperationId,
    )
    if (found.kind !== 'read' || found.batch.batch === null) return answer
    if (found.session !== book.session || found.execution !== input.execution) return answer
    return succeed({
      kind: 'committed',
      receipt: batchReceiptOf(mintOf(book), book.view, found.batch.batch),
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
      readFinish: input =>
        run(
          input,
          'readFinish',
          async core =>
            (await core.port.readFinish?.(input)) ??
            fail(unavailable('the Journal core holds no finish read')),
        ),
      query: async input => {
        const answer = await run(input, 'query', core => core.port.query(input))
        return book === null ? answer : queryCold(book, input, answer)
      },
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
        read: input => run(input, 'entries.read', core => core.provider.entries.read(input)),
        receivedOf: input =>
          run(input, 'entries.receivedOf', core => core.provider.entries.receivedOf(input)),
      },
      materials: {
        preserve: input => run(input, 'preserve', core => core.provider.materials.preserve(input)),
        read: input => run(input, 'materials.read', core => core.provider.materials.read(input)),
        describe: input =>
          run(input, 'materials.describe', core => core.provider.materials.describe(input)),
      },
      received: {
        commit: input => run(input, 'received', core => core.provider.received.commit(input)),
        query: input => run(input, 'received.query', core => core.provider.received.query(input)),
      },
      // The bindings are durable records of the session, so a copy rebuilt after a restart answers
      // as the copy that committed them did.
      targets: {
        forExecution: input =>
          run(input.access, 'targets.forExecution', core => core.targets.forExecution(input)),
        resolve: input => run(input.access, 'targets.resolve', core => core.targets.resolve(input)),
      },
      toolTargets: {
        forExecution: input =>
          run(input.access, 'toolTargets.forExecution', core =>
            core.toolTargets.forExecution(input),
          ),
        resolve: input =>
          run(input.access, 'toolTargets.resolve', core => core.toolTargets.resolve(input)),
      },
    }
  }

  return { forSession, readAdopted, durability: 'storage' as const }
}
