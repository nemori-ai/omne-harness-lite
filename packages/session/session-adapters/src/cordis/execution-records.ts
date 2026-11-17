import type { HandoffReference } from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'
import type { SessionId } from '@omne-harness/session-contract'
import { handoffKey, type AttachmentView, type HandoffView } from '../journal/index.ts'
import type { HandoffRecord, MemoryExecution } from '../testing/journal.ts'
import { attachmentsOf, handoffParts, handoffRefs } from '../testing/journal-records.ts'
import { fetchBlobClosure, resolvedOf, type JournalStateSource } from './agent-journal.ts'
import { readItems, readOpenItems, type ItemScope } from './item-read.ts'
import { blobRowDigest } from './journal-batch.ts'
import { READ_ATTEMPTS, type Reader } from './journal-read.ts'

// What Session's readers of an execution need: its attachments, and the request of one handoff when asked.
export type ExecutionRecords = Readonly<{
  attachments: MemoryExecution['attachments']
  request: HandoffRecord['request'] | null
}>
export type ExecutionRecordsRead =
  | Readonly<{ kind: 'read'; execution: ExecutionRecords | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type RequestRead =
  | Readonly<{ kind: 'read'; request: HandoffRecord['request'] | null }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

const isRef = (ref: unknown): ref is Readonly<{ digest: string }> =>
  typeof (ref as { digest?: unknown } | null)?.digest === 'string'

async function requestOf(read: Reader, tenant: string, item: HandoffView): Promise<RequestRead> {
  const digests = handoffRefs(item).flatMap(ref => (isRef(ref) ? [ref.digest] : []))
  const payloads = new Map<string, string>()
  const missing = await fetchBlobClosure(read, tenant, digests.map(blobRowDigest), payloads)
  if (missing !== null)
    return { kind: 'unavailable', diagnostic: `the content block ${missing} is not readable` }
  try {
    const parsed = new Map(
      digests.map(digest => [digest, JSON.parse(payloads.get(blobRowDigest(digest))!) as unknown]),
    )
    return { kind: 'read', request: handoffParts(item, parsed).request ?? null }
  } catch (error) {
    return { kind: 'unavailable', diagnostic: `the Agent records do not decode: ${String(error)}` }
  }
}

// Reads the execution's item rows by original key: its own item and attachments in one read, the
// handoff by its key; both at one head, read again when it moved between them.
export async function readExecutionRecords(
  options: JournalStateSource,
  target: Readonly<{ tenant: TenantId; session: SessionId; execution: string }>,
  handoff: HandoffReference | null = null,
): Promise<ExecutionRecordsRead> {
  const resolved = await resolvedOf(options, target.tenant)
  if ('kind' in resolved) return resolved
  const scope: ItemScope = { ...target, tenant: resolved.tenant }
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    const own = await readOpenItems(resolved.read, scope, ['exec', 'attachment'])
    if (own.kind === 'unavailable') return own
    const exec = own.items.find(item => item.family === 'exec')?.body as
      | Readonly<{ opened: unknown }>
      | undefined
    if (exec === undefined || exec.opened === null) return { kind: 'read', execution: null }
    const attachments = own.items
      .filter(item => item.family === 'attachment')
      .map(item => item.body as AttachmentView)
      .sort((left, right) => left.pub - right.pub)
    if (handoff === null)
      return {
        kind: 'read',
        execution: { attachments: attachmentsOf({ attachments }), request: null },
      }
    const found = await readItems(resolved.read, scope, [
      { family: 'handoff', item: handoffKey(handoff) },
    ])
    if (found.kind === 'unavailable') return found
    if (found.published !== own.published) continue
    const item = found.items[0]?.body as HandoffView | undefined
    const request =
      item === undefined
        ? ({ kind: 'read', request: null } as const)
        : await requestOf(resolved.read, resolved.tenant, item)
    if (request.kind === 'unavailable') return request
    return {
      kind: 'read',
      execution: { attachments: attachmentsOf({ attachments }), request: request.request },
    }
  }
  return { kind: 'unavailable', diagnostic: 'the Agent records of the execution kept changing' }
}
