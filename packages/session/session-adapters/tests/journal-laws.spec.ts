import { describe, expect, it } from 'vitest'
import { EXECUTION_BATCH_MAX_FACTS } from '@omne-harness/session-storage-sql/participants'
import {
  BATCH_MAX_FACTS,
  BATCH_OVERHEAD_BYTES,
  FACT_MAX_BYTES,
  answer,
  batchBytes,
  batchOf,
  blobsOf,
  bytesOf,
  checkpointOf,
  cursorMoved,
  cursorOf,
  decodeRows,
  emptyExecutionView,
  emptySessionView,
  encodeBatch,
  factKey,
  fold,
  foldAll,
  foldItems,
  modelAttempt,
  movedMembers,
  refOf,
  viewDigest,
  viewText,
  voidedFacts,
  type FactBody,
  type FactRow,
  type OperationEntry,
  type EventView,
  type PublishedBatch,
  type SessionJournalView,
  type Stamp,
} from '../src/journal/index.ts'
import { testCancellationPolicyInstallation } from '@omne-harness/agent-contract/testing'
import {
  currentObligations,
  finishingOf,
  obligationId,
  settlementOf,
} from '../src/testing/journal-finishing.ts'
import {
  JOURNAL_OWNER,
  journalEvidence as journalValueEvidence,
  revisionOf,
} from '../src/testing/journal-values.ts'
import {
  checkpoint as sampleCheckpoint,
  evidence as journalEvidence,
  ok,
  operation as journalOperation,
  scene as journalScene,
} from './fixtures/common-journal.ts'
import { handed, prepareEnd, take } from './fixtures/progression.ts'
import { toolCall } from './fixtures/tool-call.ts'
import { bytesOfBatches, evidence, scene } from './fixtures/journal-facts.ts'
import { forAll, random } from './fixtures/property.ts'

const mint = { owner: 'laws', session: 'session-1' }
const scope = { tenant: 'tenant-1', session: 'session-1' }

// The view a fold leaves and every item it handed out, open or closed, as the store keeps them.
function itemStore() {
  let view = emptySessionView()
  const families = new Map<string, Map<string, unknown>>()
  const family = (execution: string, name: string) => {
    const key = `${execution}\0${name}`
    const found = families.get(key) ?? new Map<string, unknown>()
    families.set(key, found)
    return found
  }
  return {
    get view() {
      return view
    },
    land(batch: PublishedBatch) {
      const landed = foldItems(view, batch)
      view = landed.view
      for (const change of landed.changes)
        family(batch.execution, change.family).set(change.item, change.body)
    },
    item: (execution: string, name: string, item: string) => family(execution, name).get(item),
    count: (execution: string, name: string) => family(execution, name).size,
  }
}

function rowsOf(log: readonly PublishedBatch[]): FactRow[] {
  const rows: FactRow[] = []
  const eseq = new Map<string, number>()
  for (const batch of log) {
    const encoded = encodeBatch(scope, batch.pub, eseq.get(batch.execution) ?? 0, batch)
    if ('failure' in encoded) throw new Error(JSON.stringify(encoded.failure))
    rows.push(...encoded.ok.rows)
    eseq.set(batch.execution, encoded.ok.eseqNext)
  }
  return rows
}

describe('F1 determinism: one fact sequence folds to one view', () => {
  it('two folds of the same log have the same digest, whatever the kinds and the order', () => {
    forAll('F1', {
      runs: 60,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const first = foldAll(log)
        const second = foldAll(log)
        if (viewDigest(first) !== viewDigest(second)) return 'two folds differ'
        if (first.head !== log.length) return `head ${first.head} is not ${log.length}`
        return null
      },
    })
  })

  it('a fold through the stored rows is the fold of the batches (encode then decode)', () => {
    forAll('rows', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const decoded = decodeRows(rowsOf(log))
        if ('failure' in decoded) return `rows do not decode: ${JSON.stringify(decoded.failure)}`
        const direct = foldAll(log)
        const through = foldAll(decoded.ok)
        if (viewDigest(direct) !== viewDigest(through)) return 'the rows fold to another view'
        const rows = rowsOf(log)
        for (const execution of direct.executions.values())
          for (const event of execution.events) {
            const row = rows.find(
              item =>
                item.execution === execution.execution &&
                item.pub === event.pub &&
                item.ord === event.ord,
            )
            if (row?.eseq !== event.eseq) return `eseq ${event.eseq} is not in the row`
          }
        return null
      },
    })
  })
})

describe('F2 prefix closure: the view at pub p depends on the facts at pub <= p only', () => {
  it('replacing every batch after p leaves the fold of the prefix unchanged', () => {
    forAll('F2', {
      runs: 40,
      generate: rng => ({ scene: scene(rng), cut: rng.int(40) }),
      check: ({ scene: { log }, cut }) => {
        const p = Math.min(cut, log.length)
        const prefix = log.slice(0, p)
        const altered = [
          ...prefix,
          ...log.slice(p).map(batch => ({
            ...batch,
            facts: [{ kind: 'ack.through', sequence: 999 } satisfies FactBody],
          })),
        ]
        const fromPrefix = foldAll(prefix)
        const fromAlteredThenCut = foldAll(altered.slice(0, p))
        if (viewDigest(fromPrefix) !== viewDigest(fromAlteredThenCut))
          return 'prefix depends on later facts'
        let step: SessionJournalView = emptySessionView()
        for (const batch of prefix) step = fold(step, batch)
        if (viewDigest(step) !== viewDigest(fromPrefix)) return 'stepwise prefix differs'
        return null
      },
    })
  })
})

