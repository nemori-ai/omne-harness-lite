// The stored form of the snapshot (SPEC W1, 快照的存储形态, R2-D292): a head row in `sl_state` and
// chunk rows in `sl_state_item`. The module cases check that the rows give back the snapshot that was
// written, over a seeded random sequence of appends, changes, removals and moves. The session cases
// run the real participant for 200 steps whose snapshot grows with every step, and check that the
// bytes one commit writes into the two tables do not grow with the steps (the defect: each commit
// rewrote the whole snapshot row).
import { describe, expect, it } from 'vitest'
import type { SessionLogCommitObservation, WorkSnapshot } from '@omne-harness/session-contract'
import type { SqlValue } from '@omne-harness/sql-contract/worker'
import {
  CHUNK_BYTES,
  MEMBER_BYTES,
  readMember,
  readState,
  storedOf,
  writeState,
  type StoredState,
} from '../src/worker/state-rows.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import {
  activeRun,
  agentEventOf,
  agentPublisher,
  eventOf,
  registrationOf,
  startRun,
  workOf,
} from './fixtures/real-provider.ts'
import { unpacked } from './fixtures/packed.ts'
import { migratedPort } from './fixtures/sqlite-storage.ts'

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

type Rows = ReturnType<typeof migratedPort>['port']

/** The rows of the session `s` of tenant `t`, as text: the head and each chunk by its key. */
function rowsOf(port: Rows): Map<string, string> {
  const out = new Map<string, string>()
  const head = port.execute("SELECT snapshot FROM sl_state WHERE tenant = 't' AND session = 's'")
  out.set('head', String(head.rows[0]?.[0]))
  for (const row of port.execute(
    "SELECT path, seq, value FROM sl_state_item WHERE tenant = 't' AND session = 's'",
  ).rows)
    out.set(`${String(row[0])}#${String(row[1])}`, unpacked(row[2]))
  return out
}

const asSnapshot = (value: object): WorkSnapshot => value as unknown as WorkSnapshot

/** A small deterministic generator, so a failing sequence is the same on every run. */
function generator(seed: number) {
  let state = seed >>> 0
  return (below: number): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % below
  }
}

