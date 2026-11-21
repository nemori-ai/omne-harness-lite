import type { AgentExecutionId, DurableEvidence, Failure } from '@omne-harness/agent-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  EXECUTION_BATCH_MAX_FACTS,
  type ExecutionBlobRecord,
  type ExecutionFactRecord,
  type ExecutionItemContentRecord,
  type ExecutionItemKeyRecord,
  type ExecutionItemRecord,
} from '@omne-harness/session-storage-sql/participants'
import type { JsonValue } from '@omne-harness/sql-contract'
import {
  FACT_MAX_BYTES,
  advances,
  batchBytes,
  contentPath,
  foldItems,
  materialHeld,
  receiptOf,
  type BatchEnvelope,
  type ExecutionView,
  type FactBody,
  type FactOf,
  type ItemChange,
  type EventView,
  type Mint,
  type ParticipationKind,
  type PublishedBatch,
  type SessionJournalView,
} from '../journal/index.ts'
import { canonical } from '../testing/canonical.ts'
import type { MemoryExecution } from '../testing/journal.ts'
import type { CommonRoot } from '../testing/root.ts'
import { ANSWER_FAMILY } from '../testing/closed-items.ts'
import { ASSOCIATION_FAMILY, ENTRY_FAMILY, ORIGIN_FAMILY } from '../testing/closed-rows.ts'
import { refsIn } from './content-refs.ts'
import {
  blobRef,
  blobRowDigest,
  coreBlobRows,
  type DerivedFact,
  type EventProjection,
} from './journal-batch.ts'

export const JOURNAL_PROVIDER = 'session-log-journal'

export const unavailable = (diagnostic: string): Failure => ({
  kind: 'unavailable',
  owner: JOURNAL_PROVIDER,
  diagnostic,
})

// The head of each execution a write moved: the receipt of the batch, not of the method's answer.
export function headsOf(
  mint: Mint,
  view: SessionJournalView,
  appended: readonly PublishedBatch[],
): ReadonlyMap<string, DurableEvidence> {
  return new Map(
    appended
      .filter(advances)
      .map(batch => [batch.execution as string, receiptOf(mint, view, batch).evidence]),
  )
}

export type PublicationInput = Readonly<{
  view: SessionJournalView
  published: number
  // The core's closed items before the write: read back, so not published again unless changed.
  closedBefore: ReadonlyMap<string, unknown>
  held: (row: string) => 'shared' | 'owned' | null
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
  itemRows: Readonly<{
    items: readonly ExecutionItemRecord[]
    contents: readonly ExecutionItemContentRecord[]
    discards: readonly ExecutionItemKeyRecord[]
  }>
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

const ownedBy = (fact: FactBody): fact is FactOf<'material.preserved'> =>
  fact.kind === 'material.preserved' && fact.readers === 'until-release'

function ownedContents(
  execution: string,
  facts: readonly FactBody[],
  blobs: ReadonlyMap<string, unknown>,
): Readonly<{
  contents: ExecutionItemContentRecord[]
  only: ReadonlySet<string>
  shared: ReadonlySet<string>
}> {
  const owned = facts.filter(ownedBy)
  const shared = new Set<string>()
  for (const fact of facts) if (!ownedBy(fact)) refsIn(fact, shared)
  const contents = owned.map(fact => {
    const value = blobs.get(fact.value.digest)
    if (value === undefined)
      throw new TypeError(`the core holds no content of the material ${fact.source.record}`)
    const payload = canonical(value)
    if (blobRef(payload).digest !== blobRowDigest(fact.value.digest))
      throw new TypeError(`the material ${fact.source.record} does not hash to its digest`)
    return { execution, family: 'material', item: canonical(fact.source), payload }
  })
  const only = new Set(owned.map(fact => fact.value.digest).filter(digest => !shared.has(digest)))
  return { contents, only, shared }
}

function discardsOf(
  execution: string,
  before: ExecutionView | undefined,
  after: ExecutionView | undefined,
): ExecutionItemKeyRecord[] {
  if (before === undefined) return []
  const out: ExecutionItemKeyRecord[] = []
  for (const [key, item] of before.materials) {
    if (item.readers !== 'until-release' || !materialHeld(item, before, key)) continue
    const now = after?.materials.get(key)
    if (after === undefined || now === undefined || !materialHeld(now, after, key))
      out.push({ execution, family: 'material', item: key })
  }
  return out
}

// One write's batch: envelope, facts with projections, new blocks, the view and items after it.
export function preparePublication(input: PublicationInput): Outcome<Prepared, Failure> {
  const { after, own, appended, method, kinds, project } = input
  const execution = appended[0]!.execution
  const facts = appended.flatMap(batch => batch.facts)
  const { contents, only, shared } = ownedContents(execution, facts, after.agent.blobs)
  const blobs = new Map<string, ExecutionBlobRecord>()
  const written = [
    ...[...after.agent.blobs.written()].filter(digest => !only.has(digest)),
    ...[...shared].filter(digest => input.held(blobRowDigest(digest)) === 'owned'),
  ]
  coreBlobRows(after.agent.blobs, written, row => input.held(row) === 'shared', blobs)
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
    itemRows: {
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
      contents,
      discards: discardsOf(
        execution,
        input.view.executions.get(execution as AgentExecutionId),
        landed.view.executions.get(execution as AgentExecutionId),
      ),
    },
    changes: landed.changes,
    batchBytes: batchBytes({
      execution: execution as AgentExecutionId,
      envelope,
      facts: derived.map(item => item.fact),
    }),
  })
}
