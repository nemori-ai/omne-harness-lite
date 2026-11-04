// The commands of the memory Journal append their facts (R2-D308): each write is one batch, the
// fold of the log is the view the Journal holds, and the view names the revision and the
// checkpoint the reader records answer. The batch rules the command migration added have a
// negative control each: a joint commit without a fact of its own still advances, a step takes
// more than one input batch, and an account delivery does not collide with the result of its
// consumption.
import { describe, expect, it } from 'vitest'
import type { AgentCheckpoint } from '@omne-harness/agent-contract'
import {
  advances,
  batchOf,
  checkpointOf,
  emptyExecutionView,
  fold,
  foldAll,
  viewDigest,
  type ExecutionView,
  type FactBody,
  type PublishedBatch,
} from '../src/journal/index.ts'
import { canonical } from '../src/testing/canonical.ts'
import { evidence, ok, operation, scene } from './fixtures/common-journal.ts'

type Scene = Awaited<ReturnType<typeof scene>>

const shape = (value: AgentCheckpoint) =>
  canonical({ ...value, adoptedRequest: value.adoptedRequest ?? null })

/** The fact family the scene's Journal holds, checked against the reader records. */
async function agree(s: Scene) {
  const facts = s.view.controls.agentFacts()
  // F3 on the real log: the held view is the fold of the batches from the start.
  expect(viewDigest(foldAll(facts.log))).toBe(viewDigest(facts.view))
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  const folded = facts.view.executions.get(s.execution)!
  expect(String(folded.revision)).toBe(loaded.revision)
  expect(shape(checkpointOf(folded, facts.blobs))).toBe(shape(loaded.checkpoint))
  return { facts, loaded }
}

async function commit(
  s: Scene,
  label: string,
  change: Partial<Parameters<Scene['view']['journal']['commit']>[0]>,
) {
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  return ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(label),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: loaded.checkpoint,
      state: { kind: 'advancing' },
      events: [],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
      ...change,
    }),
  )
}

describe('the commands of the memory Journal append their facts (R2-D308)', () => {
  it('each write is one batch; the log folds to the held view, its revision and checkpoint', async () => {
    const s = await scene('command-facts')
    const opened = await agree(s)
    expect(opened.facts.log).toHaveLength(1)

    const moved = await commit(s, 'move', {
      checkpoint: { ...opened.loaded.checkpoint, position: 'moved' },
    })
    const afterMove = await agree(s)
    expect(afterMove.facts.log).toHaveLength(2)
    const batch = afterMove.facts.log.at(-1)!
    expect(batch.envelope.op).toBe(moved.operation)
    expect(batch.facts.map(fact => fact.kind)).toEqual(['cursor.moved'])
    // The receipt is the batch's own evidence, minted from its coordinates.
    expect(moved.evidence.record.endsWith(`/${s.execution}/pub/${batch.pub}`)).toBe(true)

    // A commit with no new fact appends the envelope alone and answers the current revision.
    const same = await commit(s, 'same', {})
    const afterSame = await agree(s)
    expect(afterSame.facts.log).toHaveLength(3)
    expect(afterSame.facts.log.at(-1)!.facts).toEqual([])
    expect(same.revision).toBe(moved.revision)

    // The same operation again is answered from its record: no second batch.
    const again = await commit(s, 'same', {})
    expect(again).toEqual(same)
    expect(s.view.controls.agentFacts().log).toHaveLength(3)
  })
})

const execution = 'exec-rules' as never
const step = 'exec-rules/step/1' as never
function published(
  view: ExecutionView,
  facts: FactBody[],
  kinds: readonly 'message'[] = [],
  pub = 1,
) {
  const built = batchOf(
    view,
    { op: `op-${pub}` as never, digest: `d-${pub}`, rev: 0, gen: '1', kinds },
    facts,
  )
  if (!('envelope' in built)) throw new Error(JSON.stringify(built))
  return { ...built, pub } satisfies PublishedBatch
}

describe('the batch rules of the command migration, with their negative controls', () => {
  it('a joint commit without a fact of its own advances the revision; the bare envelope does not', () => {
    const view = emptyExecutionView(execution)
    expect(advances(published(view, [], ['message']))).toBe(true)
    expect(advances(published(view, []))).toBe(false)
    const after = fold(
      {
        head: 0,
        executions: new Map([[execution, { ...view, revision: 3 }]]),
        ops: new Map(),
        excluded: new Map(),
      },
      published(view, [], ['message']),
    )
    expect(after.executions.get(execution)!.revision).toBe(4)
  })

  it('a step takes a second input batch; the same batch twice is refused', () => {
    const batch = (id: string) => ({
      id: id as never,
      watermark: evidence(`watermark/${id}`),
      ordered: [],
    })
    const first = published(emptyExecutionView(execution), [
      { kind: 'step.begun', step, batch: batch('b-1') },
    ])
    const view = fold(
      { head: 0, executions: new Map(), ops: new Map(), excluded: new Map() },
      first,
    ).executions.get(execution)!
    const second = batchOf(
      view,
      { op: 'op-2' as never, digest: 'd-2', rev: 0, gen: '1', kinds: [] },
      [{ kind: 'step.begun', step, batch: batch('b-2') }],
    )
    expect('envelope' in second).toBe(true)
    const repeated = batchOf(
      view,
      { op: 'op-3' as never, digest: 'd-3', rev: 0, gen: '1', kinds: [] },
      [{ kind: 'step.begun', step, batch: batch('b-1') }],
    )
    expect(repeated).toMatchObject({ kind: 'repeated' })
  })

  it('an account delivery of a consumption follows its result; a second result is refused', () => {
    const received = (delivery: 'result' | 'account', record: string): FactBody => ({
      kind: 'result.received',
      consumption: 'consumption-1' as never,
      delivery: record,
      result: {
        producer: 'model',
        call: 'call-1',
        version: '1',
        delivery,
        source: evidence(record),
      },
      consumer: { owner: 'agent', work: 'w', position: 'p', purpose: 'main' } as never,
      custody: { digest: record, size: 1 },
      saved: evidence(`saved/${record}`),
    })
    const view = fold(
      { head: 0, executions: new Map(), ops: new Map(), excluded: new Map() },
      published(emptyExecutionView(execution), [received('result', 'r-1')]),
    ).executions.get(execution)!
    const account = batchOf(
      view,
      { op: 'op-2' as never, digest: 'd-2', rev: 0, gen: '1', kinds: [] },
      [received('account', 'a-1')],
    )
    expect('envelope' in account).toBe(true)
    const again = batchOf(
      view,
      { op: 'op-3' as never, digest: 'd-3', rev: 0, gen: '1', kinds: [] },
      [received('result', 'r-2')],
    )
    expect(again).toMatchObject({ kind: 'repeated' })
  })
})