describe('F3 incremental equals whole: a cached view plus the missed batches is the fold from the start', () => {
  const law =
    (foldFrom: (view: SessionJournalView, batch: PublishedBatch) => SessionJournalView) =>
    ({ scene: { log }, cut }: { scene: ReturnType<typeof scene>; cut: number }) => {
      const k = Math.min(cut, log.length)
      let cached = emptySessionView()
      for (const batch of log.slice(0, k)) cached = foldFrom(cached, batch)
      let incremental = cached
      for (const batch of log.slice(k)) incremental = foldFrom(incremental, batch)
      let whole = emptySessionView()
      for (const batch of log) whole = foldFrom(whole, batch)
      return viewDigest(incremental) === viewDigest(whole)
        ? null
        : `incremental differs at k=${k}:\n${viewText(incremental).slice(0, 400)}\n${viewText(whole).slice(0, 400)}`
    }

  it('holds for the fold, for every split point', () => {
    forAll('F3', {
      runs: 60,
      generate: rng => ({ scene: scene(rng), cut: rng.int(40) }),
      check: law(fold),
    })
  })

  it('negative control: a fold that reads anything but its arguments breaks the law', () => {
    let seen = 0
    const broken = (view: SessionJournalView, batch: PublishedBatch): SessionJournalView => {
      seen += 1
      const folded = fold(view, batch)
      return { ...folded, head: folded.head + seen }
    }
    const rng = random(7)
    const value = { scene: scene(rng, { rounds: 3, executions: 1 }), cut: 2 }
    expect(law(broken)(value)).not.toBeNull()
  })

  it('folding a batch already folded (pub <= head) is the identity', () => {
    const { log } = scene(random(11), { rounds: 2 })
    const view = foldAll(log)
    expect(viewDigest(fold(view, log[0]!))).toBe(viewDigest(view))
    expect(viewDigest(fold(view, log.at(-1)!))).toBe(viewDigest(view))
  })
})

describe('F4 answers derive from the batch: no stored copy, one batch per operation', () => {
  it('the answer of a batch is the same before and after any later batch is folded', () => {
    forAll('F4', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        let view = emptySessionView()
        const first = new Map<string, string>()
        for (const batch of log) {
          view = fold(view, batch)
          first.set(batch.envelope.op, JSON.stringify(answer(mint, view, batch)))
        }
        for (const batch of log) {
          const again = JSON.stringify(answer(mint, view, batch))
          if (again !== first.get(batch.envelope.op))
            return `the answer of ${batch.envelope.op} changed`
        }
        return null
      },
    })
  })

  it('a recognition advances no revision and answers with the revision of the batch it recognizes', () => {
    forAll('recognize', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const index = itemStore()
        for (const batch of log) {
          const before = index.view.executions.get(batch.execution)?.revision ?? 0
          index.land(batch)
          const after = index.view.executions.get(batch.execution)!.revision
          const recognition = batch.facts.find(fact => fact.kind === 'op.recognized')
          if (recognition?.kind === 'op.recognized') {
            if (after !== before) return 'a recognition advanced the revision'
            const target = index.item(batch.execution, 'op', recognition.target) as
              | OperationEntry
              | undefined
            const entry = index.item(batch.execution, 'op', batch.envelope.op) as
              | OperationEntry
              | undefined
            if (target === undefined || entry?.revision !== target.revision)
              return 'a recognition answers another revision than its target'
          } else if (batch.facts.length === 0) {
            if (after !== before) return 'an envelope-only batch advanced the revision'
          } else if (after !== before + 1) return `a batch advanced by ${after - before}`
        }
        return null
      },
    })
  })

  it('the revision index names the batch that reached each revision, so a recognition needs no scan of the log', () => {
    forAll('reached', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const index = itemStore()
        for (const batch of log) {
          const before = index.view.executions.get(batch.execution)?.revision ?? 0
          const held = index.count(batch.execution, 'reached')
          index.land(batch)
          const after = index.view.executions.get(batch.execution)!
          if (after.reached.size !== 0) return 'the revision index stayed in memory'
          const reached = index.item(batch.execution, 'reached', String(after.revision)) as
            | Stamp
            | undefined
          if (after.revision !== before) {
            if (reached?.op !== batch.envelope.op || reached.pub !== batch.pub)
              return `revision ${String(after.revision)} is not indexed to its batch`
          } else if (index.count(batch.execution, 'reached') !== held)
            return 'a batch that advanced nothing changed the index'
          if (index.count(batch.execution, 'reached') !== after.revision)
            return `the index holds ${String(index.count(batch.execution, 'reached'))} entries at revision ${String(after.revision)}`
        }
        return null
      },
    })
  })

  it('one batch per operation: a second batch of an operation opens its op item again, which the store refuses (P6)', () => {
    const { log } = scene(random(3), { rounds: 2, executions: 1 })
    const view = foldAll(log)
    const repeated: PublishedBatch = { ...log[2]!, pub: log.length + 1 }
    const { changes } = foldItems(view, repeated)
    expect(changes).toContainEqual(
      expect.objectContaining({ family: 'op', item: repeated.envelope.op, change: 'opened' }),
    )
  })

  it('negative control: a retry that re-executes appends a second batch; decide refuses the repeated keys', () => {
    const { log } = scene(random(5), { rounds: 1, executions: 1, finish: false })
    const view = foldAll(log)
    const execution = view.executions.get(log[0]!.execution)!
    const intend = log.find(batch => batch.facts.some(fact => fact.kind === 'step.begun'))!
    const refused = batchOf(execution, intend.envelope, intend.facts)
    expect(refused).toEqual({ kind: 'repeated', key: factKey(intend.facts[0]!) })
  })
})

