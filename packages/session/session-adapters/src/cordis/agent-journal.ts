import { historyCaller } from './history-caller.ts'
import { jointCommandOf, joinsSession, type JointState } from '../joint-command.ts'
import { sessionCommitCommands } from '@omne-harness/session-storage-sql/participants'
import { createHash, randomUUID } from 'node:crypto'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  AgentReceivedProvider,
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
  contextScopeOf,
  deriveDriveOperation,
  judgeCompletion,
  mutationAccessRequest,
  type InputId,
  type SessionAccessCheck,
  type SessionCommand,
  type SessionFailure,
  type SessionId,
  type SessionControlEvidence,
  type SessionLogConsequence,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import {
  EXECUTION_BATCH_MAX_FACTS,
  SESSION_HISTORY_ROOT_HANDLER,
  SESSION_READ_PROTOCOL,
  decodeExecutionRecordReply,
  decodeSessionHistoryRoot,
  decodeSessionReply,
  executionRecordBlobFacts,
  executionRecordFacts,
  planPublishedCount,
  publishedCountsOf,
  readCachedSessionWork,
  afterSessionCommit,
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
  refusalFailure,
  standingOf,
  type GenerationMemory,
  type JournalCommitResult,
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
import type { ModelReminders } from './model-reminders.ts'
import { reminderCommand, reminderOutcome, reminderReadFailure } from './model-reminder-commit.ts'

export type SessionLogJournalOptions<P> = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
  sessionAccessCheck: SessionAccessCheck<P>
  combination: JournalCombination
  cancellation?: MemoryAgentJournalOptions<P>['cancellation']
  hostRecords?: MemoryAgentJournalOptions<P>['hostRecords']
  fault?: Fault
  report?: (report: JournalPublicationReport) => void
  /** Without it, no write tells the model the runtime context. */
  reminders?: ModelReminders<P>
}>

type Fault = (diagnostic: string) => void

export type JournalPublicationReport = Readonly<{
  tenant: string
  session: SessionId
  execution: string
  operation: string | null
  storageOperation: string
  method: string
  recordBytes: number
  bytes: number
  batchBytes: number
  blobBytes: number
  facts: number
  outcome: 'committed' | 'recalled' | 'rolled-back' | 'commit-unknown' | 'unavailable'
  diagnostic: string | null
}>

const commandBytes = (command: FactCommandV2): number =>
  Buffer.byteLength(JSON.stringify(command), 'utf8')

export type SessionLogJournalProvider<P> = AgentReceivedProvider<P, ContentBlock> & {
  received: NonNullable<AgentReceivedProvider<P, ContentBlock>['received']>
  targets: ModelReceptionTargets<P>
  toolTargets: ToolReceptionTargets<P>
}

export type AdoptedPart = Readonly<{
  order: string
  execution: string
  reference: string
  fixed: DurableEvidence
  coverage: DurableEvidence | null
  schema: RequestView['schema']
  record: JsonValue
}>

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

type Held = {
  readonly execution: AgentExecutionId
  readonly operation: AgentOperationId
  readonly key: string
  readonly storageOperation: string
  readonly attempt: number
  readonly custody: CustodyAttempt | null
  standing: 'unknown' | 'excluded'
}

type Book<P> = {
  readonly key: string
  readonly tenant: TenantId
  readonly tenantText: string
  readonly session: SessionId
  view: SessionJournalView
  readonly blobs: Map<string, string>
  readonly parsed: Map<string, unknown>
  copy: Copy<P> | null
  published: number | null
  readonly loaded: Set<string>
  scratch: Scratch | null
  queue: Promise<void>
  users: number
  readonly held: Map<string, Held>
}

const PARTICIPANTS = ['message', 'context-transition', 'custody', 'processed'] as const
const ROUNDS = 4
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
const BLOBS_WITH_BATCH_BYTES = 256 * 1024

const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})

type OpenInput<P> = Parameters<AgentJournal<P>['open']>[0]
type AttachInput<P> = Parameters<AgentJournal<P>['attach']>[0]

function storageOperation(execution: string, operation: string): string {
  return `aop_${createHash('sha256')
    .update(JSON.stringify([execution, operation]))
    .digest('hex')
    .slice(0, 40)}`
}

