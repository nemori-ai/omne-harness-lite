import type { AgentExecutionId, HandoffReference } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { emptySessionView, fold, handoffKey, type SessionJournalView } from '../journal/index.ts'
import type { HandoffRecord, MemoryExecution } from '../testing/journal.ts'
import { attachmentsOf, handoffParts, handoffRefs } from '../testing/journal-records.ts'
import { fetchBlobClosure, resolvedOf, type JournalStateSource } from './agent-journal.ts'
import { blobRowDigest } from './journal-batch.ts'
import { readBatches } from './journal-read.ts'

// What Session's readers of an execution need: its attachments, and the request of one handoff when asked.
export type ExecutionRecords = Readonly<{
  attachments: MemoryExecution['attachments']
  request: HandoffRecord['request'] | null
}>
export type ExecutionRecordsRead =
  | Readonly<{ kind: 'read'; execution: ExecutionRecords | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const refDigest = (ref: unknown): string | null => {
  const digest = (ref as { digest?: unknown } | null)?.digest
  return typeof digest === 'string' ? digest : null
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
  handoff: HandoffReference | null = null,
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
  const item = handoff === null ? undefined : found.handoffs.get(handoffKey(handoff))
  const digests = (item === undefined ? [] : handoffRefs(item)).flatMap(ref => {
    const digest = refDigest(ref)
    return digest === null ? [] : [digest]
  })
  const missing = await fetchBlobClosure(
    resolved.read,
    resolved.tenant,
    digests.map(blobRowDigest),
    kept.blobs,
  )
  if (missing !== null)
    return { kind: 'unavailable', diagnostic: `the content block ${missing} is not readable` }
  try {
    for (const digest of digests)
      if (!kept.parsed.has(digest))
        kept.parsed.set(digest, JSON.parse(kept.blobs.get(blobRowDigest(digest))!) as unknown)
    const request = item === undefined ? null : (handoffParts(item, kept.parsed).request ?? null)
    return { kind: 'read', execution: { attachments: attachmentsOf(found), request } }
  } catch (error) {
    return { kind: 'unavailable', diagnostic: `the Agent records do not decode: ${String(error)}` }
  } finally {
    const folds = recordsFolds.get(options.storage)
    if (folds !== undefined) dropFoldsOver(folds, kept, RECORDS_FOLD_TEXT)
  }
}