describe('F5 no copy: a fact holds references, never the content of another owner', () => {
  it('every generated fact is under FACT_MAX_BYTES and free of content members', () => {
    forAll('F5', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        for (const batch of log)
          for (const fact of batch.facts) {
            if (bytesOf(fact) > FACT_MAX_BYTES) return `${fact.kind} is ${bytesOf(fact)} bytes`
            const encoded = encodeBatch(scope, batch.pub, 0, batch)
            if ('failure' in encoded) return JSON.stringify(encoded.failure)
          }
        return null
      },
    })
  })

  it('an oversize fact is refused as oversize, and the batch is not encoded (P3 run-time guard)', () => {
    const { log } = scene(random(9), { rounds: 1, executions: 1 })
    const batch = log[0]!
    const big: FactBody = {
      kind: 'wait.entered',
      step: 's' as never,
      waits: { digest: 'x'.repeat(FACT_MAX_BYTES), size: 1 },
    }
    const encoded = encodeBatch(scope, batch.pub, 0, { ...batch, facts: [...batch.facts, big] })
    expect(encoded).toMatchObject({
      failure: { kind: 'oversize', factKind: 'wait.entered', ord: batch.facts.length + 1 },
    })
  })

  it('every accepted fact count leaves room for the physical batch envelope', () => {
    expect(EXECUTION_BATCH_MAX_FACTS).toBe(256)
    const { log } = scene(random(9), { rounds: 1, executions: 1 })
    const batch = log[0]!
    for (let count = 0; count <= EXECUTION_BATCH_MAX_FACTS; count += 1) {
      const facts: FactBody[] = Array.from({ length: count }, (_, index) => ({
        kind: 'ack.through',
        sequence: index + 1,
      }))
      const encoded = encodeBatch(scope, batch.pub, 0, { ...batch, facts })
      if (count < EXECUTION_BATCH_MAX_FACTS) {
        expect(encoded).toHaveProperty('ok')
        if ('failure' in encoded) throw new Error(JSON.stringify(encoded.failure))
        expect(encoded.ok.rows).toHaveLength(count + 1)
        expect(encoded.ok.rows[0]?.kind).toBe('batch')
        expect(encoded.ok.rows.length).toBeLessThanOrEqual(EXECUTION_BATCH_MAX_FACTS)
      } else {
        expect(encoded).toEqual({
          failure: { kind: 'too-many', facts: count, limit: EXECUTION_BATCH_MAX_FACTS - 1 },
        })
      }
    }
  })

  it('a batch with more than BATCH_MAX_FACTS facts is refused by encode and by decide', () => {
    const { log } = scene(random(9), { rounds: 1, executions: 1 })
    const batch = log[0]!
    const many: FactBody[] = Array.from({ length: BATCH_MAX_FACTS + 1 }, (_, index) => ({
      kind: 'ack.through',
      sequence: index + 1,
    }))
    expect(encodeBatch(scope, batch.pub, 0, { ...batch, facts: many })).toEqual({
      failure: { kind: 'too-many', facts: BATCH_MAX_FACTS + 1, limit: BATCH_MAX_FACTS },
    })
    const view = foldAll(log)
    expect(batchOf(view.executions.get(batch.execution)!, batch.envelope, many)).toEqual({
      kind: 'too-many',
      facts: BATCH_MAX_FACTS + 1,
      limit: BATCH_MAX_FACTS,
    })
  })

  it('a fact that carries a content member (role, content, messages, system) is refused as invalid', () => {
    const { log } = scene(random(9), { rounds: 1, executions: 1 })
    const batch = log[0]!
    const leaked = {
      kind: 'passage.declared',
      passage: 'p',
      subject: { role: 'assistant', content: 'leaked' },
      declared: evidence('leak'),
    } as unknown as FactBody
    const encoded = encodeBatch(scope, batch.pub, 0, { ...batch, facts: [leaked] })
    expect(encoded).toEqual({
      failure: { kind: 'invalid', field: 'facts[0].subject.role', reason: 'content' },
    })
  })
})

