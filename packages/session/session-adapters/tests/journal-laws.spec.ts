// The fold laws of the Agent fact family (R2-D292 F1 to F5, the formal properties P1, P3, P5, P6)
// over generated fact logs: any kinds, any order, one or two executions interleaved. Each law has
// a negative control: a broken fold, an oversize fact, a content member, a repeated operation, a
// commit without a new fact. The terminal batches are checked to stay constant in the number of
// tool calls (R2-D297).
import { describe, expect, it } from 'vitest'
import {
  BATCH_OVERHEAD_BYTES,
  FACT_MAX_BYTES,
  answer,
  batchBytes,
  batchOf,
  bytesOf,
  cursorMoved,
  cursorOf,
  decodeRows,
  emptyExecutionView,
  emptySessionView,
  encodeBatch,
  factKey,
  fold,
  foldAll,
  movedMembers,
  openCalls,
  operationState,
  refOf,
  viewDigest,
  viewText,
  type FactBody,
  type FactRow,
  type PublishedBatch,
  type SessionJournalView,
} from '../src/journal/index.ts'
import { checkpoint as sampleCheckpoint } from './fixtures/common-journal.ts'
import { bytesOfBatches, evidence, scene } from './fixtures/journal-facts.ts'
import { forAll, random } from './fixtures/property.ts'

const mint = { owner: 'laws', session: 'session-1' }
const scope = { tenant: 'tenant-1', session: 'session-1' }

