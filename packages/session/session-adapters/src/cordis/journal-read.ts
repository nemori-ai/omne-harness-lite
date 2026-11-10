// The reads of the Agent fact family from the `execution-record` participant (R2-D292): the batches
// after a publication (`pub > head`, the incremental read of a view), the open executions and their
// facts (the cold start), the events of one execution after a sequence (AD-02 and `output.read`),
// the batch of one operation (the cold path of recognition) and one content block. Every read of
// batches is one snapshot: its pages must read one publication count, else it starts again, and
// after a fixed number of tries it answers `unavailable`, never a log of two counts.
//
// The rows of a batch are the facts of the fact family, decoded by `decodeRows` of `../journal`;
// a row of another kind is a batch of an older writer, and the batch does not decode.
import { randomUUID } from 'node:crypto'
import type { AgentExecutionId, AgentOperationId } from '@omne-harness/agent-contract'
import {
  EXECUTION_RECORD_HANDLERS,
  EXECUTION_RECORD_PROTOCOL,
  decodeExecutionRecordBlob,
  decodeExecutionRecordEvents,
  decodeExecutionRecordFacts,
  decodeExecutionRecordOpen,
  decodeExecutionRecordOperation,
  type ExecutionBatch,
  type ExecutionEvent,
  type ExecutionFact,
} from '@omne-harness/session-storage-sql/participants'
import type { DomainRef, JsonValue, ReadRequest, SqlStorage } from '@omne-harness/sql-contract'
import { decodeRows, type FactRow, type PublishedBatch } from '../journal/index.ts'

/**
 * How many times a snapshot read starts again when its pages read different publication counts (a
 * writer committed between two pages). Three is the same fixed bound as `SENDS` of the AD-02
 * plugin: enough to ride over a passing writer, not a policy knob.
 */
export const READ_ATTEMPTS = 3

export type Scope = Readonly<{ tenant: string; session: string }>

/**
 * One storage read of a handler: its output, or why the storage did not read it. The reason is
 * the storage's own (for example `queue_full`), so a diagnostic built on it names it.
 */
export type ReadOutput =
  | Readonly<{ kind: 'read'; output: JsonValue }>
  | Readonly<{ kind: 'unread'; reason: string }>

export async function readOutput(
  storage: SqlStorage,
  request: Omit<ReadRequest, 'requestKey'>,
): Promise<ReadOutput> {
  try {
    const result = await storage.read({ ...request, requestKey: randomUUID() })
    if (result.kind === 'read') return { kind: 'read', output: result.output }
    return { kind: 'unread', reason: result.kind === 'cancelled' ? 'cancelled' : result.reason }
  } catch {
    return { kind: 'unread', reason: 'the storage read threw' }
  }
}

export type Reader = (handler: string, input: JsonValue) => Promise<ReadOutput>

/** The reader of one domain's execution records. */
export const readerOf =
  (storage: SqlStorage, domain: DomainRef): Reader =>
  (handler, input) =>
    readOutput(storage, { domain, handler, protocol: EXECUTION_RECORD_PROTOCOL, input })

/** One batch as read: the facts of the family, decoded. */
export type ReadBatch = Readonly<{
  pub: number
  /** The decoded batch of the family; null when the rows read hold no envelope (a partial read). */
  batch: PublishedBatch | null
  /** The event facts of the batch, by sequence, as the store projects them. */
  events: readonly ExecutionFact[]
}>