describe('P3 bounded commit: a batch carries this step alone', () => {
  it('no fact key repeats across a log (every fact is written once)', () => {
    forAll('P3-keys', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const seen = new Set<string>()
        for (const batch of log)
          for (const fact of batch.facts) {
            const key = `${batch.execution}/${factKey(fact)}`
            if (seen.has(key)) return `${key} repeats`
            seen.add(key)
          }
        return null
      },
    })
  })

  it('the intend batch of the 20th round is no larger than the 2nd round plus a constant', () => {
    const { rounds, executions } = scene(random(21), { rounds: 20, executions: 1, finish: false })
    const intends = rounds.get(executions[0]!)!
    expect(batchBytes(intends[19]!)).toBeLessThanOrEqual(batchBytes(intends[1]!) + 64)
  })

  it('the terminal batches are constant in the number of tool calls; the steps append the obligations', () => {
    const small = scene(random(31), { rounds: 4, executions: 1, finish: true })
    const large = scene(random(31), { rounds: 16, executions: 1, finish: true })
    const smallFinish = small.finishes.get(small.executions[0]!)!
    const largeFinish = large.finishes.get(large.executions[0]!)!
    const slack = 16
    expect(batchBytes(largeFinish.ended)).toBeLessThanOrEqual(batchBytes(smallFinish.ended) + slack)
    expect(batchBytes(largeFinish.candidate)).toBeLessThanOrEqual(
      batchBytes(smallFinish.candidate) + slack,
    )
    expect(batchBytes(largeFinish.obligations)).toBeLessThanOrEqual(
      batchBytes(smallFinish.obligations) + slack,
    )
    const perItem = 512
    const items = (log: readonly PublishedBatch[]) =>
      log.flatMap(batch => batch.facts.filter(fact => fact.kind === 'finish.obligation'))
    expect(items(large.log).length).toBeGreaterThan(items(small.log).length)
    for (const fact of items(large.log)) expect(bytesOf(fact)).toBeLessThanOrEqual(perItem)
    expect(bytesOfBatches(large.log)).toBeLessThanOrEqual(bytesOfBatches(small.log) * 5)
  })
})

describe('an unchanged commit appends the envelope alone', () => {
  it('an envelope-only batch advances no revision, is indexed, and answers the revision at its time', () => {
    forAll('envelope-only', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const index = itemStore()
        const at = new Map<string, number>()
        for (const batch of log) {
          const before = index.view.executions.get(batch.execution)?.revision ?? 0
          index.land(batch)
          if (batch.facts.length > 0) continue
          const after = index.view.executions.get(batch.execution)!.revision
          if (after !== before) return 'an envelope-only batch advanced the revision'
          if (index.item(batch.execution, 'op', batch.envelope.op) === undefined)
            return 'not indexed'
          const encoded = encodeBatch(scope, batch.pub, 0, batch)
          if ('failure' in encoded || encoded.ok.rows.length !== 1) return 'not one row'
          if (batchBytes(batch) > BATCH_OVERHEAD_BYTES) return 'not a small constant'
          at.set(batch.envelope.op, before)
        }
        for (const batch of log)
          if (batch.facts.length === 0) {
            const derived = answer(mint, index.view, batch)
            if (
              derived.kind !== 'receipt' ||
              Number(derived.receipt.revision) !== at.get(batch.envelope.op)
            )
              return 'the answer of an envelope-only batch moved with later batches'
          }
        return null
      },
    })
  })

  it('decide builds the envelope-only batch for a command without a new fact; dropping it would leave query unknown', () => {
    const { log } = scene(random(43), { rounds: 1, executions: 1, finish: false })
    const view = foldAll(log)
    const execution = view.executions.get(log[0]!.execution)!
    const envelope = {
      op: 'exec-1/op/900/commit' as never,
      digest: 'd',
      rev: 0,
      gen: '1',
      kinds: [] as never[],
    }
    const built = batchOf(execution, envelope, [])
    expect(built).toEqual({ execution: execution.execution, envelope, facts: [] })
    const appended = foldItems(view, {
      ...(built as { execution: never; envelope: never; facts: never }),
      pub: log.length + 1,
    })
    expect(appended.changes).toContainEqual(
      expect.objectContaining({ family: 'op', item: envelope.op, change: 'opened' }),
    )
    expect(appended.view.executions.get(execution.execution)!.revision).toBe(execution.revision)
  })
})

describe('exclusion is a fact of the log', () => {
  it('an excluded operation answers excluded and its write is refused', () => {
    forAll('excluded', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const view = foldAll(log)
        for (const batch of log)
          for (const fact of batch.facts) {
            if (fact.kind !== 'op.excluded') continue
            if (!view.executions.get(batch.execution)!.excluded.has(fact.operation))
              return 'exclusion not folded'
            const execution = view.executions.get(batch.execution)!
            const refused = batchOf(execution, { ...batch.envelope, op: fact.operation }, [])
            if (!('kind' in refused) || refused.kind !== 'excluded')
              return 'an excluded operation wrote again'
          }
        return null
      },
    })
  })
})

