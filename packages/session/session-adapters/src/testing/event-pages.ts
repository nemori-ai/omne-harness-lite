import type {
  Adoption,
  AgentEvent,
  AgentJournalEntry,
  EventPage,
  Failure,
} from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { BlobStore, EventView, Mint } from '../journal/index.ts'
import type { ClosedTable } from './closed-items.ts'
import { ENTRY_FAMILY, readingRows } from './closed-rows.ts'
import { eventRecord } from './journal-records.ts'
import type { MemoryExecution } from './journal.ts'
import { journalEvidence, sequenceOf } from './journal-values.ts'

// Pages of what an execution emitted and of the entries it took. The record keeps the places it
// still holds; a closed one is read back by its place.

type Table = ClosedTable & Readonly<{ blobs: BlobStore }>

const between = <T>(rows: readonly (T | undefined)[], from: number, limit: number) =>
  Array.from(
    { length: Math.max(0, Math.min(limit, rows.length - from)) },
    (_, at) => rows[from + at],
  )

const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })

export function eventPage(
  context: Readonly<{
    table: Table
    namespace: string
    readLimit: number
    mint: Mint
    eventSchema: Adoption
  }>,
  execution: MemoryExecution,
  after: string | null,
  limit: number,
  gap: () => void,
): Outcome<EventPage, Failure> {
  const position = sequenceOf(after)
  if (position === undefined || position > execution.events.length)
    return fail(invalid('after', 'not a sequence of this execution'))
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > context.readLimit)
    return fail(invalid('limit', `not a positive integer up to ${context.readLimit}`))
  if (position + 1 < execution.retainedFrom)
    return succeed({
      kind: 'gap',
      retainedFrom: String(execution.retainedFrom),
      recovery: journalEvidence(
        `${context.namespace}/${execution.id}/recovery`,
        execution.revision,
      ),
    })
  const place = { execution: execution.id, family: 'event' }
  const projection = {
    blobs: context.table.blobs,
    mint: context.mint,
    eventSchema: context.eventSchema,
  }
  const events = readingRows(
    context.table,
    place,
    execution.events,
    body => eventRecord(execution.id, body as EventView, projection) ?? undefined,
    rows => between(rows, position, limit),
  )
  if (events.some(event => !event)) {
    gap()
    const diagnostic = 'confirmed original event gap'
    return fail({ kind: 'unavailable', owner: 'session-history', diagnostic })
  }
  const next = position + events.length
  return succeed({
    kind: 'page',
    events: structuredClone(events as AgentEvent[]),
    next: String(next),
    caughtUp: next === execution.events.length,
  })
}

// The entries after a position (null: one of them is not readable).
export function entriesFrom(
  table: Table,
  execution: MemoryExecution,
  from: number,
  limit: number,
): AgentJournalEntry[] | null {
  const read = readingRows(
    table,
    { execution: execution.id, family: ENTRY_FAMILY },
    execution.entries,
    body => body as AgentJournalEntry,
    rows => between(rows, from, limit),
  )
  return read.some(entry => entry === undefined) ? null : (read as AgentJournalEntry[])
}
