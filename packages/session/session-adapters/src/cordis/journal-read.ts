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

export const READ_ATTEMPTS = 3

export type Scope = Readonly<{ tenant: string; session: string }>

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

export const readerOf =
  (storage: SqlStorage, domain: DomainRef): Reader =>
  (handler, input) =>
    readOutput(storage, { domain, handler, protocol: EXECUTION_RECORD_PROTOCOL, input })

export type ReadBatch = Readonly<{
  pub: number
  batch: PublishedBatch | null
  events: readonly ExecutionFact[]
}>

function rowOf(scope: Scope, pub: number, operation: string | null, fact: ExecutionFact): FactRow {
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

export type OpenRead =
  | Readonly<{ kind: 'read'; published: number; executions: readonly string[] }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

export type TouchedRead =
  | Readonly<{ kind: 'read'; published: number; executions: ReadonlySet<string> }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

// The executions the batches after a head touched: what another writer changed since then.
export async function readTouched(read: Reader, scope: Scope, after: number): Promise<TouchedRead> {
  const unread = (diagnostic: string): TouchedRead => ({ kind: 'unavailable', diagnostic })
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt += 1) {
    let from = String(after)
    let published: string | null = null
    const executions = new Set<string>()
    let moved = false
    for (;;) {
      const output = await read(EXECUTION_RECORD_HANDLERS.facts, {
        tenant: scope.tenant,
        session: scope.session,
        after: from,
      })
      if (output.kind === 'unread')
        return unread(`the Agent records of the session are not readable: ${output.reason}`)
      const page = decodeExecutionRecordFacts(output.output)
      if (page === null) return unread('the Agent records of the session do not decode')
      if (page.kind === 'denied') return { kind: 'read', published: 0, executions }
      if (page.kind === 'missing')
        return unread('the Agent records of the session are not all there (a gap or older records)')
      if (published !== null && page.published !== published) {
        moved = true
        break
      }
      published = page.published
      for (const stored of page.batches)
        for (const fact of stored.facts) executions.add(fact.execution)
      if (page.next === null) return { kind: 'read', published: Number(published), executions }
      from = page.next
    }
    if (!moved) break
  }
  return unread('the Agent records of the session kept changing while they were read')
}

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

// The payload of a block; null when the store does not hold it or does not answer.
export async function readBlob(
  read: Reader,
  tenant: string,
  digest: string,
): Promise<string | null> {
  const output = await read(EXECUTION_RECORD_HANDLERS.blob, { tenant, digest })
  if (output.kind === 'unread') return null
  const decoded = decodeExecutionRecordBlob(output.output)
  return decoded?.kind === 'blob' ? decoded.payload : null
}
