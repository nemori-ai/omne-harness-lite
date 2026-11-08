// Pure custody decisions. A batch advances only with its complete facts and downstream duties.
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  Adoption,
  ProcessBlock,
  ToolFailure,
  ToolStartRecord,
} from '@omne-harness/tool-contract'
import type { FactBatch, FactProgress, FactReceipt } from '@omne-harness/tool-contract/provider'
import type { StoredFactBatch } from './fact-values.ts'
import type { ToolMaterialFingerprint } from '@omne-harness/tool-contract/provider'
import { invalid, tenantKey } from './boundary.ts'
import { checkBodyReferences } from './ledger-body-references.ts'
import { sameFactValue, factTaskOperation, mintEvidence } from './evidence.ts'
import { put, reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import {
  factKey,
  type CallRecord,
  type FactEventRecord,
  type LedgerWrite,
  type SavedFact,
  type StoredExecutionFact,
} from './ledger-store.ts'

function unsupported(adoption: Adoption): Outcome<never, ToolFailure> {
  return fail({
    kind: 'unsupported',
    adoption,
    reason: 'append custody supports text and thinking blocks only; use replace for other content',
  })
}

function updateProcess(
  current: ProcessBlock | undefined,
  next: ProcessBlock,
  history: readonly ProcessBlock[],
  adoption: Adoption,
): Outcome<void, ToolFailure> {
  const old = history.find(block => block.sequence === next.sequence)
  if (old !== undefined)
    return sameFactValue(old, next)
      ? succeed(undefined)
      : invalid('batch.events.fact.blocks.sequence', 'sequence-conflict')
  if (current !== undefined) {
    if (current.mode !== next.mode) return invalid('batch.events.fact.blocks.mode', 'fixed-mode')
    if (current.state === 'closed') return invalid('batch.events.fact.blocks.state', 'closed-block')
    if (BigInt(next.sequence) <= BigInt(current.sequence))
      return invalid('batch.events.fact.blocks.sequence', 'not-increasing')
  }
  if (next.mode === 'append') {
    const content = next.content
    if (content.kind !== 'text' && content.kind !== 'thinking') return unsupported(adoption)
    if (current !== undefined) {
      const previous = current.content
      if (
        (previous.kind !== 'text' && previous.kind !== 'thinking') ||
        previous.kind !== content.kind ||
        previous.id !== content.id ||
        !sameFactValue(previous.visibility, content.visibility) ||
        !content.text.startsWith(previous.text)
      )
        return invalid('batch.events.fact.blocks.content', 'append-prefix')
    }
  }
  return succeed(undefined)
}

/** The event history decides duplicate sequences, including historical updates after closure. */
function processWrites(
  snapshot: Snapshot,
  batch: StoredFactBatch,
  events: readonly FactEventRecord[],
  adoption: Adoption,
): Outcome<readonly LedgerWrite[], ToolFailure> {
  const current = new Map(
    snapshot.process
      .filter(record => record.start.operation === batch.start.operation)
      .map(record => [record.block.index, record.block]),
  )
  const history = [...snapshot.facts.values()]
    .filter(record => record.start.operation === batch.start.operation)
    .flatMap(record => (record.fact.kind === 'process' ? record.fact.blocks : []))
  const writes: LedgerWrite[] = []
  for (const event of events) {
    if (event.fact.kind !== 'process') continue
    const references = checkBodyReferences(
      snapshot,
      event.fact.blocks.flatMap(block => ('ref' in block.content ? [block.content.ref] : [])),
    )
    if ('failure' in references) return references
    for (const block of event.fact.blocks) {
      const versions = history.filter(previous => previous.index === block.index)
      const checked = updateProcess(current.get(block.index), block, versions, adoption)
      if ('failure' in checked) return checked
      if (!versions.some(previous => previous.sequence === block.sequence)) {
        history.push(block)
        current.set(block.index, block)
        writes.push(
          put({
            kind: 'process',
            process: { tenant: event.tenant, call: event.call, start: batch.start, block },
          }),
        )
      }
    }
  }
  return succeed(writes)
}

function recallBatch(
  snapshot: Snapshot,
  batch: Pick<FactBatch, 'start' | 'source' | 'batch'>,
  value: ToolMaterialFingerprint,
): Outcome<FactReceipt | null, ToolFailure> {
  const known = snapshot.batches.get(factKey(batch.start, batch.source.owner, batch.batch))
  if (known === undefined) return succeed(null)
  return sameFactValue(known.value, value)
    ? succeed(known.receipt)
    : invalid('batch', 'batch-conflict')
}

type EventPlan = Readonly<{
  fresh: readonly FactEventRecord[]
  writes: readonly LedgerWrite[]
}>
function factPlace(call: CallRecord, batch: Pick<FactBatch, 'start' | 'source'>) {
  return {
    tenant: call.tenant,
    call: call.call,
    start: batch.start.operation,
    owner: batch.source.owner,
  }
}
function planEvents(
  snapshot: Snapshot,
  call: CallRecord,
  batch: StoredFactBatch,
  mint: Mint,
): Outcome<EventPlan, ToolFailure> {
  const start = batch.start
  const place = factPlace(call, batch)
  const facts = new Map(snapshot.facts)
  const fresh: FactEventRecord[] = []
  const writes: LedgerWrite[] = []
  let final = [...facts.values()].find(
    record => record.start.operation === start.operation && record.fact.kind === 'final',
  )
  for (const event of batch.events) {
    const key = factKey(start, batch.source.owner, event.event)
    const known = facts.get(key)
    if (known !== undefined) {
      if (!sameFactValue(known.value, event.value)) return invalid('batch.events', 'event-conflict')
      continue
    }
    const evidence = mintEvidence('fact-event', { ...place, event: event.event }, mint.revision, {
      start,
      source: batch.source,
      event: event.event,
      value: event.value,
    })
    let record: FactEventRecord = {
      ...event,
      key,
      start,
      source: batch.source,
      evidence,
      tenant: call.tenant,
      call: call.call,
    }
    if (event.fact.kind === 'final') {
      if (final !== undefined && !sameFactValue(final.value, event.value))
        return invalid('batch.events.fact', 'final-conflict')
      if (final === undefined) {
        final = record
        writes.push(
          put({
            kind: 'task',
            task: {
              kind: 'settle',
              operation: factTaskOperation('settle', { ...place, event: event.event }),
              state: 'pending',
              diagnostic: null,
              basis: evidence,
            },
          }),
        )
      } else if (final.fact.kind === 'final') record = { ...record, fact: final.fact }
    }
    facts.set(key, record)
    fresh.push(record)
    writes.push(put({ kind: 'fact-event', fact: record }))
  }
  return succeed({ fresh, writes })
}

export function checkFactBatch(
  snapshot: Snapshot,
  start: ToolStartRecord,
  batch: FactBatch | StoredFactBatch,
  value: ToolMaterialFingerprint,
): Outcome<FactReceipt | null, ToolFailure> {
  const call = snapshot.call
  if (call === null) return invalid('call', 'unknown-call')
  if (
    call.start === null ||
    !sameFactValue(start, batch.start) ||
    !sameFactValue(call.start, start) ||
    start.execution.call !== call.call ||
    tenantKey(start.execution.tenant) !== tenantKey(call.tenant)
  )
    return invalid('start', 'not-original-invocation')
  const stream = snapshot.streams.get(factKey(start, batch.source.owner))
  if (
    stream !== undefined &&
    (!sameFactValue(stream.start, start) || !sameFactValue(stream.source, batch.source))
  )
    return invalid('batch.source', 'source-conflict')
  let final:
    | StoredExecutionFact
    | Extract<FactBatch['events'][number]['fact'], { kind: 'final' }>
    | undefined = [...snapshot.facts.values()].find(
    record => record.start.operation === start.operation && record.fact.kind === 'final',
  )?.fact
  for (const event of batch.events) {
    if (event.fact.kind !== 'final') continue
    if (
      final?.kind === 'final' &&
      !sameFactValue(
        [final.raw, final.terminal, final.effect],
        [event.fact.raw, event.fact.terminal, event.fact.effect],
      )
    )
      return invalid('batch.events.fact', 'final-conflict')
    final = event.fact
  }
  const recalled = recallBatch(snapshot, batch, value)
  if ('failure' in recalled) return recalled
  if (recalled.ok !== null) return succeed(recalled.ok)
  if (batch.after !== (stream?.cursor ?? null))
    return fail({ kind: 'invalid-cursor', reason: 'non-contiguous-fact-batch' })
  const used = [...snapshot.batches.values()].some(
    record =>
      factKey(record.start, record.source.owner) === factKey(start, batch.source.owner) &&
      record.cursor === batch.cursor,
  )
  if (used || batch.cursor === batch.after)
    return fail({ kind: 'invalid-cursor', reason: 'reused-fact-boundary' })
  return succeed(null)
}

export function decideReceiveFacts(
  snapshot: Snapshot,
  start: ToolStartRecord,
  batch: StoredFactBatch,
  mint: Mint,
  adoption: Adoption,
): Decision<FactReceipt> {
  const checked = checkFactBatch(snapshot, start, batch, batch.value)
  if ('failure' in checked) return reply(checked)
  if (checked.ok !== null) return reply(succeed(checked.ok))
  const call = snapshot.call
  if (call === null) return reply(invalid('call', 'unknown-call'))
  const events = planEvents(snapshot, call, batch, mint)
  if ('failure' in events) return reply(events)
  const writes = [...events.ok.writes]
  const process = processWrites(snapshot, batch, events.ok.fresh, adoption)
  if ('failure' in process) return reply(process)
  writes.push(...process.ok)
  return commitBatch(call, batch, mint, writes)
}

function commitBatch(
  call: CallRecord,
  batch: StoredFactBatch,
  mint: Mint,
  writes: LedgerWrite[],
): Decision<FactReceipt> {
  const start = batch.start
  const place = factPlace(call, batch)
  const receipt: FactReceipt = {
    start: start.operation,
    batch: batch.batch,
    cursor: batch.cursor,
    custody: mintEvidence(
      'fact-custody',
      { ...place, batch: batch.batch },
      mint.revision,
      batch.value,
    ),
  }
  const { source: _previousSource, ...body } = call.state
  const state = { ...body, revision: mint.revision }
  writes.push(
    put({
      kind: 'fact-batch',
      batch: {
        tenant: call.tenant,
        call: call.call,
        ...batch,
        events: batch.events.map(event => event.event),
        receipt,
        acknowledgement: { kind: 'pending' },
      },
    }),
    put({
      kind: 'fact-stream',
      stream: {
        tenant: call.tenant,
        call: call.call,
        start,
        source: batch.source,
        cursor: batch.cursor,
      },
    }),
    put({
      kind: 'task',
      task: {
        kind: 'fact-ack',
        operation: factTaskOperation('fact-ack', { ...place, batch: batch.batch }),
        state: 'pending',
        diagnostic: null,
        start,
        source: batch.source,
        receipt,
      },
    }),
    put({
      kind: 'call',
      call: {
        ...call,
        state: {
          ...state,
          source: mintEvidence(
            'state',
            { tenant: call.tenant, call: call.call },
            mint.revision,
            state,
          ),
        },
      },
    }),
  )
  return { kind: 'commit', writes, value: receipt }
}

export function factProgress(snapshot: Snapshot): readonly FactProgress[] {
  return [...snapshot.streams.values()].map(stream => ({
    start: stream.start,
    source: stream.source,
    cursor: stream.cursor,
    pendingAcknowledgements: [...snapshot.batches.values()]
      .filter(
        batch =>
          batch.acknowledgement.kind === 'pending' &&
          factKey(batch.start, batch.source.owner) === factKey(stream.start, stream.source.owner),
      )
      .map(batch => batch.receipt),
  }))
}

export function readSavedFact<B extends ContentBlock>(
  snapshot: Snapshot,
  basis: SavedFact<B>['evidence'],
): Outcome<Pick<FactEventRecord, 'start' | 'source' | 'event' | 'fact' | 'evidence'>, ToolFailure> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  const record = [...snapshot.facts.values()].find(fact => sameFactValue(fact.evidence, basis))
  if (record === undefined) return invalid('basis', 'unknown-fact-evidence')
  return succeed(
    structuredClone({
      start: record.start,
      source: record.source,
      event: record.event,
      fact: record.fact,
      evidence: record.evidence,
    }),
  )
}