// What a log opened in a family that closes at birth, in order: only the item changes hold it.
function openedOfLog<T>(log: readonly PublishedBatch[], execution: string, family: string): T[] {
  let view = emptySessionView()
  const opened: T[] = []
  for (const batch of log) {
    const landed = foldItems(view, batch)
    view = landed.view
    if (batch.execution !== execution) continue
    for (const change of landed.changes)
      if (change.family === family && change.change === 'opened') opened.push(change.body as T)
  }
  return opened
}

const eventsOfLog = (log: readonly PublishedBatch[], execution: string) =>
  openedOfLog<EventView>(log, execution, 'event')

describe('the Tool start fence is a fact and an entry event', () => {
  it('fence.started opens a fence that closes at birth, projects an entry event and survives the rows', () => {
    const { log } = scene(random(48), { rounds: 3, executions: 1, finish: false })
    const view = foldAll(log)
    const execution = view.executions.get(log[0]!.execution)!
    const fences = openedOfLog<{ pub: number }>(log, log[0]!.execution, 'fence')
    expect(fences.length).toBeGreaterThan(0)
    expect(execution.fences).toEqual([])
    const emitted = eventsOfLog(log, log[0]!.execution)
    expect(execution.emitted).toBe(emitted.length)
    for (const fence of fences) {
      const event = emitted.find(item => item.pub === fence.pub)
      expect(event?.kind).toBe('entry')
      expect(event?.fact.kind).toBe('fence.started')
    }
    const decoded = decodeRows(rowsOf(log))
    expect('ok' in decoded && viewDigest(foldAll(decoded.ok))).toBe(viewDigest(view))
    const batch = log.find(item => item.facts.some(fact => fact.kind === 'fence.started'))!
    expect(answer(mint, view, batch).kind).toBe('receipt')
  })
})

describe('an open batch carries the attachment that names its Authority', () => {
  it('every exec.opened travels with an exec.attached, and the generation is set from it', () => {
    forAll('open-attached', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        let view = emptySessionView()
        for (const batch of log) {
          view = fold(view, batch)
          const opened = batch.facts.find(fact => fact.kind === 'exec.opened')
          if (opened === undefined) continue
          const attached = batch.facts.find(fact => fact.kind === 'exec.attached')
          if (attached?.kind !== 'exec.attached') return 'an open without its attachment'
          const execution = view.executions.get(batch.execution)!
          if (execution.gen !== attached.authority.generation) return 'generation not from the open'
          if (answer(mint, view, batch).kind !== 'authority')
            return 'open does not answer the Authority'
        }
        return null
      },
    })
  })

  it('negative control: decide refuses an open without its attachment', () => {
    const { log } = scene(random(53), { rounds: 1, executions: 1, finish: false })
    const open = log[0]!
    const empty = emptyExecutionView(open.execution)
    const withoutAttachment = open.facts.filter(fact => fact.kind !== 'exec.attached')
    expect(batchOf(empty, open.envelope, withoutAttachment)).toEqual({
      kind: 'incomplete',
      reason: 'open-without-attachment',
    })
    expect(batchOf(empty, open.envelope, open.facts)).toEqual({
      execution: open.execution,
      envelope: open.envelope,
      facts: open.facts,
    })
  })
})

describe('cursor.moved carries the changed top-level members only; no new fact, no fact row', () => {
  it('an unchanged checkpoint and state moves nothing and yields an envelope-only batch', () => {
    const { log } = scene(random(41), { rounds: 1, executions: 1, finish: false })
    const view = foldAll(log)
    const execution = view.executions.get(log[0]!.execution)!
    const checkpoint = sampleCheckpoint()
    const first = cursorMoved(execution, checkpoint, { kind: 'advancing' })
    expect(first).not.toBeNull()
    const moved = fold(view, {
      execution: execution.execution,
      envelope: { op: 'exec-1/op/999/commit' as never, digest: 'd', rev: 0, gen: '1', kinds: [] },
      facts: [first!],
      pub: log.length + 1,
    })
    const again = cursorMoved(moved.executions.get(execution.execution)!, checkpoint, {
      kind: 'advancing',
    })
    expect(again).toBeNull()
    expect(batchOf(moved.executions.get(execution.execution)!, log[0]!.envelope, [])).toEqual({
      execution: execution.execution,
      envelope: log[0]!.envelope,
      facts: [],
    })
  })

  it('moving one member writes that member alone, as a reference when it carries content', () => {
    const before = cursorOf(sampleCheckpoint(), { kind: 'advancing' })
    const after = cursorOf(
      { ...sampleCheckpoint(), position: 'M0', calls: [{ kind: 'model' } as never] },
      { kind: 'advancing' },
    )
    const moved = movedMembers(before, after)
    // What the checkpoint holds moves with its calls.
    expect(Object.keys(moved).sort()).toEqual(['calls', 'holds', 'position'])
    expect(moved.calls).toEqual(refOf([{ kind: 'model' }]))
    expect(bytesOf(moved)).toBeLessThan(256)
  })
})

type JournalScene = Awaited<ReturnType<typeof journalScene>>

const loadOf = async (s: JournalScene) =>
  ok(await s.view.journal.load({ ...s.access, execution: s.execution }))