describe('the stored form gives back the written snapshot', () => {
  it('absent and empty collections, nested collections and repeated primitives', () => {
    const { port } = migratedPort()
    const snapshot = asSnapshot({
      session: 's',
      revision: '1',
      pending: ['a', 'b', 'a'],
      handed: [],
      workEntryIndex: { calls: [{ id: 1 }], controls: [] },
      run: { kind: 'none' },
    })
    writeState(port, { tenant: 't', session: 's', covered: 1n }, null, snapshot)
    const read = readState(port, 't', 's', 1n)
    expect(read).not.toBe('behind')
    expect((read as StoredState).snapshot).toEqual(snapshot)
    expect('executions' in (read as StoredState).snapshot).toBe(false)
    expect(readState(port, 't', 's', 2n)).toBe('behind')
  })

  it('a seeded sequence of appends, changes, removals and moves', () => {
    const { port } = migratedPort()
    const next = generator(20261104)
    let items: { id: number; body: string }[] = []
    let strings: string[] = []
    let large: { note: string; list: number[] } = { note: '', list: [] }
    let id = 0
    let before: WorkSnapshot | null = null
    for (let step = 1; step <= 400; step += 1) {
      const kind = next(6)
      if (kind <= 1 || items.length === 0) {
        id += 1
        items = [...items, { id, body: 'x'.repeat(next(900)) }]
      } else if (kind === 2) {
        const at = next(items.length)
        items = items.map((item, index) =>
          index === at ? { ...item, body: `${item.body}y` } : item,
        )
      } else if (kind === 3) {
        const at = next(items.length)
        items = items.filter((_, index) => index !== at)
      } else if (kind === 4) {
        // A changed item that moves to the end, as a re-registered call does.
        const at = next(items.length)
        const moved = { ...(items[at] as { id: number; body: string }), body: 'moved' }
        items = [...items.filter((_, index) => index !== at), moved]
      } else {
        id += 1
        const at = next(items.length + 1)
        items = [...items.slice(0, at), { id, body: 'inserted' }, ...items.slice(at)]
      }
      if (next(4) === 0) strings = [...strings, `input-${String(next(5))}`]
      if (next(7) === 0) strings = strings.slice(1)
      // A large object member with a collection inside: a member row, rewritten when it changes.
      if (next(5) === 0) large = { ...large, note: 'n'.repeat(MEMBER_BYTES + next(300)) }
      if (next(3) === 0) large = { ...large, list: [...large.list, step] }
      const snapshot = asSnapshot({ session: 's', revision: String(step), items, large, strings })
      writeState(port, { tenant: 't', session: 's', covered: BigInt(step) }, before, snapshot)
      const read = readState(port, 't', 's', BigInt(step))
      expect(read === 'behind' ? read : read.snapshot, `step ${String(step)}`).toEqual(snapshot)
      // Every second step starts from the read snapshot, the others from the written one.
      before = step % 2 === 0 && read !== 'behind' ? read.snapshot : snapshot
    }
  })

  it('a snapshot that these rows did not give is written whole, and stale chunks go', () => {
    const { port } = migratedPort()
    const first = asSnapshot({ session: 's', revision: '1', items: [1, 2, 3], other: [4] })
    writeState(port, { tenant: 't', session: 's', covered: 1n }, null, first)
    // A copy has no stored layout: the module cannot tell what changed.
    const copy = asSnapshot({ ...first })
    expect(storedOf(copy)).toBeNull()
    const second = asSnapshot({ session: 's', revision: '2', items: [1, 2] })
    writeState(port, { tenant: 't', session: 's', covered: 2n }, copy, second)
    const read = readState(port, 't', 's', 2n)
    expect(read === 'behind' ? read : read.snapshot).toEqual(second)
    expect([...rowsOf(port).keys()].filter(key => key.startsWith('other'))).toEqual([])
  })

  it('an append writes the head and the last chunk, not the earlier chunks', () => {
    const { port } = migratedPort()
    let text = 0
    const counting = {
      execute: (sql: string, params: readonly SqlValue[] = []) => {
        if (!/^\s*SELECT/iu.test(sql))
          for (const value of params) if (typeof value === 'string') text += value.length
        return port.execute(sql, params)
      },
    }
    const body = 'z'.repeat(1000)
    let items: { id: number; body: string }[] = []
    let before: WorkSnapshot | null = null
    for (let step = 1; step <= 100; step += 1) {
      items = [...items, { id: step, body }]
      const snapshot = asSnapshot({ session: 's', revision: String(step), items })
      text = 0
      const stored = writeState(
        counting,
        { tenant: 't', session: 's', covered: BigInt(step) },
        before,
        snapshot,
      )
      // The keys of the rows are short; the bound is the head, one full chunk and the new item.
      expect(text, `step ${String(step)}`).toBeLessThanOrEqual(
        stored.layout.head.length + CHUNK_BYTES + 2 * body.length,
      )
      before = snapshot
    }
    expect(rowsOf(port).size).toBeGreaterThan(5)
  })
})

describe('a large object member is a row of its own', () => {
  it('the head stays small, and an unchanged member is not written again', () => {
    const { port } = migratedPort()
    let text = 0
    const counting = {
      execute: (sql: string, params: readonly SqlValue[] = []) => {
        if (!/^\s*SELECT/iu.test(sql))
          for (const value of params) if (typeof value === 'string') text += value.length
        return port.execute(sql, params)
      },
    }
    const initialization = { plan: 'p'.repeat(4 * MEMBER_BYTES), items: [1, 2] }
    const first = asSnapshot({ session: 's', revision: '1', initialization, run: { kind: 'none' } })
    const one = writeState(counting, { tenant: 't', session: 's', covered: 1n }, null, first)
    expect(one.layout.head.length).toBeLessThan(MEMBER_BYTES)
    // A copy of the member with the same text is not written again either.
    const second = asSnapshot({ ...first, revision: '2', initialization: { ...initialization } })
    text = 0
    const two = writeState(counting, { tenant: 't', session: 's', covered: 2n }, first, second)
    expect(text).toBeLessThan(MEMBER_BYTES)
    const read = readState(port, 't', 's', 2n)
    expect(read === 'behind' ? read : read.snapshot).toEqual(second)
    // One member alone, by its row, with its collections empty; a head member from the head.
    const head = two.layout.head
    expect(readMember(port, 't', 's', head, 'initialization')).toEqual({
      ...initialization,
      items: [],
    })
    expect(readMember(port, 't', 's', head, 'run')).toEqual({ kind: 'none' })
    // A member that shrinks under the bound goes back into the head and its row goes.
    const third = asSnapshot({
      ...second,
      revision: '3',
      initialization: { plan: 'small', items: [] },
    })
    writeState(port, { tenant: 't', session: 's', covered: 3n }, two.snapshot, third)
    const back = readState(port, 't', 's', 3n)
    expect(back === 'behind' ? back : back.snapshot).toEqual(third)
    expect([...rowsOf(port).keys()].filter(key => key.startsWith('='))).toEqual([])
  })
})

