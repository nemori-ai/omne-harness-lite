// The terminal of an ordinary completion on the production session-log Journal, with the Session
// finish check of the same storage commit (Agent SPEC "条件终结"; session-contract PA-02). The
// Agent takes the initial input (I0), commits the main reply Ja, F1, F2 and prepareFinish before
// AD-02 interpreted its `input-taken` event: Session still holds the initial input as pending for
// this Run, so the check answers a conflict. tryFinish then answers FinishResult.changed, not
// Failure.changed, and writes nothing. Once AD-02 commits the interpretation (`run.batch-taken`
// through `commitLog`), the same tryFinish ends the execution, and the reply is in the Session
// history as `message.assistant`. On the node:sqlite double that runs the published participant
// modules, with the AD-02 plugin on a real Cordis root.
import { describe, expect, it } from 'vitest'
import { setImmediate as nextTurn } from 'node:timers/promises'
import { setFlagsFromString } from 'node:v8'
import { runInNewContext } from 'node:vm'
import { decodePassageId, type Passage } from '@omne-harness/agent-contract'
import { succeed } from '@omne-harness/operation-result'
import type { FinishCandidateContent, JournalCommit } from '@omne-harness/agent-contract'
import { memoryAccess } from '@omne-harness/session-contract/testing'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { admitted, applied, load, prepared } from './fixtures/main-reply.ts'
import { createSessionJournalInterpretationPlugin } from '../src/cordis/journal-interpretation.ts'
import { cordisScene, handed, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const count = (s: SqlScene, table: string): number =>
  Number(s.controls?.select(`SELECT COUNT(*) AS n FROM ${table}`).rows[0]?.[0] ?? -1)
const kinds = (s: SqlScene): string[] =>
  (s.controls?.select(`SELECT kind FROM sl_entry ORDER BY position`).rows ?? []).map(row =>
    String(row[0]),
  )

/** I0: the batch of the initial input is taken, with its `input-taken` event. */
async function take(s: SqlScene, authority: JournalCommit<string>['authority']) {
  const loaded = await load(s)
  const page = ok(
    await s.view.journal.inputs({
      ...s.access,
      execution: s.execution,
      watermark: loaded.inputWatermark,
    }),
  )
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('take'),
      authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, inputBatch: page.batch },
      state: { kind: 'advancing' },
      events: [{ kind: 'input-taken', batch: page.batch }],
      effects: [],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

/** F1, F2 and prepareFinish of a complete candidate, as the coordinator writes them. */
async function prepareEnd(
  s: SqlScene,
  authority: JournalCommit<string>['authority'],
  candidate: Partial<FinishCandidateContent> = {},
) {
  const commit = async (step: 'F1' | 'F2', finish: JournalCommit<string>['finish']) => {
    const loaded = await load(s)
    ok(
      await s.view.journal.commit({
        ...s.access,
        execution: s.execution,
        operation: operation(`end-${step}`),
        authority,
        expected: loaded.revision,
        checkpoint: { ...loaded.checkpoint, position: step },
        state: { kind: 'settling' },
        events: [],
        effects: [],
        caller: { kind: 'none' },
        replyAdmission: null,
        handoff: null,
        finish: finish === null ? null : { ...finish, inputWatermark: loaded.inputWatermark },
      }),
    )
  }
  await commit('F1', {
    origin: evidence('end-origin'),
    conclusion: { kind: 'complete' },
    failure: null,
    inputWatermark: evidence('replaced'),
    conditions: evidence('end-conditions'),
    ...candidate,
  })
  await commit('F2', null)
  const settling = await load(s)
  if (settling.state.kind !== 'settling') throw new Error('settling expected')
  ok(
    await s.view.journal.prepareFinish({
      ...s.access,
      execution: s.execution,
      operation: operation('end-prepare'),
      authorization: { kind: 'advancement', authority },
      expected: settling.revision,
      candidate: settling.state.intent.candidate,
    }),
  )
  return load(s)
}

describe('tryFinish on the production session-log Journal with the PA-02 finish check', () => {
  for (const storage of ['double', 'real'] as const) {
    it(
      `node failure retains the original untaken input and candidate across a cold provider (${storage})`,
      { tags: storage === 'real' ? ['slow'] : [] },
      async () => {
        const s = await sqlScene(`node-failure-${storage}`, { storage })
        try {
          const opened = ok(await s.view.journal.open(s.openInput))
          ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
          const before = await load(s)
          const inputRead = {
            ...s.access,
            execution: s.execution,
            watermark: before.inputWatermark,
          }
          const original = ok(await s.view.journal.inputs(inputRead))
          const failure = {
            kind: 'node-failed',
            node: 'E4',
            category: 'invariant',
            failureKind: 'unavailable',
            step: null,
            at: '2026-11-06T00:00:00Z',
            source: before.history,
          } as const
          const ready = await prepareEnd(s, opened.authority, {
            origin: before.history,
            conclusion: { kind: 'fail', cause: evidence('node-failure') },
            failure,
          })
          if (ready.state.kind !== 'settling') throw new Error('settling expected')
          const ended = ok(
            await s.view.journal.tryFinish({
              ...s.access,
              execution: s.execution,
              operation: operation('node-failure-end'),
              authorization: { kind: 'advancement', authority: opened.authority },
              expected: ready.revision,
              intent: ready.state.intent,
            }),
          )
          expect(ended.kind).toBe('ended')
          const cold = s.fresh().journal
          const after = ok(await cold.load({ ...s.access, execution: s.execution }))
          expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'fail' } })
          expect(after.settlement.candidate?.failure).toEqual(failure)
          expect(after.inputWatermark).toEqual(before.inputWatermark)
          expect(ok(await cold.inputs(inputRead))).toEqual(original)
          const events = ok(
            await cold.output.read({
              ...s.access,
              execution: s.execution,
              after: null,
              limit: 100,
            }),
          )
          if (events.kind !== 'page') throw new Error('retained event page expected')
          expect(events.events.filter(event => event.body.kind === 'input-taken')).toHaveLength(0)
          expect(events.events.filter(event => event.body.kind === 'ended')).toHaveLength(1)
          const c = await cordisScene(s)
          try {
            const interpretation = createSessionJournalInterpretationPlugin<string>({
              coordinator: async () => succeed(s.access.principal),
            })
            await c.mount(interpretation.plugin)
            ok(
              await interpretation.interpret({
                tenant: s.access.tenant,
                session: s.access.session,
                execution: s.execution,
              }),
            )
            const work = ok(await s.port.readWork(s.access))
            expect(work.run).toMatchObject({ kind: 'terminal', terminal: { outcome: 'failed' } })
          } finally {
            await c.dispose()
          }
        } finally {
          await s.close()
        }
      },
    )
  }

  it('an observation of the events that started before the terminal receives the ended event', async () => {
    // The wait of the Agent loop observes the events of its execution (loop-algorithm W0). The
    // commit that ends the last open execution must reach that observation: the loop leaves its
    // slot on this event, not on a later check of the clock.
    const s = await sqlScene('finish-observed')
    try {
      const opened = ok(await s.view.journal.open(s.openInput))
      ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
      const before = await load(s)
      const ready = await prepareEnd(s, opened.authority, {
        origin: before.history,
        conclusion: { kind: 'fail', cause: evidence('node-failure') },
        failure: {
          kind: 'node-failed',
          node: 'E4',
          category: 'invariant',
          failureKind: 'unavailable',
          step: null,
          at: '2026-11-06T00:00:00Z',
          source: before.history,
        },
      })
      if (ready.state.kind !== 'settling') throw new Error('settling expected')
      const stop = new AbortController()
      const stream = s.view.journal.output
        .events({
          ...s.access,
          execution: s.execution,
          after: ready.output.emittedThrough,
          signal: stop.signal,
        })
        [Symbol.asyncIterator]()
      const observed = (async () => {
        for (;;) {
          const next = await stream.next()
          if (next.done) return []
          const page = ok(next.value)
          if (page.kind === 'page' && page.events.length > 0)
            return page.events.map(event => event.body.kind)
        }
      })()
      // The observation is attached before the terminal is written.
      for (let turn = 0; turn < 20; turn += 1) await nextTurn()
      const ended = ok(
        await s.view.journal.tryFinish({
          ...s.access,
          execution: s.execution,
          operation: operation('observed-end'),
          authorization: { kind: 'advancement', authority: opened.authority },
          expected: ready.revision,
          intent: ready.state.intent,
        }),
      )
      expect(ended.kind).toBe('ended')
      const late = new Promise<string[]>(resolve =>
        setTimeout(() => resolve(['not-observed']), 500),
      )
      expect(await Promise.race([observed, late])).toContain('ended')
      // The observation keeps the book's copy while it is open: work in another session does not
      // send the book cold under it. Once it ends, that work does.
      const readsOfOneLoad = async () => {
        let reads = 0
        s.rewriteReads.current = (_request, answer) => {
          reads += 1
          return answer
        }
        await load(s)
        s.rewriteReads.current = null
        return reads
      }
      const workElsewhere = async () => {
        const other = memoryAccess('tester', 'another-session')
        await s.journals.forSession(other).journal.load({ ...other, execution: s.execution })
      }
      const warm = await readsOfOneLoad()
      await workElsewhere()
      expect(await readsOfOneLoad()).toBe(warm)
      stop.abort()
      await stream.return?.()
      await workElsewhere()
      expect(await readsOfOneLoad()).toBeGreaterThan(warm)
    } finally {
      await s.close()
    }
  })

  it('a conflict of the Session check is FinishResult.changed and writes nothing; after the hand-over the same tryFinish ends the execution with the reply in the history', async () => {
    const s = await sqlScene('finish-pa02')
    try {
      const open = ok(await s.view.journal.open(s.openInput))
      const authority = open.authority
      await take(s, authority)
      const request = await prepared(s, authority, 'model-reply')
      ok(await s.view.journal.commit(await applied(s, authority, request, admitted(request))))
      const ready = await prepareEnd(s, authority)
      if (ready.state.kind !== 'settling') throw new Error('settling expected')
      const finish = {
        ...s.access,
        execution: s.execution,
        operation: operation('end'),
        authorization: { kind: 'advancement' as const, authority },
        expected: ready.revision,
        intent: ready.state.intent,
      }
      const before = { rows: count(s, 'sl_entry'), records: count(s, 'er_operation') }

      // The initial input is pending for this Run and has no SE35: PA-02 answers a conflict.
      expect(await s.view.journal.tryFinish(finish)).toEqual({
        ok: { kind: 'changed', revision: ready.revision },
      })
      expect((await load(s)).revision).toBe(ready.revision)
      expect((await load(s)).state.kind).toBe('settling')
      expect(count(s, 'sl_entry')).toBe(before.rows)
      expect(count(s, 'er_operation')).toBe(before.records)

      // AD-02 interprets the events of the execution: `input-taken` leaves the pending inputs.
      const c = await cordisScene(s)
      try {
        const interpretation = createSessionJournalInterpretationPlugin<string>({
          coordinator: () => Promise.resolve(succeed(s.access.principal)),
        })
        await c.mount(interpretation.plugin)
        const target = {
          tenant: s.access.tenant,
          session: s.access.session,
          execution: s.execution,
        }
        expect(ok(await interpretation.interpret(target)).committed).toBeGreaterThan(0)
      } finally {
        await c.dispose()
      }
      expect(kinds(s)).toContain('run.batch-taken')
      const ended = ok(await s.view.journal.tryFinish(finish))
      expect(ended.kind).toBe('ended')
      const after = await load(s)
      expect(after.state).toMatchObject({ kind: 'ended', conclusion: { kind: 'complete' } })
      expect(kinds(s)).toContain('message.assistant')
    } finally {
      await s.close()
    }
  })
})

