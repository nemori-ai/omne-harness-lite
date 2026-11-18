import type { AgentExecutionId, CommandReceipt, Failure } from '@omne-harness/agent-contract'
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
  type ItemChange,
  type EventView,
  type ParticipationKind,
  type PublishedBatch,
  type SessionJournalView,
} from '../journal/index.ts'
import { canonical } from '../testing/canonical.ts'
import type { MemoryExecution } from '../testing/journal.ts'
import type { CommonRoot } from '../testing/root.ts'
import { ANSWER_FAMILY } from '../testing/closed-items.ts'
import { ASSOCIATION_FAMILY, ENTRY_FAMILY, ORIGIN_FAMILY } from '../testing/closed-rows.ts'
import { coreBlobRows, type DerivedFact, type EventProjection } from './journal-batch.ts'

export const JOURNAL_PROVIDER = 'session-log-journal'

export const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: JOURNAL_PROVIDER,
  diagnostic,
})

const fieldOf = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined

const isReceipt = (value: unknown): value is CommandReceipt =>
  typeof value === 'object' && value !== null && 'evidence' in value && 'revision' in value

// A write's receipt (the answer, its `receipt`, or a received commit's) heads its execution.
export function answeredReceipt(answer: Outcome<unknown, Failure>): CommandReceipt | null {
  if (!('ok' in answer)) return null
  const committed = fieldOf(answer.ok, 'value')
  const candidates = [answer.ok, fieldOf(answer.ok, 'receipt'), fieldOf(committed, 'receipt')]
  return candidates.find(isReceipt) ?? null
}

export type PublicationInput = Readonly<{
  view: SessionJournalView
  published: number
  // The core's closed items before the write: read back, so not published again unless changed.
  closedBefore: ReadonlyMap<string, unknown>
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
  changes: readonly ItemChange[]
}>

const BORN_CLOSED: ReadonlySet<string> = new Set([
  ANSWER_FAMILY,
  ENTRY_FAMILY,
  ORIGIN_FAMILY,
  ASSOCIATION_FAMILY,
])

// What the write answered and the entries it took, as items closed at birth: read back as JSON.
function answersOf(
  before: ReadonlyMap<string, unknown>,
  after: CommonRoot,
  execution: AgentExecutionId,
): Outcome<ExecutionItemRecord[], Failure> {
  const out: ExecutionItemRecord[] = []
  for (const [text, body] of after.agent.closed) {
    if (before.get(text) === body) continue
    const [owner, family, item] = JSON.parse(text) as [string, string, string]
    if (!BORN_CLOSED.has(family)) continue
    if (owner !== execution)
      return fail(unavailable(`the write answered ${item} of another execution ${owner}`))
    const json = JSON.parse(JSON.stringify(body)) as JsonValue
    if (canonical(json) !== canonical(body))
      return fail(unavailable(`the answer of ${item} is not JSON data`))
    out.push({ family, item, change: 'opened', open: false, body: json })
  }
  return succeed(out)
}

// One write's batch: envelope, facts with projections, new blocks, the view and items after it.
export function preparePublication(input: PublicationInput): Outcome<Prepared, Failure> {
  const { after, own, appended, method, kinds, project } = input
  const blobs = new Map<string, ExecutionBlobRecord>()
  coreBlobRows(after.agent.blobs, after.agent.blobs.written(), input.stored, blobs)
  const execution = appended[0]!.execution
  const facts = appended.flatMap(batch => batch.facts)
  const envelope: BatchEnvelope = { ...appended.at(-1)!.envelope, kinds: [...kinds] }
  const pub = input.published + 1
  const landed = foldItems(input.view, {
    execution: execution as AgentExecutionId,
    envelope,
    facts,
    pub,
  })
  // The events of this batch by the place of their fact: they close at birth, so only the changes hold them.
  const events = new Map(
    landed.changes.flatMap(change =>
      change.family === 'event' && change.change === 'opened'
        ? [[(change.body as EventView).ord, change.body as EventView] as const]
        : [],
    ),
  )
  const derived: DerivedFact[] = []
  for (const [index, fact] of facts.entries()) {
    const folded = events.get(index + 1)
    if (folded === undefined) {
      derived.push({ fact, event: null })
      continue
    }
    const event = own?.events[folded.eseq - 1]
    if (own === undefined || event === undefined || event.body.kind !== folded.kind) {
      const first = [...events.values()][0]?.eseq ?? folded.eseq
      const written = (own?.events ?? []).slice(first - 1).map(item => item.body.kind)
      const projected = [...events.values()].map(item => item.kind)
      return fail(
        unavailable(
          `the facts of ${method} do not name the events it appended (fact ${fact.kind} at ${String(folded.eseq)}; the facts project [${projected.join(', ')}], the write appended [${written.join(', ')}])`,
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
  const answers = answersOf(input.closedBefore, after, execution as AgentExecutionId)
  if ('failure' in answers) return answers
  return succeed({
    envelope,
    derived,
    records,
    blobs: [...blobs.values()],
    pub,
    view: landed.view,
    items: [
      ...landed.changes.map(({ family, item, change, open, body }) => ({
        family,
        item,
        change,
        open,
        body: body as JsonValue,
      })),
      ...answers.ok,
    ],
    changes: landed.changes,
    batchBytes: batchBytes({
      execution: execution as AgentExecutionId,
      envelope,
      facts: derived.map(item => item.fact),
    }),
  })
}