describe('a session of 200 steps: the bytes of one commit do not grow with the steps', () => {
  /** The text that the participant wrote into the snapshot rows since `from` writes. */
  const snapshotText = (a: App, from: number): number =>
    a.provider.participantWrites
      .slice(from)
      .filter(write => /\bsl_state(_item)?\b/u.test(write.sql))
      .reduce((sum, write) => sum + write.text, 0)

  /** The text of the snapshot rows that are stored now. */
  function storedText(a: App): number {
    const tenant = textOf(TENANT_A)
    const head = a.provider.select(
      'dom_0',
      'SELECT snapshot FROM sl_state WHERE tenant = ? AND session = ?',
      [tenant, 'session-1'],
    ).rows[0]?.[0]
    return a.provider
      .select('dom_0', 'SELECT value FROM sl_state_item WHERE tenant = ? AND session = ?', [
        tenant,
        'session-1',
      ])
      .rows.reduce((sum, row) => sum + unpacked(row[0]).length, String(head).length)
  }

  /**
   * Each step: an input is accepted, and an Agent event registers one more Model call. So the
   * snapshot gains a pending input, a consumption, a call registration and an entry reference.
   * Answers the largest snapshot text one commit of the step wrote, and the stored text after it.
   */
  async function steps(a: App, count: number) {
    const agent = agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => 'dom_0',
    })
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, 'session-1', 'input-0'))
    ok(await startRun(a, 'start-run-1'))
    const scene = activeRun(await workOf(a))
    if (a.port.commitLog === undefined) throw new Error('the SQL port offers no commitLog')
    const written: number[] = []
    const stored: number[] = []
    for (let step = 1; step <= count; step += 1) {
      let from = a.provider.participantWrites.length
      ok(await a.accept(TENANT_A, 'session-1', `input-${String(step)}`))
      let commit = snapshotText(a, from)
      from = a.provider.participantWrites.length
      const observation: SessionLogCommitObservation = eventOf(
        scene,
        step,
        [registrationOf(scene.attempt, step)],
        `log-${String(step)}`,
      )
      await agent.publish(agentEventOf(observation))
      ok(await a.port.commitLog({ observation }))
      commit = Math.max(commit, snapshotText(a, from))
      written.push(commit)
      stored.push(storedText(a))
    }
    return { written, stored, work: await workOf(a) }
  }

  it('200 steps: the largest commit of steps 181 to 200 is within a constant of steps 11 to 30', async () => {
    const a = await app()
    const { written, stored, work } = await steps(a, 200)
    // The snapshot grows: 201 pending inputs and 200 registered calls.
    expect(work.pending).toHaveLength(201)
    expect(work.consumptions).toHaveLength(200)
    const mean = (values: readonly number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length
    const early = Math.max(...written.slice(10, 30))
    const late = Math.max(...written.slice(180, 200))
    const earlyMean = mean(written.slice(10, 30))
    const lateMean = mean(written.slice(180, 200))
    // The measured values go to the log before the assertions.
    console.log(
      'snapshot text per commit',
      JSON.stringify({
        early,
        late,
        earlyMean,
        lateMean,
        stored20: stored[19],
        stored200: stored[199],
      }),
    )
    // What is stored grows with the steps; what one commit writes does not. The constant is the
    // rewrite of the partly filled last chunk of the collections that a step touches.
    expect(stored[199] as number).toBeGreaterThan(5 * (stored[19] as number))
    // The largest commit may rewrite one chunk; the mean stays within the text of one step.
    expect(late).toBeLessThanOrEqual(early + CHUNK_BYTES)
    expect(lateMean).toBeLessThanOrEqual(earlyMean + 2048)
  }, 120_000)
})