type Written = Readonly<{
  method: string
  execution: string | null
  operation: string | null
  digest: string
}>

const ROUTE_ONLY: ReadonlySet<string> = new Set(['preserve'])

function writtenOf(method: string, input: object): Written {
  const value = input as { execution?: unknown; operation?: unknown }
  const own = !ROUTE_ONLY.has(method)
  return {
    method,
    execution: own && typeof value.execution === 'string' ? value.execution : null,
    operation: own && typeof value.operation === 'string' ? value.operation : null,
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

function placeholderHead(execution: MemoryExecution): DurableEvidence {
  return {
    owner: OWNER,
    record: `${execution.id}/head`,
    revision: String(execution.revision),
    digest: 'unknown',
  }
}

const projected = (value: unknown): JsonValue =>
  value === null || value === undefined ? null : (JSON.parse(JSON.stringify(value)) as JsonValue)

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

export type InterpretableEvent = Readonly<{
  sequence: string
  source: DurableEvidence
  consequences: readonly SessionLogConsequence[] | null
  control: SessionControlEvidence | null
}>

export type ExecutionInterpretation = Readonly<{
  revision: string
  head: DurableEvidence | null
  emittedThrough: string
  events: readonly InterpretableEvent[]
}>

export type InterpretationRead =
  | Readonly<{ kind: 'read'; execution: ExecutionInterpretation | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type DomainResolution =
  | Readonly<{ kind: 'ready'; domain: DomainRef }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

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

export type ExecutionRecordsRead =
  | Readonly<{ kind: 'read'; execution: MemoryExecution | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const HEX_DIGEST = /^[0-9a-f]{64}$/

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

function listedDigests(payload: string): string[] {
  const value = JSON.parse(payload) as unknown
  if (!Array.isArray(value)) return []
  return value.flatMap(item =>
    Array.isArray(item) && typeof item[1] === 'string' && HEX_DIGEST.test(item[1]) ? [item[1]] : [],
  )
}

async function fetchNamed(
  read: Reader,
  tenant: string,
  executions: Iterable<ExecutionView>,
  into: Map<string, string>,
): Promise<string | null> {
  const named = new Set<string>()
  const lists: string[] = []
  const cursors: string[] = []
  for (const execution of executions) {
    for (const ref of refsIn(execution)) named.add(blobRowDigest(ref))
    for (const list of execution.finish.lists.values()) lists.push(list.issued.listed.digest)
    for (const candidate of execution.finish.candidates) cursors.push(candidate.cursor.digest)
  }
  const missing = await fetchBlobClosure(read, tenant, named, into)
  if (missing !== null) return missing
  const items = new Set<string>()
  for (const digest of lists) {
    const payload = into.get(blobRowDigest(digest))
    if (payload === undefined) continue
    for (const item of listedDigests(payload)) items.add(blobRowDigest(item))
  }
  // A candidate keeps the cursor of the step it was established on; after later steps only that cursor block names the member blocks of that step.
  for (const digest of cursors) {
    const payload = into.get(blobRowDigest(digest))
    if (payload === undefined) continue
    for (const ref of refsIn(JSON.parse(payload) as unknown)) items.add(blobRowDigest(ref))
  }
  return fetchBlobClosure(read, tenant, items, into)
}

type RecordsFold = {
  head: number
  view: SessionJournalView
  blobs: Map<string, string>
  parsed: Map<string, unknown>
  executions: Set<string>
}

const recordsFolds = new WeakMap<SqlStorage, Map<string, RecordsFold>>()
const RECORDS_FOLDS = 256
const RECORDS_FOLD_TEXT = 16 * 1024 * 1024

export function dropFoldsOver<Fold extends { blobs: ReadonlyMap<string, string> }>(
  folds: Map<string, Fold>,
  used: Fold,
  limit: number,
): void {
  const textOf = (fold: Fold) => {
    let text = 0
    for (const payload of fold.blobs.values()) text += payload.length
    return text
  }
  let total = 0
  for (const fold of folds.values()) total += textOf(fold)
  for (const [key, fold] of folds) {
    if (total <= limit) break
    if (fold === used) continue
    total -= textOf(fold)
    folds.delete(key)
  }
}

function recordsFoldOf(storage: SqlStorage, key: string): RecordsFold {
  let folds = recordsFolds.get(storage)
  if (folds === undefined) {
    folds = new Map()
    recordsFolds.set(storage, folds)
  }
  let found = folds.get(key)
  if (found !== undefined) {
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
  } finally {
    const folds = recordsFolds.get(options.storage)
    if (folds !== undefined) dropFoldsOver(folds, kept, RECORDS_FOLD_TEXT)
  }
}

function projectionContext(
  tenant: TenantId,
  tenantText: string,
  session: SessionId,
  rows: ReadonlyMap<string, string>,
  parsed: Map<string, unknown>,
): ProjectionContext {
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

function diagnosticOf(error: unknown): string {
  if (error instanceof HistoryFailure && error.failure.kind === 'unavailable')
    return error.failure.diagnostic
  return error instanceof Error ? error.message : 'original result'
}

function jointState<P>(
  book: Readonly<{ scratch: Scratch | null }>,
  cell: JournalCell<P>,
  input: ExecutionMutation<P>,
  method: JournalWrite,
): JointState {
  const root = cell.state()
  const execution = [...root.agent.executions.values()].find(item => item.id === input.execution)
  return {
    accepted: execution?.inputs,
    snapshot: book.scratch?.snapshot,
    resultOf(caller) {
      if (execution === undefined) return fail({ kind: 'denied', action: method })
      try {
        return succeed(normalizedResult(root, execution, caller.consumption, caller.result).result)
      } catch (error) {
        return fail(unavailable(diagnosticOf(error)))
      }
    },
  }
}

function beginsStep(appended: readonly PublishedBatch[]): boolean {
  return appended.some(batch => batch.facts.some(fact => fact.kind === 'step.begun'))
}

function kindsOf(scratch: Scratch): ParticipationKind[] {
  const kinds: ParticipationKind[] = []
  for (const command of scratch.commands)
    switch (command.kind) {
      case 'recordMessage':
        kinds.push('deliveries' in command.input.value ? 'delivered' : 'message')
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

export function createSessionLogJournal<P>(options: SessionLogJournalOptions<P>) {
  const books = new Map<string, Book<P>>()
  const counts = publishedCountsOf(options.storage)
  const undecided = (book: Book<P>): boolean => {
    for (const held of book.held.values()) if (held.standing === 'unknown') return true
    return false
  }
  const generations: GenerationMemory = new Map()

  function bookOf(tenant: TenantId, session: SessionId): Book<P> | null {
    const text = tenantCodec.encode(tenant)
    if (!text.ok) return null
    const key = JSON.stringify([text.value, session])
    let book = books.get(key)
    if (book === undefined) {
      book = {
        key,
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
        users: 0,
        held: new Map(),
      }
      books.set(key, book)
    }
    return book
  }

  const quiescent = (book: Book<P>): boolean =>
    book.held.size === 0 &&
    book.view.executions.size > 0 &&
    [...book.view.executions.values()].every(execution => execution.finish.ended !== null)

  // Reset only the working copy of the resting book. Keep the book itself: queued calls rely on its one serial order.
  let resting: Book<P> | null = null
  function rest(book: Book<P>): void {
    if (resting !== null && resting !== book) {
      if (resting.users === 0 && quiescent(resting)) {
        resting.copy = null
        resting.view = emptySessionView()
        resting.published = null
        resting.blobs.clear()
        resting.parsed.clear()
        resting.loaded.clear()
      }
      resting = null
    }
    if (quiescent(book)) resting = book
  }

  function serial<T>(book: Book<P>, task: () => Promise<T>): Promise<T> {
    book.users += 1
    const run = book.queue.then(task, task).finally(() => {
      book.users -= 1
      rest(book)
    })
    book.queue = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  async function domainOf(book: Book<P>): Promise<Outcome<DomainRef, Failure>> {
    const resolved = await resolveDomain(options.tenantDomainLookup, book.tenantText)
    return resolved.kind === 'ready'
      ? succeed(resolved.domain)
      : fail(unavailable(resolved.diagnostic))
  }

  const scopeOf = (book: Book<P>) => ({ tenant: book.tenantText, session: book.session })
  const mintOf = (book: Book<P>) => ({
    owner: JOURNAL_OWNER,
    session: JSON.stringify([book.tenantText, book.session]),
  })

  async function snapshotOf(
    book: Book<P>,
    domain: DomainRef,
  ): Promise<Outcome<WorkSnapshot | null, Failure>> {
    const work = await readCachedSessionWork(options.storage, domain, book.tenantText, book.session)
    switch (work.kind) {
      case 'state':
        return succeed(work.snapshot)
      case 'absent':
        return succeed(null)
      case 'behind':
        return fail(unavailable('session.work: the state does not cover the tail yet'))
      case 'unavailable':
        return fail(unavailable(work.diagnostic))
    }
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

  function jointCommand(
    book: Book<P>,
    cell: JournalCell<P>,
    input: ExecutionMutation<P>,
    method: JournalWrite,
    receipt: CommandReceipt,
  ): Outcome<SessionCommand, Failure> | undefined {
    return jointCommandOf(
      book,
      input,
      method,
      receipt,
      historyCaller(input, method),
      jointState(book, cell, input, method),
    )
  }

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

  function restore(book: Book<P>, cell: JournalCell<P>, records: ProjectedRecords): void {
    cell.mutate(() => {
      const root = cell.state()
      const into = <K, V>(target: Map<K, V>, source: ReadonlyMap<K, V>) => {
        for (const [key, value] of source) target.set(key, value)
      }
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

  function build(book: Book<P>): Copy<P> {
    const cell: JournalCell<P> = createCell<P>(book.tenant, book.session, {
      authorize: () => undefined,
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
      participates: (input, method) =>
        joinsSession(
          input,
          method,
          historyCaller(input, method),
          jointState(book, cell, input, method),
        ),
      qualifyParticipation: (input, method, receipt) => qualify(book, cell, input, method, receipt),
      terminalParticipant: input => terminalParticipant(book, cell, input.execution, input.control),
      ...(options.cancellation === undefined ? {} : { cancellation: options.cancellation }),
      ...(options.hostRecords === undefined ? {} : { hostRecords: options.hostRecords }),
    })
    return { cell, core }
  }

  function putBack(book: Book<P>, cell: JournalCell<P>): void {
    if (book.held.size === 0) return
    cell.mutate(() => {
      const root = cell.state()
      for (const [at, held] of book.held) {
        if (root.agent.operations.has(at)) continue
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

  async function readRoot(book: Book<P>, domain: DomainRef) {
    const output = await readOutput(options.storage, {
      domain,
      handler: SESSION_HISTORY_ROOT_HANDLER,
      protocol: SESSION_READ_PROTOCOL,
      input: { tenant: book.tenantText, session: book.session },
    })
    const unreadable = 'the common root of the session is not readable'
    if (output.kind === 'unread') return `${unreadable}: ${output.reason}`
    return decodeSessionHistoryRoot(output.output) ?? unreadable
  }

  function foldRead(book: Book<P>, batches: readonly ReadBatch[], published: number): void {
    for (const batch of batches) if (batch.batch !== null) book.view = fold(book.view, batch.batch)
    book.view = { ...book.view, head: Math.max(book.view.head, published) }
    book.published = published
    book.copy = null
  }

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

  async function fetchBlobs(book: Book<P>, read: Reader): Promise<Failure | null> {
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

  async function sync(book: Book<P>, domain: DomainRef): Promise<Outcome<Copy<P>, Failure>> {
    const plan = planPublishedCount(counts.get(book.key), undecided(book))
    let published: number
    let excluded = false
    if (plan.kind === 'known') published = plan.published
    else {
      const root = await readRoot(book, domain)
      if (typeof root === 'string') return fail(unavailable(root))
      excluded = await settleHeld(book, domain)
      published = Number(root.published)
      counts.confirm(book.key, published)
    }
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

  type Prepared = Readonly<{
    envelope: BatchEnvelope
    derived: readonly DerivedFact[]
    records: readonly ExecutionFactRecord[]
    blobs: readonly ExecutionBlobRecord[]
    batchBytes: number
  }>

  function prepare(
    book: Book<P>,
    after: CommonRoot,
    own: MemoryExecution | undefined,
    appended: readonly PublishedBatch[],
    written: Written,
    scratch: Scratch,
  ): Outcome<Prepared, Failure> {
    const blobs = new Map<string, ExecutionBlobRecord>()
    coreBlobRows(after.agent.blobs, row => book.blobs.has(row), blobs)
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

  function modelScope(book: Book<P>, snapshot: WorkSnapshot): ScopeRef | null {
    const scopes = snapshot.contextScopes
    const open =
      scopes === undefined
        ? contextScopeOf({ tenant: book.tenant, session: book.session, generation: '1' })
        : scopes.findLast(item => item.ended === null)?.scope
    return open === undefined ? null : ({ ref: open } as ScopeRef)
  }

  function forgetTold(book: Book<P>, snapshot: WorkSnapshot | null): void {
    const scope = snapshot === null ? null : modelScope(book, snapshot)
    if (scope !== null) options.reminders?.forget({ tenant: book.tenant, scope })
  }

  // The request that resumes after a compaction is prepared in the same step: the model is told
  // in full right after the compaction is committed. If that fails, the next step tells it.
  async function tellAfterCompaction(
    book: Book<P>,
    domain: DomainRef,
    input: ExecutionMutation<P>,
    scratch: Scratch,
    outcome: JournalCommitResult,
  ): Promise<void> {
    if (outcome.kind === 'refused') return
    forgetTold(book, scratch.snapshot)
    if (outcome.kind !== 'committed') return
    const fresh = await snapshotOf(book, domain)
    const told =
      'failure' in fresh
        ? ({ kind: 'answer', value: fail(fresh.failure) } as const)
        : await tellModel<unknown>(book, domain, input, fresh.ok)
    if (told?.kind === 'answer' && 'failure' in told.value)
      options.fault?.(
        `the runtime context after a compaction is told at the next step: ${JSON.stringify(told.value.failure)}`,
      )
  }

  // Before a step takes its inputs, the model is told what changed in the runtime context: the
  // reminder is its own Session commit, right before the step, and the step is written again on
  // the revision it made. A read that fails fails the step; nothing told moves on unless committed.
  async function tellModel<T>(
    book: Book<P>,
    domain: DomainRef,
    input: ExecutionMutation<P>,
    snapshot: WorkSnapshot | null,
  ): Promise<Settled<T> | null> {
    const reminders = options.reminders
    if (reminders === undefined) return null
    const answer = (failure: Failure): Settled<T> => ({ kind: 'answer', value: fail(failure) })
    if (snapshot === null) return answer(unavailable('no Session snapshot to tell the model from'))
    const scope = modelScope(book, snapshot)
    if (scope === null) return answer(unavailable('the session has no open context scope'))
    const prepared = await reminders.prepare({
      principal: input.principal,
      tenant: book.tenant,
      scope,
      at: String(snapshot.revision),
    })
    if ('failure' in prepared) return answer(reminderReadFailure(prepared.failure))
    const [message] = prepared.ok.messages
    if (message === undefined) {
      prepared.ok.advance()
      return null
    }
    const command = reminderCommand({
      tenant: book.tenant,
      session: book.session,
      scope,
      at: snapshot.revision,
      viewRevision: prepared.ok.viewRevision,
      message,
    })
    const outcome = await commitJournal({
      storage: options.storage,
      domain,
      combination: options.combination,
      operation: command.input.operation,
      commands: sessionCommitCommands([sessionCommandFacts(command, [])]),
      generations,
    })
    await afterSessionCommit({
      storage: options.storage,
      domain,
      tenant: book.tenantText,
      session: book.session,
      answer:
        outcome.kind === 'committed'
          ? { receipt: outcome.receipt, recalled: outcome.recalled }
          : null,
      journal: { published: book.published === null ? null : String(book.published) },
    })
    const settled = reminderOutcome(outcome)
    if (settled === 'told') prepared.ok.advance()
    return typeof settled === 'string' ? { kind: 'again' } : answer(settled)
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
    // The copy now holds an unpublished state: drop it so the next call rebuilds from the facts. The view and its head stay.
    const published = book.published ?? 0
    book.copy = null
    const changed = changedExecutions(before, after)
    const own = changed.find(item => item.id === written.execution) ?? changed[0]
    const prior =
      own === undefined
        ? undefined
        : [...before.agent.executions.values()].find(item => item.id === own.id)
    const receipt = receiptOf(answer)
    const appended = after.agent.log.filter(batch => batch.pub > book.view.head)
    if (appended.length === 0)
      return {
        kind: 'answer',
        value: fail(unavailable(`a ${written.method} changed the Agent records without a batch`)),
      }
    if (beginsStep(appended)) {
      const told = await tellModel<T>(book, domain, input as ExecutionMutation<P>, scratch.snapshot)
      if (told !== null) return told
    }
    const execution = appended[0]!.execution
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
    const commands = sessionCommitCommands([
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
    ])
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
    await afterSessionCommit({
      storage: options.storage,
      domain,
      tenant: book.tenantText,
      session: book.session,
      answer:
        outcome.kind === 'committed'
          ? { receipt: outcome.receipt, recalled: outcome.recalled }
          : null,
      journal: { published: book.published === null ? null : String(book.published) },
    })
    if (scratch.commands.some(item => item.kind === 'commitDerived'))
      await tellAfterCompaction(book, domain, input as ExecutionMutation<P>, scratch, outcome)
    return settled
  }

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
    } catch {}
  }

  type Published<T> = Readonly<{
    book: Book<P>
    copy: Copy<P>
    after: CommonRoot
    prepared: Prepared
    execution: string
    written: Written
    prior: ExecutionRevision | null
    scratch: Scratch
    answer: Outcome<T, Failure>
  }>
  type Settling<T> = Published<T> &
    Readonly<{
      agentOperation: AgentOperationId | null
    }>
  function nameless<T>(what: string): Settled<T> {
    return {
      kind: 'answer',
      value: fail(unavailable(`${what} of a write without an Agent operation`)),
    }
  }

  function conflicting<T>(job: Settling<T>, digest: string): Settled<T> {
    if (digest === job.written.digest) return { kind: 'again' }
    return job.agentOperation === null
      ? nameless('a conflict')
      : { kind: 'answer', value: fail({ kind: 'conflict', operation: job.agentOperation }) }
  }

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
    counts.confirm(book.key, pub)
    job.copy.cell.mutate(() => {
      const root = job.copy.cell.state()
      root.agent.view = book.view
      root.agent.log = []
      job.copy.cell.touch()
      for (const blob of prepared.blobs)
        root.agent.blobs.set(factDigestOf(blob.digest), JSON.parse(blob.payload) as unknown)
    })
    book.copy = job.copy
    for (const at of book.held.keys()) {
      const record = job.after.agent.operations.get(at)
      if (record !== undefined && record.kind !== 'pending') book.held.delete(at)
    }
    return { kind: 'answer', value: job.answer }
  }

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

  function finishChanged<T>(job: Settling<T>): Settled<T> {
    if (job.prior === null)
      return { kind: 'answer', value: fail(unavailable('a finish check without its execution')) }
    const changed: FinishResult = { kind: 'changed', revision: job.prior }
    return { kind: 'answer', value: succeed(changed) as Outcome<T, Failure> }
  }

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

  function settle<T>(
    published: Published<T>,
    operation: string,
    outcome: Awaited<ReturnType<typeof commitJournal>>,
  ): Settled<T> {
    const { book, after, written } = published
    const agentOperation = written.operation as AgentOperationId | null
    const job: Settling<T> = { ...published, agentOperation }
    counts.doubt(book.key)
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
        const snapshot = READS.has(method) ? succeed(null) : await snapshotOf(book, domain.ok)
        if ('failure' in snapshot) return snapshot
        const scratch: Scratch = { checks: [], commands: [], snapshot: snapshot.ok }
        book.scratch = scratch
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
          const copy = await serial(book, async () => {
            const domain = await domainOf(book)
            if ('failure' in domain) return domain
            const synced = await sync(book, domain.ok)
            if ('ok' in synced) book.users += 1
            return synced
          })
          if ('failure' in copy) {
            yield copy
            return
          }
          try {
            yield* copy.ok.core.port.output.events(input)
          } finally {
            book.users -= 1
            rest(book)
          }
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
