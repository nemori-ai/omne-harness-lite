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
  cancellationDriveOf,
  commandDigest,
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
import {
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
  type JournalCombination,
} from '../journal-commit.ts'
import {
  BATCH_OVERHEAD_BYTES,
  emptySessionView,
  receiptOf as batchReceiptOf,
  type ParticipationKind,
  type PublishedBatch,
  type RequestView,
  type SessionJournalView,
} from '../journal/index.ts'
import {
  participationAccessFailure,
  participationFailure,
  participationMethodOf,
} from '../participation-mapping.ts'
import { HistoryFailure, normalizedResult } from '../testing/history.ts'
import {
  DEFAULT_EVENT_SCHEMA,
  DEFAULT_REPLY_ADMISSION_RULE,
  createJournal,
  outrunParticipation,
  type JointDecision,
  type JournalWrite,
  type MemoryAgentJournalOptions,
  type MemoryExecution,
} from '../testing/journal.ts'
import { JOURNAL_OWNER, operationText, revisionOf } from '../testing/journal-values.ts'
import {
  createCell,
  operationSemantic,
  type CommonRoot,
  type JournalCell,
} from '../testing/root.ts'
import { blobRowDigest, factDigestOf } from './journal-batch.ts'
import { ContentRefs, keepNamed, settleBlocks } from './content-refs.ts'
import { fetchNamed } from './block-read.ts'
import {
  ANSWER_FAMILY,
  NeedItems,
  answerRef,
  itemText,
  type ItemRef,
} from '../testing/closed-items.ts'
import {
  restoreRecords,
  heldOrigins,
  fetchClosed,
  closesOpen,
  foldFull,
  lendFetched,
  readOpenView,
  recordsView,
  unlend,
  unsettled,
  type FullViews,
} from './item-read.ts'
import { EVENT_PAGE, eventsAfter, newTurns, turn, type Turns } from './event-stream.ts'
import { SharedMap } from '../journal/shared-map.ts'
import { boundariesOf, captureFresh, projectionOf, type Fault } from './event-projection.ts'
import {
  headsOf,
  JOURNAL_PROVIDER,
  preparePublication,
  unavailable,
  type Prepared,
} from './journal-publication.ts'
import { projectRecords, type ProjectionContext } from '../testing/journal-records.ts'
import {
  readBlob,
  readEvents,
  readOpenExecutions,
  readTouched,
  readOperation,
  readOutput,
  readerOf,
  type Reader,
} from './journal-read.ts'
import { attemptOfAuthority, attemptOfGrant } from './attempt-grant.ts'
import { createModelTelling, type ModelReminders } from './model-telling.ts'

export type SessionLogJournalOptions<P> = Readonly<{
  storage: SqlStorage
  tenantDomainLookup: TenantDomainLookup
  sessionAccessCheck: SessionAccessCheck<P>
  combination: JournalCombination
  cancellation?: MemoryAgentJournalOptions<P>['cancellation']
  hostRecords?: MemoryAgentJournalOptions<P>['hostRecords']
  fault?: Fault
  report?: (report: JournalPublicationReport) => void
  reminders?: ModelReminders<P> | undefined
}>

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
  // How many open items name each block of blobs and parsed: a block no open item names leaves both.
  readonly refs: ContentRefs
  // Closed items this call read back by original key (null: the store holds none), by itemText.
  readonly fetched: Map<string, unknown>
  readonly lentBlocks: Map<string, string>
  readonly full: FullViews
  origins: CommonRoot['agent']['callOrigins']
  readonly turns: Turns
}