it('reclaims terminal working records while retaining the original observation and receipt in SQL', async () => {
  setFlagsFromString('--expose-gc')
  const gc: unknown = runInNewContext('gc')
  if (typeof gc !== 'function') throw new Error('GC is required for the lifetime assertion')
  const s = await sqlScene('terminal-working-copy')
  try {
    const passage: Passage = {
      id: ok(decodePassageId('after-terminal')),
      position: 'after_terminal',
      dimension: null,
      purpose: null,
      action: null,
      ordinal: 0,
      declaration: {
        name: 'observe',
        position: 'after_terminal',
        power: 'observe',
        implementation: { kind: 'builtin', builtinName: 'observe' },
      },
      implementation: s.openInput.checkpoint.schema,
      input: evidence('observer-input'),
      effective: evidence('observer-effective'),
      operations: [],
      progress: { kind: 'requested', mode: { kind: 'fresh' } },
    }
    const second = { ...passage, id: ok(decodePassageId('second-terminal')) }
    const earlier: Passage = {
      ...passage,
      id: ok(decodePassageId('before-model')),
      position: 'before_model_call',
      purpose: 'main',
      declaration: { ...passage.declaration, position: 'before_model_call' },
      progress: {
        kind: 'applied',
        rounds: [],
        transition: evidence('before-model-applied'),
        conclusion: {
          position: 'before_model_call',
          passage: ok(decodePassageId('before-model')),
          extension: 'observe',
          implementation: passage.implementation,
          power: 'observe',
          at: '2026-11-06T00:00:00Z',
          output: { kind: 'observed' },
        },
      },
    }
    const opened = ok(
      await s.view.journal.open({
        ...s.openInput,
        checkpoint: { ...s.openInput.checkpoint, passages: [passage, earlier, second] },
      }),
    )
    ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
    const before = await load(s)
    expect(before.terminalObservations).toHaveLength(0)
    expect(
      ok(await s.fresh().journal.load({ ...s.access, execution: s.execution }))
        .terminalObservations,
    ).toHaveLength(0)
    const ready = await prepareEnd(s, opened.authority, {
      origin: before.history,
      conclusion: { kind: 'fail', cause: evidence('node-failure') },
      failure: {
        kind: 'node-failed',
        node: 'E4',
        category: 'invariant',
        failureKind: 'unavailable',
        step: null,
        at: '2026-11-06T00:00:00Z',
        source: before.history,
      },
    })
    if (ready.state.kind !== 'settling') throw new Error('settling expected')
    const input = {
      ...s.access,
      execution: s.execution,
      operation: operation('end-working-copy'),
      authorization: { kind: 'advancement' as const, authority: opened.authority },
      expected: ready.revision,
      intent: ready.state.intent,
    }
    let warmReads = 0
    s.rewriteReads.current = (_request, answer) => {
      warmReads += 1
      return answer
    }
    await load(s)
    s.rewriteReads.current = null
    const ended = ok(await s.view.journal.tryFinish(input))
    expect(ended.kind).toBe('ended')
    // The book of the session that worked last keeps its copy: the steps of the loop after the
    // terminal read it. A read after the terminal costs the storage what a read before it did.
    async function readsOfOneLoad() {
      let reads = 0
      s.rewriteReads.current = (_request, answer) => {
        reads += 1
        return answer
      }
      await load(s)
      s.rewriteReads.current = null
      return reads
    }
    expect(await readsOfOneLoad()).toBe(warmReads)
    // Another session works: the resting book returns to the state of a cold start.
    async function workElsewhere() {
      const other = memoryAccess('tester', 'another-session')
      await s.journals.forSession(other).journal.load({ ...other, execution: s.execution })
    }
    await workElsewhere()
    // The snapshot now comes from the durable records, so none of its objects is one this test
    // passed in. Every object of it, not only the observation: the folded facts and the decoded
    // blocks that the provider read for it leave with the working copy.
    async function snapshotWeakly() {
      const parts: WeakRef<object>[] = []
      const visit = (value: unknown) => {
        if (typeof value !== 'object' || value === null) return
        parts.push(new WeakRef(value))
        for (const item of Object.values(value)) visit(item)
      }
      const snapshot = await load(s)
      visit(snapshot)
      const observation = snapshot.terminalObservations[0]
      if (observation === undefined) throw new Error('terminal observation missing')
      return { parts, weak: new WeakRef(observation) }
    }
    const { parts, weak } = await snapshotWeakly()
    expect(parts.length).toBeGreaterThan(10)
    await workElsewhere()
    for (let round = 0; round < 4; round++) {
      await nextTurn()
      gc()
    }
    expect(weak.deref()).toBeUndefined()
    expect(parts.filter(part => part.deref() !== undefined)).toHaveLength(0)
    expect(ok(await s.view.journal.tryFinish(input))).toEqual(ended)
    const recovered = await load(s)
    expect(recovered.state.kind).toBe('ended')
    expect(recovered.terminalObservations).toHaveLength(2)
    expect(recovered.terminalObservations[0]).toMatchObject({ passage: passage.id, observed: null })
    expect(ok(await s.fresh().journal.load({ ...s.access, execution: s.execution }))).toEqual(
      recovered,
    )
    if (ended.kind !== 'ended') throw new Error('ended expected')
    const record = {
      ...s.access,
      execution: s.execution,
      operation: operation('observe-second'),
      terminal: ended.receipt.evidence,
      passage: second.id,
      implementation: second.implementation,
      observed: evidence('second-observed'),
    }
    const receipt = ok(await s.view.journal.recordTerminalObservation(record))
    expect(ok(await s.fresh().journal.recordTerminalObservation(record))).toEqual(receipt)
    const confirmed = ok(await s.fresh().journal.load({ ...s.access, execution: s.execution }))
    expect(confirmed.terminalObservations.map(item => [item.passage, item.observed])).toEqual([
      [passage.id, null],
      [second.id, record.observed],
    ])
  } finally {
    await s.close()
  }
})
