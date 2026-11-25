import { writeJsonText } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import { judgeMessage } from '@omne-harness/message'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  HistoryEntry,
  SessionAccess,
  SessionHistory,
  SessionFailure,
} from '@omne-harness/session-contract'
import { z } from 'zod'
import type { ModelReminderFailure } from './model-reminders.ts'
import type { WorkspaceGuidanceScope } from '../workspace-guidance.ts'
import { emptyGuidanceIndex, extendGuidanceIndex } from './guidance-window.ts'

export type GuidanceOrigins = Readonly<{
  blocks: ReadonlySet<string>
  scopes: readonly WorkspaceGuidanceScope[]
}>
export type OriginalHistory<P> = Pick<SessionHistory<P>, 'begin' | 'next'>
type Reply<T> = Outcome<T, ModelReminderFailure>
const unavailable = (diagnostic: string) => fail({ kind: 'unavailable' as const, diagnostic })

// This exceptional legacy scan must not acquire an unbounded log or cursor set.
// The native original-input recovery uses the same record and byte ceilings.
const MAX_ORIGINAL_RECORDS = 100_000
const MAX_ORIGINAL_BYTES = 64 * 1024 * 1024
const MAX_ORIGINAL_PAGES = 100_000
const original = z
  .object({
    creation: z.object({ fork: z.unknown().optional() }).passthrough().optional(),
    message: z.unknown().optional(),
    source: z.object({ owner: z.string(), record: z.string() }).passthrough().optional(),
  })
  .passthrough()
type Original = z.infer<typeof original>

/** Validate the original author's complete visible bytes before collecting any source. */
function reminderOrigins(
  value: Original,
  tenant: string | null,
  partition: string,
): Reply<GuidanceOrigins> {
  const message = judgeMessage(value.message)
  if (!('ok' in message) || message.ok.role !== 'system_reminder')
    return unavailable('an original reminder is unreadable')
  const ref =
    value.source?.owner === 'runtime-context'
      ? /^(.*)\/view\/[^/]+\/at\/[0-9]+$/u.exec(value.source.record)?.[1]
      : undefined
  const author = ref && tenant !== null ? JSON.stringify([tenant, ref]) : partition
  const index = extendGuidanceIndex(emptyGuidanceIndex(), [message.ok], author)
  const blocks = message.ok.blocks.filter(
    block =>
      block.kind === 'text' && block.visibility.toModel && block.id.startsWith('blk_guidance_'),
  )
  if (blocks.some(block => !index.sourceScopes.has(block.id) && index.manifest !== block.id))
    return unavailable('the original guidance author cannot be verified')
  return succeed({ scopes: index.scopes, blocks: new Set(blocks.map(block => block.id)) })
}

type OriginalReadBudget = Readonly<{
  page(): Reply<void>
  record(encoded: string): Reply<void>
  cursor(cursor: string | null, seen: Set<string>): Reply<string>
}>
function readFailure(failure: SessionFailure): Reply<never> {
  return failure.kind === 'denied'
    ? fail({ kind: 'denied' })
    : unavailable('the original guidance records are unreadable')
}

/** A filtered inherited page may be empty. Only an actual inherited summary lacks originals. */
async function verifyFork<P>(
  history: OriginalHistory<P>,
  access: SessionAccess<P>,
  budget: OriginalReadBudget,
): Promise<Reply<void>> {
  let prefix = await history.begin({
    ...access,
    kinds: ['message.compaction'],
    inherited: true,
    from: null,
    direction: 'forward',
    pageBytes: 1,
  })
  const cursors = new Set<string>()
  for (;;) {
    if ('failure' in prefix) return readFailure(prefix.failure)
    const counted = budget.page()
    if ('failure' in counted) return counted
    if (prefix.ok.from === undefined) return succeed(undefined)
    for (const entry of prefix.ok.entries) {
      const held = budget.record(writeJsonText(entry.payload))
      if ('failure' in held) return held
      if (entry.kind === 'message.compaction')
        return unavailable('the session cannot verify the original inputs of an inherited summary')
    }
    if (prefix.ok.exhausted) return succeed(undefined)
    const cursor = budget.cursor(prefix.ok.next, cursors)
    if ('failure' in cursor) return cursor
    prefix = await history.next({ ...access, cursor: cursor.ok })
  }
}