export type BatchesRead =
  | Readonly<{ kind: 'read'; published: number; batches: readonly ReadBatch[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The row of the fact family a stored fact is, for `decodeRows`. */
function rowOf(scope: Scope, pub: number, operation: string | null, fact: ExecutionFact): FactRow {
  // The envelope row: the operation and the participation kinds are in its body; the store's
  // `op` column holds the storage operation and its `kinds` column the consequence kinds of an
  // event, neither of which is the envelope's.
  const envelope =
    fact.ord === 0 &&
    fact.body !== null &&
    typeof fact.body === 'object' &&
    !Array.isArray(fact.body)
      ? (fact.body as Readonly<Record<string, unknown>>)
      : null
  const op = typeof envelope?.['op'] === 'string' ? envelope['op'] : operation
  const kinds = Array.isArray(envelope?.['kinds']) ? envelope['kinds'].map(String) : []
  return {
    tenant: scope.tenant,
    session: scope.session,
    pub,
    ord: fact.ord,
    execution: fact.execution,
    kind: fact.kind as FactRow['kind'],
    eseq: fact.sequence === null ? null : Number(fact.sequence),
    op: fact.ord === 0 ? op : null,
    kinds: fact.ord === 0 ? kinds.join(',') : '',
    body: JSON.stringify(fact.body),
  }
}

/**
 * Decodes one stored batch of the family. The family's facts are the dense prefix from the
 * envelope; a batch read without its envelope (a read of one execution's facts, whose envelope row
 * belongs to the writing execution) decodes no family batch. A row of a kind the family does not
 * have (the `core.*` facts of the K-23 bridge of an older writer) does not decode: the records
 * then read as unavailable, not as a session without them.
 */
export function splitBatch(scope: Scope, stored: ExecutionBatch): ReadBatch | 'malformed' {
  const pub = Number(stored.published)
  const sorted = [...stored.facts].sort((left, right) => left.ord - right.ord)
  const family: FactRow[] = []
  const events: ExecutionFact[] = []
  for (const fact of sorted) {
    if (fact.sequence !== null) events.push(fact)
    if (fact.kind.startsWith('core.')) return 'malformed'
    family.push(rowOf(scope, pub, stored.operation, fact))
  }
  const whole = family[0]?.ord === 0 && family.every((row, index) => row.ord === index)
  if (!whole) return { pub, batch: null, events }
  const decoded = decodeRows(family)
  if ('failure' in decoded) return 'malformed'
  return { pub, batch: decoded.ok[0] ?? null, events }
}

/**
 * The batches after `after`, every page of one snapshot. With `execution`, only the facts of that
 * execution; the batches then may be part of their publications. `missing` (a gap, or a session
 * published before the fact family) is `unavailable`.
 */
export async function readBatches(
  read: Reader,
  scope: Scope,
  after: number,
  execution: string | null = null,
): Promise<BatchesRead> {
  const unread = (diagnostic: string): BatchesRead => ({ kind: 'unavailable', diagnostic })
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    let from = String(after)
    let published: string | null = null
    const batches: ReadBatch[] = []
    let moved = false
    for (;;) {
      const output = await read(EXECUTION_RECORD_HANDLERS.facts, {
        tenant: scope.tenant,
        session: scope.session,
        after: from,
        ...(execution === null ? {} : { execution }),
      })
      if (output.kind === 'unread')
        return unread(`the Agent records of the session are not readable: ${output.reason}`)
      const page = decodeExecutionRecordFacts(output.output)
      if (page === null) return unread('the Agent records of the session do not decode')
      // A session that is not of this tenant reads as one without records: nothing is told of it.
      if (page.kind === 'denied') return { kind: 'read', published: 0, batches: [] }
      if (page.kind === 'missing')
        return unread('the Agent records of the session are not all there (a gap or older records)')
      if (published !== null && page.published !== published) {
        moved = true
        break
      }
      published = page.published
      for (const stored of page.batches) {
        const split = splitBatch(scope, stored)
        if (split === 'malformed') return unread('a batch of the Agent records does not decode')
        batches.push(split)
      }
      if (page.next === null) return { kind: 'read', published: Number(published), batches }
      from = page.next
    }
    if (!moved) break
  }
  return unread('the Agent records of the session kept changing while they were read')
}

export type OpenRead =
  | Readonly<{ kind: 'read'; published: number; executions: readonly string[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The open executions of the session, every page of one snapshot. */
export async function readOpenExecutions(read: Reader, scope: Scope): Promise<OpenRead> {
  const unread = (diagnostic: string): OpenRead => ({ kind: 'unavailable', diagnostic })
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    let after: string | null = null
    let published: string | null = null
    const executions: string[] = []
    let moved = false
    for (;;) {
      const output = await read(EXECUTION_RECORD_HANDLERS.openExecutions, {
        tenant: scope.tenant,
        session: scope.session,
        after,
      })
      if (output.kind === 'unread')
        return unread(`the open executions of the session are not readable: ${output.reason}`)
      const page = decodeExecutionRecordOpen(output.output)
      if (page === null) return unread('the open executions of the session do not decode')
      // A session that is not of this tenant reads as one without records: nothing is told of it.
      if (page.kind === 'denied') return { kind: 'read', published: 0, executions: [] }
      if (page.kind === 'missing') return unread('the Agent records of the session are older')
      if (published !== null && page.published !== published) {
        moved = true
        break
      }
      published = page.published
      executions.push(...page.executions.map(item => item.execution))
      if (page.next === null) return { kind: 'read', published: Number(published), executions }
      after = page.next
    }
    if (!moved) break
  }
  return unread('the open executions of the session kept changing while they were read')
}

/** The cold start: the facts of every open execution and of the root, in publication order. */
export async function readColdStart(read: Reader, scope: Scope) {
  const open = await readOpenExecutions(read, scope)
  if (open.kind === 'unavailable') return open
  const batches = new Map<number, ReadBatch>()
  for (const execution of open.executions) {
    const found = await readBatches(read, scope, 0, execution)
    if (found.kind === 'unavailable') return found
    for (const batch of found.batches) {
      const known = batches.get(batch.pub)
      batches.set(
        batch.pub,
        known === undefined
          ? batch
          : {
              pub: batch.pub,
              batch: known.batch ?? batch.batch,
              events: [...known.events, ...batch.events],
            },
      )
    }
  }
  return {
    kind: 'read' as const,
    published: open.published,
    executions: open.executions,
    batches: [...batches.values()].sort((left, right) => left.pub - right.pub),
  }
}

export type EventsRead =
  | Readonly<{
      kind: 'read'
      revision: string
      receipt: JsonValue
      emittedThrough: string
      ended: JsonValue
      events: readonly ExecutionEvent[]
    }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/**
 * The events of one execution after sequence `after`, every page of one head: the head row must
 * read the same revision and emitted count on every page. The sequences must follow `after`
 * without a gap, and the last page must reach the head.
 */
export async function readEvents(
  read: Reader,
  scope: Scope,
  execution: string,
  after: string,
): Promise<EventsRead> {
  const unread = (diagnostic: string): EventsRead => ({ kind: 'unavailable', diagnostic })
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    let from = after
    let head: Extract<ReturnType<typeof decodeExecutionRecordEvents>, { kind: 'events' }> | null =
      null
    const events: ExecutionEvent[] = []
    let moved = false
    for (;;) {
      const output = await read(EXECUTION_RECORD_HANDLERS.events, {
        tenant: scope.tenant,
        session: scope.session,
        execution,
        after: from,
      })
      if (output.kind === 'unread')
        return unread(`the events of the execution are not readable: ${output.reason}`)
      const page = decodeExecutionRecordEvents(output.output)
      if (page === null) return unread('the events of the execution do not decode')
      if (page.kind === 'denied')
        return head === null
          ? { kind: 'absent' }
          : unread('the execution went away while its events were read')
      if (page.kind === 'missing') return unread('the Agent records of the session are older')
      if (
        head !== null &&
        (page.revision !== head.revision || page.emittedThrough !== head.emittedThrough)
      ) {
        moved = true
        break
      }
      head = page
      for (const event of page.events) {
        const expected = String(BigInt(after) + BigInt(events.length) + 1n)
        if (event.sequence !== expected)
          return unread(`the events of the execution have a gap at sequence ${expected}`)
        events.push(event)
      }
      if (page.next === null) {
        const through = BigInt(after) + BigInt(events.length)
        if (through < BigInt(head.emittedThrough))
          return unread(
            `the events of the execution end at sequence ${String(through)}, before ${head.emittedThrough}`,
          )
        return {
          kind: 'read',
          revision: head.revision,
          receipt: head.receipt,
          emittedThrough: head.emittedThrough,
          ended: head.ended,
          events,
        }
      }
      from = page.next
    }
    if (!moved) break
  }
  return unread('the events of the execution kept changing while they were read')
}

export type OperationRead =
  | Readonly<{ kind: 'read'; session: string; execution: AgentExecutionId; batch: ReadBatch }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** The batch of one operation of the tenant, by the operation key; `none` when it wrote none. */
export async function readOperation(
  read: Reader,
  tenant: string,
  operation: AgentOperationId,
): Promise<OperationRead> {
  const output = await read(EXECUTION_RECORD_HANDLERS.operation, { tenant, operation })
  if (output.kind === 'unread')
    return {
      kind: 'unavailable',
      diagnostic: `the batch of the operation is not readable: ${output.reason}`,
    }
  const decoded = decodeExecutionRecordOperation(output.output)
  if (decoded === null) return { kind: 'none' }
  if (decoded === 'malformed')
    return { kind: 'unavailable', diagnostic: 'the batch of the operation does not decode' }
  const split = splitBatch(
    { tenant, session: decoded.session },
    { published: decoded.published, operation, facts: decoded.facts },
  )
  if (split === 'malformed' || split.batch === null)
    return { kind: 'unavailable', diagnostic: 'the batch of the operation does not decode' }
  return {
    kind: 'read',
    session: decoded.session,
    execution: decoded.execution as AgentExecutionId,
    batch: split,
  }
}

/** One content block of the tenant: its payload, or null when the tenant holds no block of `digest`. */
export async function readBlob(
  read: Reader,
  tenant: string,
  digest: string,
): Promise<string | null | 'unavailable'> {
  const output = await read(EXECUTION_RECORD_HANDLERS.blob, { tenant, digest })
  if (output.kind === 'unread') return 'unavailable'
  const decoded = decodeExecutionRecordBlob(output.output)
  if (decoded === null) return 'unavailable'
  return decoded.kind === 'blob' ? decoded.payload : null
}