async function withToolCalls(name: string, calls: number) {
  const s = await journalScene(name)
  ok(await handed(s))
  await take(s)
  for (let index = 0; index < calls; index += 1) {
    const tool = toolCall(s.access.tenant, `call-${index}`)
    const loaded = await loadOf(s)
    ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: journalOperation(`intent-${index}`),
        authority: loaded.executionAttachment ?? s.opened.authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, batch: tool.batch },
        state: { kind: 'advancing' },
        events: [],
        effects: [
          {
            action: tool.pending.action,
            pending: tool.pending,
            authority: loaded.executionAttachment ?? s.opened.authority,
          },
        ],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: null,
      }),
    )
    const { material: _material, ...entry } = tool.entry
    ok(
      await s.view.received.commit({
        ...s.access,
        execution: s.execution,
        operation: journalOperation(`receive-${index}`),
        entry,
        material: {
          kind: 'facts' as const,
          schema: loaded.checkpoint.schema,
          value: { kind: 'string' as const, value: `complete Tool account ${index}` },
        },
      }),
    )
  }
  return s
}

function batchNamed(s: JournalScene, name: string): PublishedBatch {
  const found = s.view.controls
    .facts()
    .log.find(batch => batch.envelope.op === journalOperation(name))
  if (found === undefined) throw new Error(`no batch of ${name}`)
  return found
}

async function finished(calls: number, options: { reissue?: boolean } = {}) {
  const s = await withToolCalls(`finish-${calls}`, calls)
  let ready = await prepareEnd(s)
  if (ready.state.kind !== 'settling') throw new Error('settling expected')
  let reissued: PublishedBatch | null = null
  if (options.reissue === true) {
    ok(
      await s.view.journal.prepareFinish({
        ...s.access,
        execution: s.execution,
        operation: journalOperation('end-prepare-again'),
        authorization: {
          kind: 'advancement',
          authority: ready.executionAttachment ?? s.opened.authority,
        },
        expected: ready.revision,
        candidate: ready.state.intent.candidate,
      }),
    )
    reissued = batchNamed(s, 'end-prepare-again')
    ready = await loadOf(s)
    if (ready.state.kind !== 'settling') throw new Error('settling expected')
  }
  const items = ready.finishObligations?.items ?? []
  const ended = ok(
    await s.view.journal.tryFinish({
      ...s.access,
      execution: s.execution,
      operation: journalOperation('end'),
      expected: ready.revision,
      authorization: {
        kind: 'advancement',
        authority: ready.executionAttachment ?? s.opened.authority,
      },
      intent: ready.state.intent,
    }),
  )
  if (ended.kind !== 'ended') throw new Error(`ended expected, got ${JSON.stringify(ended)}`)
  return {
    items,
    prepared: batchNamed(s, 'end-prepare'),
    reissued,
    ended: batchNamed(s, 'end'),
    log: s.view.controls.facts().log,
  }
}

describe('a control stage the execution already reached projects no second event', () => {
  function controlScene() {
    for (let seed = 1; seed < 400; seed += 1) {
      const { log } = scene(random(seed), { executions: 1, finish: false, rounds: 3 })
      const at = log.findIndex(batch =>
        batch.facts.some(fact => fact.kind === 'control.stage' && fact.step === null),
      )
      if (at >= 0) return { prefix: log.slice(0, at + 1), batch: log[at]! }
    }
    throw new Error('no seed generated a control stage')
  }

  it('repeats nothing for the same stage fact, and one event for a changed state or a step', () => {
    const { prefix, batch } = controlScene()
    const kindsOf = (log: readonly PublishedBatch[]) =>
      eventsOfLog(log, batch.execution).map(event => event.kind)
    const eventsOf = (facts: PublishedBatch['facts']) =>
      kindsOf([...prefix, { ...batch, pub: prefix.length + 1, facts }])
    const before = kindsOf(prefix)
    const stage = batch.facts.find(fact => fact.kind === 'control.stage')!
    if (stage.kind !== 'control.stage') throw new Error('control stage expected')
    expect(eventsOf([stage])).toEqual(before)
    const flipped = stage.state === 'reached' ? 'unresolved' : 'reached'
    expect(eventsOf([{ ...stage, state: flipped }])).toEqual([...before, 'control'])
    expect(eventsOf([{ ...stage, step: 'step-9' as never }])).toEqual([...before, 'control'])
  })
})

describe('no event after the execution ended, as the writer appends none', () => {
  it('a result received after the end folds as kept custody and projects no event', async () => {
    const { log } = await finished(1)
    const received = log.find(batch => batch.facts.some(fact => fact.kind === 'result.received'))
    if (received === undefined) throw new Error('the log has no received result')
    const late: PublishedBatch = { ...received, pub: log.length + 1 }
    const before = foldAll(log)
    const after = foldAll([...log, late])
    const events = after.executions.get(received.execution)?.events ?? []
    expect(events.at(-1)?.kind).toBe('ended')
    expect(events).toEqual(before.executions.get(received.execution)?.events)
  })
})

