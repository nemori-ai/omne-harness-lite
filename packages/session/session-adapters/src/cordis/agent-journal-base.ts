import type { SessionCurrentAdvance } from '@omne-harness/session-storage-sql/participants'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentOperationId,
  CallerCommit,
  ExecutionMutation,
  Failure,
} from '@omne-harness/agent-contract'
import { type TenantId } from '@omne-harness/legal-identity'
import { type Outcome } from '@omne-harness/operation-result'
import {
  type SessionCommand,
  type SessionId,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import { type SessionCheck } from '@omne-harness/session-storage-sql/participants'
import { type ExecutionView, type SessionJournalView } from '../journal/index.ts'
import {
  DEFAULT_EVENT_SCHEMA,
  DEFAULT_REPLY_ADMISSION_RULE,
  createJournal,
  type JournalWrite,
  type MemoryExecution,
} from '../testing/journal.ts'
import { JOURNAL_OWNER } from '../testing/journal-values.ts'
import { type JournalCell } from '../testing/root.ts'
import { blobRowDigest, factDigestOf } from './journal-batch.ts'
import { type ProjectionContext } from '../testing/journal-records.ts'
import { readBlob, type Reader } from './journal-read.ts'

type CustodyAttempt =
  MemoryExecution['custodyAttempts'] extends Map<infer _Operation, infer Attempt> ? Attempt : never

const HEX_DIGEST = /^[0-9a-f]{64}$/

// The shared values, types and pure helpers of the Session log Journal.

export type Book<P> = {
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

export type Scratch = {
  checks: SessionCheck[]
  advanceCheck: Extract<SessionCheck, { kind: 'advance' }> | null
  commands: SessionCommand[]
  snapshot: WorkSnapshot | null
  advance: SessionCurrentAdvance | null
}

export type Written = Readonly<{
  method: string
  execution: string | null
  operation: string | null
  digest: string
}>

export type AttachInput<P> = Parameters<AgentJournal<P>['attach']>[0]

export type OpenInput<P> = Parameters<AgentJournal<P>['open']>[0]

export const OWNER = 'session-log-journal'

export async function fetchNamed(
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

export function listedDigests(payload: string): string[] {
  const value = JSON.parse(payload) as unknown
  if (!Array.isArray(value)) return []
  return value.flatMap(item =>
    Array.isArray(item) && typeof item[1] === 'string' && HEX_DIGEST.test(item[1]) ? [item[1]] : [],
  )
}

export function projectionContext(
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

export function refsIn(value: unknown, into = new Set<string>()): Set<string> {
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

export const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: OWNER,
  diagnostic,
})

export function historyCaller<P>(input: ExecutionMutation<P>, method: JournalWrite): CallerCommit {
  if (method === 'recordResult') {
    const transfer = (input as Parameters<AgentJournal<P>['recordResult']>[0]).transfer
    return transfer.kind !== 'none' && transfer.result.producer.kind === 'compaction'
      ? { kind: 'none' }
      : transfer
  }
  if (method !== 'commit') return { kind: 'none' }
  const commit = input as Parameters<AgentJournal<P>['commit']>[0]
  if (
    (commit.caller.kind === 'custody' || commit.caller.kind === 'processed') &&
    commit.caller.result.producer.kind === 'compaction'
  )
    return { kind: 'none' }
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

export type Copy<P> = Readonly<{
  cell: JournalCell<P>
  core: ReturnType<typeof createJournal<P>>
}>

export type Held = {
  readonly execution: AgentExecutionId
  readonly operation: AgentOperationId
  readonly key: string
  readonly storageOperation: string
  readonly attempt: number
  readonly custody: CustodyAttempt | null
  standing: 'unknown' | 'excluded'
}

export async function fetchBlobClosure(
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

export type Settled<T> =
  | Readonly<{ kind: 'answer'; value: Outcome<T, Failure> }>
  | Readonly<{ kind: 'again' }>