/** One bounded read's author set. It never decides the sources' current qualifications. */
function originalScan<P>(
  history: OriginalHistory<P>,
  access: SessionAccess<P>,
  partition: string,
  before?: string,
) {
  const boundary = before === undefined ? null : BigInt(before)
  const tenant = tenantCodec.encode(access.tenant)
  const blocks = new Set<string>()
  const scopes = new Map<string, WorkspaceGuidanceScope>()
  let creation = false
  let forkProof: Promise<Reply<void>> | undefined
  let records = 0
  let bytes = 0
  let pages = 0
  const cursors = new Set<string>()

  function charge(size: number): boolean {
    bytes += size
    return bytes <= MAX_ORIGINAL_BYTES
  }

  function takePage(): Reply<void> {
    return ++pages > MAX_ORIGINAL_PAGES
      ? unavailable('the original guidance history exceeds the recovery bound')
      : succeed(undefined)
  }

  function takeRecord(encoded: string): Reply<void> {
    return ++records > MAX_ORIGINAL_RECORDS || !charge(Buffer.byteLength(encoded))
      ? unavailable('the original guidance history exceeds the recovery bound')
      : succeed(undefined)
  }

  const budget: OriginalReadBudget = { page: takePage, record: takeRecord, cursor: advance }

  async function acceptOrigin(value: Original, id: string): Promise<Reply<void>> {
    const origin = value.creation
    if (!origin || (!origin.fork && id !== '1'))
      return unavailable('the original scope of this session cannot be verified')
    if (origin.fork) {
      forkProof ??= verifyFork(history, access, budget)
      const proof = await forkProof
      if ('failure' in proof) return proof
    }
    creation = true
    return succeed(undefined)
  }

  async function acceptEntry(entry: HistoryEntry, encoded: string): Promise<Reply<void>> {
    const value = original.safeParse(JSON.parse(encoded))
    if (!value.success) return unavailable('invalid original guidance log entry')
    if (entry.kind === 'session.created') return acceptOrigin(value.data, entry.id)
    if (entry.kind !== 'message.system_reminder') return succeed(undefined)
    const origins = reminderOrigins(value.data, tenant.ok ? tenant.value : null, partition)
    if ('failure' in origins) return origins
    for (const scope of origins.ok.scopes) scopes.set(JSON.stringify(scope), scope)
    for (const block of origins.ok.blocks) blocks.add(block)
    return succeed(undefined)
  }

  async function acceptPage(entries: readonly HistoryEntry[]): Promise<Reply<boolean>> {
    const counted = takePage()
    if ('failure' in counted) return counted
    for (const entry of entries) {
      if (boundary !== null && BigInt(entry.id) >= boundary) return succeed(true)
      const encoded = writeJsonText(entry.payload)
      const held = takeRecord(encoded)
      if ('failure' in held) return held
      const accepted = await acceptEntry(entry, encoded)
      if ('failure' in accepted) return accepted
    }
    return succeed(false)
  }

  function advance(cursor: string | null, seen = cursors): Reply<string> {
    if (cursor === null || seen.has(cursor))
      return unavailable('the original guidance history is incomplete')
    if (!charge(Buffer.byteLength(cursor)))
      return unavailable('the original guidance history exceeds the recovery bound')
    seen.add(cursor)
    return succeed(cursor)
  }

  function result(): Reply<GuidanceOrigins> {
    return creation
      ? succeed({ scopes: [...scopes.values()], blocks })
      : unavailable('the session origin for the original guidance is unavailable')
  }
  return { acceptPage, advance, result }
}

/** Only the exceptional recovery path reads original author records. Raw user and tool text is irrelevant here. */
export async function readGuidanceOriginals<P>(
  history: OriginalHistory<P>,
  access: SessionAccess<P>,
  partition: string,
  before?: string,
): Promise<Reply<GuidanceOrigins>> {
  const scan = originalScan(history, access, partition, before)
  let page = await history.begin({
    ...access,
    inherited: true,
    kinds: ['session.created', 'message.system_reminder'],
    from: null,
    direction: 'forward',
    pageBytes: 1_048_576,
  })
  for (;;) {
    if ('failure' in page) return readFailure(page.failure)
    const accepted = await scan.acceptPage(page.ok.entries)
    if ('failure' in accepted) return accepted
    if (page.ok.exhausted || accepted.ok) return scan.result()
    const cursor = scan.advance(page.ok.next)
    if ('failure' in cursor) return cursor
    page = await history.next({ ...access, cursor: cursor.ok })
  }
}