describe('the issue of obligations does not grow with the Tool calls', () => {
  it('after 150 Tool calls prepareFinish succeeds, its batch is the size it is after 1, and the end batch too', async () => {
    const small = await finished(1)
    const large = await finished(150)
    expect(large.ended.facts.map(fact => fact.kind)).toEqual(['finish.ended'])
    expect(Math.abs(batchBytes(large.ended) - batchBytes(small.ended))).toBeLessThanOrEqual(8)
    expect(large.items.length).toBeGreaterThan(150)
    expect(large.prepared.facts.map(fact => fact.kind)).toEqual(
      small.prepared.facts.map(fact => fact.kind),
    )
    expect(Math.abs(batchBytes(large.prepared) - batchBytes(small.prepared))).toBeLessThanOrEqual(
      16,
    )
    const perItem = 1024
    const facts = large.log.flatMap(batch =>
      batch.facts.filter(fact => fact.kind === 'finish.obligation'),
    )
    expect(facts.length).toBeGreaterThanOrEqual(large.items.length - small.items.length)
    for (const fact of facts) expect(bytesOf(fact)).toBeLessThanOrEqual(perItem)
    const biggest = Math.max(...large.items.map(item => bytesOf(item)))
    expect(Math.max(...facts.map(fact => bytesOf(fact)))).toBeLessThan(biggest)
  })

  it('a second issue for the same candidate appends the close alone: no unchanged obligation again', async () => {
    const run = await finished(3, { reissue: true })
    expect(run.reissued!.facts.map(fact => fact.kind)).toEqual(['finish.obligations'])
  })

  it('past the batch bound (260 calls) the issue still succeeds; written whole it would be refused', async () => {
    const large = await finished(260)
    expect(large.items.length + 1).toBeGreaterThan(BATCH_MAX_FACTS)
    expect(large.prepared.facts.length).toBeLessThan(8)
    const whole: FactBody[] = large.items.map(item => ({
      kind: 'finish.obligation',
      id: obligationId(item),
      category: item.kind,
      item: refOf(item),
      settled: item.disposition.kind === 'settled',
    }))
    expect(whole.length + 1).toBeGreaterThan(BATCH_MAX_FACTS)
    expect(
      encodeBatch(scope, 1, 0, {
        execution: large.ended.execution,
        envelope: large.ended.envelope,
        facts: whole,
      }),
    ).toMatchObject({ failure: { kind: 'too-many' } })
  }, 30_000)
})

describe('the finishing records are the projection of the folded facts', () => {
  it('a cancellation route rebuilt from the view and the blocks is the settlement and the list that load answers', async () => {
    const s = await journalScene('projection')
    ok(await handed(s))
    await take(s)
    const control = journalOperation('cancel-1')
    ok(
      await s.view.journal.control({
        ...s.access,
        execution: s.execution,
        operation: control,
        command: { kind: 'cancel', reason: journalEvidence('cancel') },
      }),
    )
    ok(
      await s.view.journal.recordControl({
        ...s.access,
        execution: s.execution,
        operation: journalOperation('intent-cancel'),
        target: control,
        stage: 'intent-established',
        state: 'reached',
        source: journalEvidence('intent'),
      }),
    )
    const common = async (name: string) => {
      const snapshot = await loadOf(s)
      const record = snapshot.controls.find(item => item.operation === control)!
      return {
        ...s.access,
        execution: s.execution,
        operation: journalOperation(name),
        authorization: {
          kind: 'cancel' as const,
          control,
          source: record.stages.accepted.source,
        },
        expected: snapshot.revision,
        installation: testCancellationPolicyInstallation.record,
      }
    }
    ok(
      await s.view.journal.commitSettlement({
        ...(await common('establish')),
        kind: 'establish-cancellation',
        predecessor: null,
      }),
    )
    const established = await loadOf(s)
    const route = established.settlement.route!
    ok(
      await s.view.journal.commitSettlement({
        ...(await common('judge')),
        kind: 'judge-cancellation',
        candidate: route.candidate,
        route: route.record,
      }),
    )
    const before = await common('prepare')
    ok(
      await s.view.journal.prepareFinish({
        ...s.access,
        execution: s.execution,
        operation: journalOperation('prepare'),
        authorization: before.authorization,
        expected: before.expected,
        candidate: route.candidate,
      }),
    )
    const snapshot = await loadOf(s)
    const { view, blobs, namespace } = s.view.controls.facts()
    const execution = view.executions.get(s.execution)!
    const projected = finishingOf(execution, blobs, {
      receipt: stamp => ({
        operation: stamp.op,
        execution: s.execution,
        revision: revisionOf(stamp.revision),
        evidence: {
          owner: JOURNAL_OWNER,
          record: `${namespace}/${s.execution}/pub/${stamp.pub}`,
          revision: String(stamp.revision),
          digest: stamp.digest,
        },
        state: 'applied',
      }),
      checkpoint: (candidate, revision) =>
        journalValueEvidence(
          `${namespace}/${s.execution}/candidate/${candidate}/checkpoint`,
          revision,
        ),
    })
    expect(snapshot.settlement.judgments).toHaveLength(1)
    expect(settlementOf(projected)).toEqual(snapshot.settlement)
    expect(currentObligations(projected)).toEqual(snapshot.finishObligations)
    const candidate = execution.finish.candidates[0]!
    expect(candidate).not.toHaveProperty('checkpoint')
    const cursor = blobs.get(candidate.cursor.digest) as { members: Record<string, unknown> }
    expect(cursor.members['calls']).toEqual(refOf(snapshot.checkpoint.calls))
    expect(cursor.members['passages']).toEqual(refOf(snapshot.checkpoint.passages))
  })
})