/** The rows of a whole log, encoded batch by batch with the dense event sequence of each execution. */
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
        // The event sequence of the rows is the one the fold assigns.
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
        // And the folded prefix of the full log is reached by folding the prefix alone.
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
    // The broken fold counts the batches it has seen in a closure: the view then depends on the
    // process, not on the log, and the cached-plus-missed fold differs from the whole fold.
    let seen = 0
    const broken = (view: SessionJournalView, batch: PublishedBatch): SessionJournalView => {
      seen += 1
      const folded = fold(view, batch)
      return { ...folded, head: folded.head + (seen % 2) }
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
        let view = emptySessionView()
        for (const batch of log) {
          const before = view.executions.get(batch.execution)?.revision ?? 0
          view = fold(view, batch)
          const after = view.executions.get(batch.execution)!.revision
          const recognition = batch.facts.find(fact => fact.kind === 'op.recognized')
          if (recognition?.kind === 'op.recognized') {
            if (after !== before) return 'a recognition advanced the revision'
            const target = view.ops.get(recognition.target)
            const entry = view.ops.get(batch.envelope.op)
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

  it('one batch per operation: a second batch of an operation already indexed changes nothing but the head (P6)', () => {
    const { log } = scene(random(3), { rounds: 2, executions: 1 })
    const view = foldAll(log)
    const repeated: PublishedBatch = { ...log[2]!, pub: log.length + 1 }
    const after = fold(view, repeated)
    expect(after.ops.get(repeated.envelope.op)).toEqual(view.ops.get(repeated.envelope.op))
    expect(after.ops.get(repeated.envelope.op)!.pub).toBe(log[2]!.pub)
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
      kind: 'passage.declared',
      passage: 'p' as never,
      subject: { digest: 'x'.repeat(FACT_MAX_BYTES), size: 1 },
      declared: evidence('big'),
    }
    const encoded = encodeBatch(scope, batch.pub, 0, { ...batch, facts: [...batch.facts, big] })
    expect(encoded).toMatchObject({
      failure: { kind: 'oversize', factKind: 'passage.declared', ord: batch.facts.length + 1 },
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

  it('the reception targets are a projection: a call opens on call.intended and closes on result.received (R2-D297)', () => {
    const { log, executions } = scene(random(23), { rounds: 3, executions: 1, finish: false })
    let view = emptySessionView()
    for (const batch of log) {
      const before = openCalls(
        view.executions.get(executions[0]!) ?? emptyExecutionView(executions[0]!),
      ).length
      view = fold(view, batch)
      const after = openCalls(view.executions.get(executions[0]!)!).length
      const opened = batch.facts.filter(fact => fact.kind === 'call.intended').length
      const closed = batch.facts.filter(fact => fact.kind === 'result.received').length
      expect(after).toBe(before + opened - closed)
    }
    const execution = view.executions.get(executions[0]!)!
    expect(openCalls(execution)).toHaveLength(0)
    expect(execution.intents.size).toBeGreaterThanOrEqual(3)
  })

  it('the terminal batches are constant in the number of tool calls; obligations grow per item only (R2-D297)', () => {
    const small = scene(random(31), { rounds: 4, executions: 1, finish: true })
    const large = scene(random(31), { rounds: 16, executions: 1, finish: true })
    const smallFinish = small.finishes.get(small.executions[0]!)!
    const largeFinish = large.finishes.get(large.executions[0]!)!
    // Only the digits of the identities differ between 4 and 16 rounds.
    const slack = 16
    expect(batchBytes(largeFinish.ended)).toBeLessThanOrEqual(batchBytes(smallFinish.ended) + slack)
    expect(batchBytes(largeFinish.candidate)).toBeLessThanOrEqual(
      batchBytes(smallFinish.candidate) + slack,
    )
    const perItem = 512
    const smallItems = smallFinish.obligations.facts.length
    const largeItems = largeFinish.obligations.facts.length
    expect(largeItems).toBeGreaterThan(smallItems)
    expect(
      batchBytes(largeFinish.obligations) - batchBytes(smallFinish.obligations),
    ).toBeLessThanOrEqual((largeItems - smallItems) * perItem)
    for (const fact of largeFinish.obligations.facts)
      expect(bytesOf(fact)).toBeLessThanOrEqual(perItem)
    // The whole own part is linear in the rounds with a small coefficient.
    expect(bytesOfBatches(large.log)).toBeLessThanOrEqual(bytesOfBatches(small.log) * 5)
  })
})

describe('R2-D307: an unchanged commit appends the envelope alone', () => {
  it('an envelope-only batch advances no revision, is indexed, and answers the revision at its time', () => {
    forAll('envelope-only', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        let view = emptySessionView()
        const at = new Map<string, number>()
        for (const batch of log) {
          const before = view.executions.get(batch.execution)?.revision ?? 0
          view = fold(view, batch)
          if (batch.facts.length > 0) continue
          const after = view.executions.get(batch.execution)!.revision
          if (after !== before) return 'an envelope-only batch advanced the revision'
          if (operationState(view, batch.envelope.op) !== 'committed') return 'not indexed'
          const encoded = encodeBatch(scope, batch.pub, 0, batch)
          if ('failure' in encoded || encoded.ok.rows.length !== 1) return 'not one row'
          if (batchBytes(batch) > BATCH_OVERHEAD_BYTES) return 'not a small constant'
          at.set(batch.envelope.op, before)
        }
        for (const batch of log)
          if (batch.facts.length === 0) {
            const derived = answer(mint, view, batch)
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
    const appended = fold(view, {
      ...(built as { execution: never; envelope: never; facts: never }),
      pub: log.length + 1,
    })
    expect(operationState(appended, envelope.op)).toBe('committed')
    expect(appended.executions.get(execution.execution)!.revision).toBe(execution.revision)
    // The negative control of the ruling: without the batch, the operation cannot be recognized.
    expect(operationState(view, envelope.op)).toBe('unknown')
  })
})

describe('R2-D307: exclusion is a fact of the log', () => {
  it('an excluded operation answers excluded, its write is refused, and a committed operation cannot be excluded', () => {
    forAll('excluded', {
      runs: 40,
      generate: rng => scene(rng),
      check: ({ log }) => {
        const view = foldAll(log)
        for (const batch of log)
          for (const fact of batch.facts) {
            if (fact.kind !== 'op.excluded') continue
            if (operationState(view, fact.operation) !== 'excluded') return 'exclusion not folded'
            const execution = view.executions.get(batch.execution)!
            const refused = batchOf(execution, { ...batch.envelope, op: fact.operation }, [])
            if (!('kind' in refused) || refused.kind !== 'excluded')
              return 'an excluded operation wrote again'
          }
        for (const batch of log) {
          const execution = view.executions.get(batch.execution)!
          const exclusion = fold(view, {
            execution: batch.execution,
            envelope: { ...batch.envelope, op: 'exec-1/op/901/fence' as never },
            facts: [
              {
                kind: 'op.excluded',
                operation: batch.envelope.op,
                reason: 'fence',
                evidence: evidence('late-fence'),
                predecessor: null,
              },
            ],
            pub: view.head + 1,
          })
          if (operationState(exclusion, batch.envelope.op) !== 'committed')
            return 'a committed operation was excluded'
          if (execution.excluded.has(batch.envelope.op)) return 'excluded leaked into the execution'
          break
        }
        return null
      },
    })
  })
})

describe('R2-D307: the Tool start fence is a fact and an entry event', () => {
  it('fence.started folds into the fences, projects an entry event and survives the rows', () => {
    const { log } = scene(random(47), { rounds: 3, executions: 1, finish: false })
    const view = foldAll(log)
    const execution = view.executions.get(log[0]!.execution)!
    expect(execution.fences.length).toBeGreaterThan(0)
    for (const fence of execution.fences) {
      const event = execution.events.find(item => item.pub === fence.pub)
      expect(event?.kind).toBe('entry')
      expect(event?.fact.kind).toBe('fence.started')
    }
    const decoded = decodeRows(rowsOf(log))
    expect('ok' in decoded && viewDigest(foldAll(decoded.ok))).toBe(viewDigest(view))
    const batch = log.find(item => item.facts.some(fact => fact.kind === 'fence.started'))!
    expect(answer(mint, view, batch).kind).toBe('receipt')
  })
})

describe('R2-D307: an open batch carries the attachment that names its Authority', () => {
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
    expect(Object.keys(moved).sort()).toEqual(['calls', 'position'])
    expect(moved.calls).toEqual(refOf([{ kind: 'model' }]))
    expect(bytesOf(moved)).toBeLessThan(256)
  })
})