const PARTICIPANTS = ['message', 'context-transition', 'custody', 'processed'] as const
const LOST_RACES = 4
const READS: ReadonlySet<string> = new Set([
  'load',
  'readCancellationInstallation',
  'inputs',
  'readReplyAdmissions',
  'query',
  'inputAcceptance',
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
const OWNER = JOURNAL_PROVIDER
const BLOBS_WITH_BATCH_BYTES = 256 * 1024
const unread = <T>(answer: Outcome<T, Failure> | undefined, what: string): Outcome<T, Failure> =>
  answer ?? fail(unavailable(`the Journal core holds no ${what} read`))

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
  head: DurableEvidence
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

export async function resolvedOf(
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
  return {
    kind: 'read',
    execution: {
      revision: read.revision,
      head: read.receipt as unknown as DurableEvidence,
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

// The views of these executions as the store holds them open, in place of what the book held.
function adopt<P>(
  book: Book<P>,
  found: Extract<Awaited<ReturnType<typeof readOpenView>>, { kind: 'read' }>,
  published: number,
): void {
  book.refs.keep(book, [], found.contents.values())
  const executions = new SharedMap(book.view.executions)
  for (const view of found.views) {
    executions.set(view.execution, view)
    book.full.delete(view.execution)
    for (const key of book.origins.keys())
      if (key.startsWith(`${view.execution}\0`)) book.origins.delete(key)
  }
  for (const view of found.full) book.full.set(view.execution, view)
  book.view = { head: Math.max(book.view.head, published), executions }
  book.published = Math.max(book.published ?? 0, published)
  book.copy = null
  turn(book.turns)
}

async function fetchBlobs<P>(book: Book<P>, read: Reader): Promise<Failure | null> {
  const views = recordsView(book.view, book.full).executions.values()
  const missing = await fetchNamed(read, book.tenantText, views, book.blobs)
  return missing === null
    ? null
    : unavailable(`the content block ${missing} of the Agent records is not readable`)
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
    accepted: execution?.inputs.filter(() => true),
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

// The batch a write publishes, prepared against what the book has published.
function publicationOf<P>(
  book: Book<P>,
  write: Readonly<{
    before: CommonRoot
    after: CommonRoot
    own: MemoryExecution | undefined
    appended: readonly PublishedBatch[]
    written: Written
    scratch: Scratch
  }>,
  fault: Fault | undefined,
) {
  const { before, after, own, appended, written, scratch } = write
  return preparePublication({
    closedBefore: before.agent.closed,
    view: book.view,
    published: book.published ?? 0,
    held: row => book.refs.held(book, row),
    after,
    own,
    appended,
    method: written.method,
    kinds: kindsOf(scratch),
    project: (owner, event) => projectionOf(after, owner, event, fault),
  })
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

type Settled<T> =
  | Readonly<{ kind: 'answer'; value: Outcome<T, Failure> }>
  | Readonly<{ kind: 'again' }>
  | Readonly<{ kind: 'fetch'; refs: readonly ItemRef[] }>

type Published<P, T> = Readonly<{
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
type Settling<P, T> = Published<P, T> &
  Readonly<{
    agentOperation: AgentOperationId | null
  }>
function nameless<T>(what: string): Settled<T> {
  return {
    kind: 'answer',
    value: fail(unavailable(`${what} of a write without an Agent operation`)),
  }
}

// The store already holds the operation: read back what it answered, so the next round recognizes
// it; once read, the same digest runs again and another one conflicts.
function recalled<P, T>(job: Settling<P, T>, digest: string): Settled<T> {
  if (job.agentOperation !== null && job.written.execution !== null) {
    const ref = answerRef(job.written.execution as AgentExecutionId, job.agentOperation)
    if (!job.book.fetched.has(itemText(ref))) return { kind: 'fetch', refs: [ref] }
  }
  return conflicting(job, digest)
}

function conflicting<P, T>(job: Settling<P, T>, digest: string): Settled<T> {
  if (digest === job.written.digest) return { kind: 'again' }
  return job.agentOperation === null
    ? nameless('a conflict')
    : { kind: 'answer', value: fail({ kind: 'conflict', operation: job.agentOperation }) }
}

function settleRecordStop<P, T>(
  job: Settling<P, T>,
  reply: ReturnType<typeof decodeExecutionRecordReply>,
): Settled<T> {
  switch (reply.kind) {
    case 'revision-conflict':
      return { kind: 'again' }
    case 'operation-conflict':
      return recalled(job, reply.digest)
    // The store holds an item this write opens, or not the open one it changes: closed work.
    case 'item-conflict': {
      const ref: ItemRef = {
        execution: reply.execution as AgentExecutionId,
        family: reply.family,
        item: reply.item,
      }
      if (!job.book.fetched.has(itemText(ref))) return { kind: 'fetch', refs: [ref] }
      return job.agentOperation === null
        ? nameless('an item conflict')
        : { kind: 'answer', value: fail({ kind: 'conflict', operation: job.agentOperation }) }
    }
    default:
      return {
        kind: 'answer',
        value: fail(
          unavailable(
            `the Agent records were not saved: ${reply.kind}${'diagnostic' in reply ? ` (${reply.diagnostic})` : 'reason' in reply ? ` (${reply.reason})` : ''}`,
          ),
        ),
      }
  }
}

function finishChanged<P, T>(job: Settling<P, T>): Settled<T> {
  if (job.prior === null)
    return { kind: 'answer', value: fail(unavailable('a finish check without its execution')) }
  const changed: FinishResult = { kind: 'changed', revision: job.prior }
  return { kind: 'answer', value: succeed(changed) as Outcome<T, Failure> }
}

export function createSessionLogJournal<P>(options: SessionLogJournalOptions<P>) {
  const books = new Map<string, Book<P>>()
  const counts = publishedCountsOf(options.storage)
  const undecided = (book: Book<P>): boolean => {
    for (const held of book.held.values()) if (held.standing === 'unknown') return true
    return false
  }
  const generations: GenerationMemory = new Map()
  const telling = createModelTelling<P, Book<P>>({ ...options, generations, read: snapshotOf })

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
        refs: new ContentRefs(),
        fetched: new Map(),
        lentBlocks: new Map(),
        origins: new SharedMap(),
        full: new Map(),
        turns: newTurns(),
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
        resting.full.clear()
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
        const matches = cancellationDriveOf(judged.terminal, execution) === control
        return fact(judged.terminal.evidence, { kind: matches ? 'ready' : 'changed' })
      }
    }
  }

  function build(book: Book<P>): Copy<P> {
    const records = recordsView(book.view, book.full)
    keepNamed(book.refs, records, book)
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
    restoreRecords(
      book,
      cell,
      projectRecords(
        records,
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

  async function loadExecution(
    book: Book<P>,
    domain: DomainRef,
    execution: string,
  ): Promise<Outcome<Copy<P>, Failure>> {
    const read = readerOf(options.storage, domain)
    const found = await readOpenView(read, scopeOf(book), [execution], book.published ?? 0)
    if (found.kind === 'unavailable') return fail(unavailable(found.diagnostic))
    book.loaded.add(execution)
    if (found.views.length > 0) adopt(book, found, found.published)
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
    // Cold: the open items of the session. Another writer published: the open items of the
    // executions its batches touched, read again.
    if (book.published === null) {
      const open = await readOpenExecutions(read, scopeOf(book))
      if (open.kind === 'unavailable') return fail(unavailable(open.diagnostic))
      const found = await readOpenView(read, scopeOf(book), open.executions, open.published)
      if (found.kind === 'unavailable') return fail(unavailable(found.diagnostic))
      adopt(book, found, Math.min(found.published, open.published))
      for (const execution of open.executions) book.loaded.add(execution)
    } else if (book.published < published) {
      const touched = await readTouched(read, scopeOf(book), book.published)
      if (touched.kind === 'unavailable') return fail(unavailable(touched.diagnostic))
      const executions = [...touched.executions].filter(item => book.loaded.has(item))
      const found = await readOpenView(read, scopeOf(book), executions, touched.published)
      if (found.kind === 'unavailable') return fail(unavailable(found.diagnostic))
      adopt(book, found, Math.min(found.published, touched.published))
    }
    // Every execution that finishes is held in full.
    const owed = unsettled(book.view.executions.values(), book.full)
    if (!excluded && book.copy !== null && owed.length === 0) return succeed(book.copy)
    if (owed.length > 0) {
      const found = await readOpenView(read, scopeOf(book), owed, book.published ?? 0)
      if (found.kind === 'unavailable') return fail(unavailable(found.diagnostic))
      adopt(book, found, Math.min(found.published, book.published ?? 0))
    }
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
            order: String(latest.request.pub),
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
    accepted: DurableEvidence | undefined,
    scratch: Scratch,
  ): ExecutionAdmissionRecord[] {
    if ((written.method !== 'open' && written.method !== 'submit') || own === undefined) return []
    if (accepted === undefined) return []
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
        accepted,
        grant: check?.kind === 'open' ? check.grant : accepted,
        attachment: attachment.authority.executionAttachment,
        ...(original === undefined ? {} : { attempt: original.attempt }),
      },
    ]
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
    const appended = after.agent.log.filter(batch => batch.pub > book.view.head)
    if (appended.length === 0)
      return {
        kind: 'answer',
        value: fail(unavailable(`a ${written.method} changed the Agent records without a batch`)),
      }
    const told = await telling.beforeStep(book, domain, input, scratch, appended)
    if (told !== null) return told
    const heads = headsOf(mintOf(book), after.agent.view, appended)
    const execution = appended[0]!.execution
    const operation = storageOperation(
      execution,
      written.operation ?? `${written.method}\0${randomUUID()}`,
    )
    let prepared: Prepared
    try {
      const made = publicationOf(
        book,
        { before, after, own, appended, written, scratch },
        options.fault,
      )
      if ('failure' in made) return { kind: 'answer', value: made }
      prepared = made.ok
    } catch (error) {
      if (error instanceof NeedItems) throw error
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
        ...prepared.itemRows,
        boundaries: boundariesOf(changed, heads),
        admissions: admissionsOf(written, own, own && heads.get(own.id), scratch),
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
    await telling.afterCompaction(book, domain, input, scratch, outcome)
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

  function settleCommitted<T>(
    job: Settling<P, T>,
    receipt: Extract<Awaited<ReturnType<typeof commitJournal>>, { kind: 'committed' }>,
  ): Settled<T> {
    const entry = receipt.receipt.responses.find(item => item.participant === 'execution-record')
    const reply = entry === undefined ? null : decodeExecutionRecordReply(entry.reply)
    if (reply?.kind !== 'published')
      return {
        kind: 'answer',
        value: fail(unavailable('a committed receipt without the Agent records')),
      }
    if (receipt.recalled) return recalled(job, reply.digest)
    const { book, prepared } = job
    const pub = Number(reply.published)
    // The publication is conditional on the head this write read, so it lands where it was folded.
    if (pub !== prepared.pub)
      throw new TypeError(
        `the batch folded at ${String(prepared.pub)} was published at ${String(pub)}`,
      )
    book.view = { ...prepared.view, head: Math.max(prepared.view.head, pub) }
    const execution = job.written.execution as AgentExecutionId
    const { dropped } = foldFull(book.full, execution, prepared, pub)
    const released = settleBlocks(book.refs, prepared, book)
    book.published = pub
    counts.confirm(book.key, pub)
    job.copy.cell.mutate(() => {
      const root = job.copy.cell.state()
      root.agent.view = book.view
      root.agent.log = []
      // The store holds what this write answered: the core keeps only the open operations.
      for (const [text, body] of root.agent.closed) {
        const [execution, family, operation] = JSON.parse(text) as [string, string, string]
        if (family === ANSWER_FAMILY && body !== null)
          root.agent.operations.delete(
            operationText(
              book.tenantText,
              execution as AgentExecutionId,
              operation as AgentOperationId,
            ),
          )
      }
      root.agent.closed.clear()
      job.copy.cell.touch()
      for (const blob of prepared.blobs)
        root.agent.blobs.set(factDigestOf(blob.digest), JSON.parse(blob.payload) as unknown)
      for (const digest of released) root.agent.blobs.delete(digest)
    })
    book.origins = heldOrigins(job.copy.cell.state().agent.callOrigins, book.view)
    // Records project the open view: once an open item closes or finishing ends, they are rebuilt.
    book.copy = dropped || closesOpen(prepared.changes) ? null : job.copy
    turn(book.turns)
    for (const at of book.held.keys()) {
      const record = job.after.agent.operations.get(at)
      if (record !== undefined && record.kind !== 'pending') book.held.delete(at)
    }
    return { kind: 'answer', value: job.answer }
  }

  function settleSessionStop<T>(
    job: Settling<P, T>,
    stop: Parameters<typeof decodeSessionReply>[0],
  ): Settled<T> {
    const reply = decodeSessionReply(stop)
    const method = participationMethodOf(job.written.method)
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
    published: Published<P, T>,
    operation: string,
    outcome: Awaited<ReturnType<typeof commitJournal>>,
  ): Settled<T> {
    const { book, after, written } = published
    const agentOperation = written.operation as AgentOperationId | null
    const job: Settling<P, T> = { ...published, agentOperation }
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
      // What an earlier call read back held at its head only: "none" may have changed since.
      if (book.copy !== null) unlend(book.copy.cell, book, digest => book.refs.has(digest))
      else {
        book.fetched.clear()
        book.lentBlocks.clear()
      }
      const domain = await domainOf(book)
      if ('failure' in domain) return domain
      const named = (input as { execution?: unknown }).execution
      for (let lost = 0; lost < LOST_RACES;) {
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
        lendFetched(book, copy.cell)
        const before = copy.cell.current()
        let settled: Settled<T>
        try {
          const answer = await call(copy.core)
          book.scratch = null
          const after = copy.cell.current()
          if (after === before) return answer
          settled = await publish(
            book,
            domain.ok,
            copy,
            before,
            after,
            writtenOf(method, input),
            input,
            scratch,
            answer,
          )
        } catch (error) {
          // The round needs closed items the call has not read: read them, run again. Not a lost race.
          if (!(error instanceof NeedItems)) throw error
          settled = { kind: 'fetch', refs: error.refs }
        } finally {
          book.scratch = null
        }
        if (settled.kind === 'answer') return settled.value
        if (settled.kind === 'again') lost += 1
        else {
          const unread = await fetchClosed(readerOf(options.storage, domain.ok), book, settled.refs)
          if (unread !== null) return fail(unavailable(unread))
        }
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
        run(input, 'readCancellationInstallation', async core =>
          unread(
            await core.port.readCancellationInstallation?.(input),
            'cancellation installation',
          ),
        ),
      load: input => run(input, 'load', core => core.port.load(input)),
      inputs: input => run(input, 'inputs', core => core.port.inputs(input)),
      readReplyAdmissions: input =>
        run(input, 'readReplyAdmissions', core => core.port.readReplyAdmissions(input)),
      readFinish: input =>
        run(input, 'readFinish', async core =>
          unread(await core.port.readFinish?.(input), 'finish'),
        ),
      inputAcceptance: input =>
        run(input, 'inputAcceptance', core => core.port.inputAcceptance(input)),
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
          const read = (after: string | null) =>
            run(input, 'output.read', async core => {
              const page = await core.port.output.read({ ...input, after, limit: EVENT_PAGE })
              if ('failure' in page) return page
              const ended = book.view.executions.get(input.execution)?.finish.ended ?? null
              return succeed({ page: page.ok, ended: ended !== null })
            })
          yield* eventsAfter(read, input.after, book.turns, input.signal)
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