describe('the checkpoint of a folded view takes the input batch and the voided intents from their facts', () => {
  function voidedScene(
    cause: 'not-accepted' | 'lost' = 'not-accepted',
    later: readonly FactBody[] = [],
  ) {
    for (let seed = 1; seed < 200; seed += 1) {
      const { log } = scene(random(seed), { rounds: 1, executions: 1, finish: false })
      if (!log.some(batch => batch.facts.some(fact => fact.kind === 'intent.voided'))) continue
      const caused = log.map((batch, index) => ({
        ...batch,
        facts: [
          ...batch.facts.map(fact =>
            fact.kind === 'intent.voided' && fact.intent === 'model' ? { ...fact, cause } : fact,
          ),
          ...(index === log.length - 1 ? later : []),
        ],
      }))
      return foldAll(caused).executions.get(log[0]!.execution)!
    }
    throw new Error('no seed below 200 voids a request')
  }

  it('reads inputBatch from step.begun and voided from intent.voided with its call.intended', () => {
    const execution = voidedScene()
    const begun = execution.steps.at(-1)!
    const request = execution.requests.find(item => item.voided !== null)!
    const intent = [...execution.intents.values()].find(
      item => item.pending.kind === 'model' && item.pending.reference === request.reference,
    )!
    const checkpoint = {
      ...sampleCheckpoint(),
      step: begun.step,
      inputBatch: begun.batch,
      voided: [
        {
          kind: 'model' as const,
          step: request.step,
          action: intent.action,
          reference: request.reference,
          cause: 'not-accepted' as const,
          basis: request.voided!.basis,
        },
      ],
    }
    const cursor = cursorOf(checkpoint, { kind: 'advancing' })
    expect(cursor.inputBatch).toBe(begun.batch.id)
    expect(JSON.stringify(cursor)).not.toContain('voided')
    const blobs = new Map(blobsOf(checkpoint))
    expect(checkpointOf({ ...execution, cursor }, blobs)).toEqual({
      ...checkpoint,
      adoptedRequest: null,
    })
  })

  it('keeps the cause of a voided intent: a lost call folds and reads back as lost', () => {
    const execution = voidedScene('lost')
    const begun = execution.steps.at(-1)!
    const request = execution.requests.find(item => item.voided !== null)!
    expect(request.voided?.cause).toBe('lost')
    expect(execution.adopted?.reference).not.toBe(request.reference)
    const checkpoint = { ...sampleCheckpoint(), step: begun.step, inputBatch: begun.batch }
    const cursor = cursorOf(checkpoint, { kind: 'advancing' })
    const read = checkpointOf({ ...execution, cursor }, new Map(blobsOf(checkpoint)))
    expect(read.voided).toEqual([
      expect.objectContaining({
        reference: request.reference,
        cause: 'lost',
        basis: request.voided?.basis,
      }),
    ])
  })

  it('a voided Tool intent folds beside the requests and reads back by its action, in voiding order', () => {
    const execution = voidedScene()
    const begun = execution.steps.at(-1)!
    const refused = {
      kind: 'tool' as const,
      step: begun.step,
      action: [...execution.intents.keys()][0]!,
      cause: 'not-accepted' as const,
      basis: evidence('tool/refused'),
    }
    const facts = voidedFacts(execution, [refused]) ?? []
    expect(facts).toEqual([
      {
        kind: 'intent.voided',
        intent: 'tool',
        step: refused.step,
        action: refused.action,
        cause: 'not-accepted',
        basis: refused.basis,
      },
    ])
    const after = voidedScene('not-accepted', facts)
    expect(after.adopted).toEqual(execution.adopted)
    expect(after.requests).toEqual(execution.requests)
    const checkpoint = { ...sampleCheckpoint(), step: begun.step, inputBatch: begun.batch }
    const cursor = cursorOf(checkpoint, { kind: 'advancing' })
    const read = checkpointOf({ ...after, cursor }, new Map(blobsOf(checkpoint)))
    expect(read.voided.map(item => item.kind)).toEqual(['model', 'tool'])
    expect(read.voided[1]).toEqual(refused)
    expect(modelAttempt({ step: begun.step, voided: read.voided })).toBe(1)
  })

  it('negative control: a batch without its step.begun throws', () => {
    const execution = voidedScene()
    const begun = execution.steps.at(-1)!
    const checkpoint = { ...sampleCheckpoint(), step: begun.step, inputBatch: begun.batch }
    const cursor = cursorOf(checkpoint, { kind: 'advancing' })
    const blobs = new Map(blobsOf(checkpoint))
    expect(() => checkpointOf({ ...execution, cursor, steps: [] }, blobs)).toThrow(/step\.begun/)
  })
})
