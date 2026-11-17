import type { AgentExecutionId, Failure } from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  EXECUTION_BATCH_MAX_FACTS,
  type ExecutionBlobRecord,
  type ExecutionFactRecord,
  type ExecutionItemRecord,
} from '@omne-harness/session-storage-sql/participants'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  FACT_MAX_BYTES,
  batchBytes,
  contentPath,
  foldItems,
  type BatchEnvelope,
  type EventView,
  type ParticipationKind,
  type PublishedBatch,
  type SessionJournalView,
} from '../journal/index.ts'
import { canonical } from '../testing/canonical.ts'
import type { MemoryExecution } from '../testing/journal.ts'
import type { CommonRoot } from '../testing/root.ts'
import { coreBlobRows, type DerivedFact, type EventProjection } from './journal-batch.ts'

export const JOURNAL_PROVIDER = 'session-log-journal'

export const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: JOURNAL_PROVIDER,
  diagnostic,
})

// The events of the appended batches are the tail of the folded view: walk back only over them.
function eventsFrom(events: readonly EventView[], pub: number): readonly EventView[] {
  let at = events.length
  while (at > 0 && events[at - 1]!.pub >= pub) at -= 1
  return events.slice(at)
}

export type PublicationInput = Readonly<{
  // The published view and its count, before this write.
  view: SessionJournalView
  published: number
  stored: (row: string) => boolean
  after: CommonRoot
  own: MemoryExecution | undefined
  appended: readonly PublishedBatch[]
  method: string
  kinds: readonly ParticipationKind[]
  project: (own: MemoryExecution, event: MemoryExecution['events'][number]) => EventProjection
}>

export type Prepared = Readonly<{
  envelope: BatchEnvelope
  derived: readonly DerivedFact[]
  records: readonly ExecutionFactRecord[]
  blobs: readonly ExecutionBlobRecord[]
  batchBytes: number
  // The published view once this batch lands, and the items the batch opens or changes in it.
  pub: number
  view: SessionJournalView
  items: readonly ExecutionItemRecord[]
}>

// The batch one write publishes: its envelope, its facts with their event projections, the blocks
// it adds, and the view and items it leaves once it lands at the next publication.
export function preparePublication(input: PublicationInput): Outcome<Prepared, Failure> {
  const { after, own, appended, method, kinds, project } = input
  const blobs = new Map<string, ExecutionBlobRecord>()
  coreBlobRows(after.agent.blobs, after.agent.blobs.written(), input.stored, blobs)
  const execution = appended[0]!.execution
  const events = new Map(
    eventsFrom(after.agent.view.executions.get(execution)?.events ?? [], appended[0]!.pub).map(
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
            `the facts of ${method} do not name the events it appended (fact ${fact.kind} at ${String(folded.eseq)}; the facts project [${projected.join(', ')}], the write appended [${appended.join(', ')}])`,
          ),
        )
      }
      derived.push({ fact, event: project(own, event) })
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
  const envelope: BatchEnvelope = { ...appended.at(-1)!.envelope, kinds: [...kinds] }
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
        `the batch of ${method} holds ${String(records.length)} facts, more than ${String(EXECUTION_BATCH_MAX_FACTS)}`,
      ),
    )
  const pub = input.published + 1
  const landed = foldItems(input.view, {
    execution: execution as AgentExecutionId,
    envelope,
    facts: derived.map(item => item.fact),
    pub,
  })
  return succeed({
    envelope,
    derived,
    records,
    blobs: [...blobs.values()],
    pub,
    view: landed.view,
    items: landed.changes.map(change => ({ ...change, body: change.body as JsonValue })),
    batchBytes: batchBytes({
      execution: execution as AgentExecutionId,
      envelope,
      facts: derived.map(item => item.fact),
    }),
  })
}
