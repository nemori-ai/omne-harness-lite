import { describe, expect, it, vi } from 'vitest'
import type { SessionInputScope, WorkSnapshot } from '@omne-harness/session-contract'
import type { JsonValue, SqlStorage } from '@omne-harness/sql-contract'
import { decodeValue, encodeValue } from '../src/codec.ts'
import { createSessionStorage } from '../src/index.ts'
import { app, textOf, TENANT_A, type App } from './fixtures/app.ts'
import { evidence } from '@omne-harness/session-contract/testing'
import { activeRun, agentPublisher, cancelRun, startRun, workOf } from './fixtures/real-provider.ts'

type Module = typeof import('../src/worker/history-index.ts')
type Port = Parameters<Module['workIndexOf']>[0]

const SESSION = 'session-1'
const DOMAIN = 'dom_0'

const ok = <T>(value: unknown): T => {
  expect(value, JSON.stringify(value)).toHaveProperty('ok')
  return (value as { ok: T }).ok
}

function counting(a: App) {
  const reads: { sql: string; rows: number }[] = []
  const port: Port = {
    execute: (sql, params) => {
      const result = a.provider.select(DOMAIN, sql, params as never) as never as ReturnType<
        Port['execute']
      >
      reads.push({ sql, rows: result.rows.length })
      return result
    },
  }
  return { port, reads }
}

// A worker that has just started: it kept nothing of this session yet.
async function coldWorker(): Promise<Module> {
  vi.resetModules()
  return import('../src/worker/history-index.ts')
}

async function sessionOf(runs: number): Promise<Readonly<{ a: App; work: WorkSnapshot }>> {
  const a = await app()
  ok(await a.create(TENANT_A))
  for (let run = 1; run <= runs; run += 1) {
    ok(await a.accept(TENANT_A, SESSION, `input-${String(run)}`))
    ok(await startRun(a, `start-run-${String(run)}`))
    ok(await cancelRun(a, activeRun(await workOf(a)).run, `cancel-${String(run)}`))
  }
  ok(await a.accept(TENANT_A, SESSION, 'input-pending'))
  ok(await startRun(a, 'start-run-last'))
  return { a, work: await workOf(a) }
}

describe('the work index of a session with a long history', () => {
  it.each([1, 2, 3, 5, 8, 1000])(
    'is read %i rows at a time: every read goes further and the last one answers what a whole read answers',
    async page => {
      const { a, work } = await sessionOf(6)
      const scope: SessionInputScope = { kind: 'pending', inputs: work.pending }
      const { port, reads: sqls } = counting(a)
      const whole = (await coldWorker()).readHistory(port, textOf(TENANT_A), SESSION, work, scope)
      if (whole === 'too-many') throw new Error('the whole read is over its bound')
      const indexed = sqls
        .filter(item => /kind IN \('intake\.routed'/u.test(item.sql))
        .reduce((rows, item) => rows + item.rows, 0)

      const worker = await coldWorker()
      let reads = 0
      let answer = worker.workIndexOf(port, textOf(TENANT_A), SESSION, work, page)
      while (answer === 'too-many') {
        reads += 1
        if (reads > 100) throw new Error('the paged read does not end')
        answer = worker.workIndexOf(port, textOf(TENANT_A), SESSION, work, page)
      }
      expect(answer.index.attempts).toEqual(whole.index.attempts)
      expect(answer.index.inputs.map(({ input, source }) => ({ input, source }))).toEqual(
        whole.index.inputs
          .filter(item => work.pending.includes(item.input))
          .map(({ input, source }) => ({ input, source })),
      )
      expect(reads).toBe(Math.ceil(indexed / page) - 1)
    },
  )

  it('reads the rows of the session once: a second read with nothing new reads none of them again', async () => {
    const { a, work } = await sessionOf(4)
    const { port, reads } = counting(a)
    const worker = await coldWorker()
    expect(worker.workIndexOf(port, textOf(TENANT_A), SESSION, work)).not.toBe('too-many')
    const indexed = () =>
      reads
        .filter(item => /kind IN \('intake\.routed'/u.test(item.sql))
        .reduce((n, i) => n + i.rows, 0)
    const first = indexed()
    expect(first).toBeGreaterThan(0)
    expect(worker.workIndexOf(port, textOf(TENANT_A), SESSION, work)).not.toBe('too-many')
    expect(indexed()).toBe(first)
  })

  it('reads of the Agent record only what the active execution admitted of the pending inputs', async () => {
    const { a, work } = await sessionOf(4)
    const { port, reads } = counting(a)
    const worker = await coldWorker()
    const answer = worker.workIndexOf(port, textOf(TENANT_A), SESSION, work)
    if (answer === 'too-many') throw new Error('the read is over its page')
    expect(answer.index.executions).toEqual([])
    expect(answer.index.batches).toEqual([])
    const agent = reads.filter(item => /FROM er_/u.test(item.sql))
    expect(
      agent.filter(item => !/FROM er_(admission(_attempt)?_idx|root)\s/u.test(item.sql)),
    ).toEqual([])
    expect(agent.reduce((rows, item) => rows + item.rows, 0)).toBeLessThanOrEqual(
      2 * work.pending.length + 2,
    )
  })

  it('carries what the active execution admitted of a pending input, as a whole read does', async () => {
    const { a, work } = await sessionOf(2)
    const run = activeRun(work)
    await agentPublisher({
      storage: a.provider.storage,
      combination: { combinationVersion: 'c1', manifestDigest: 'a'.repeat(64) },
      domainOf: () => DOMAIN,
    }).admit({
      tenant: TENANT_A,
      session: SESSION,
      execution: run.execution,
      input: 'input-pending',
      operation: 'aop-submit-pending',
      accepted: evidence('agent/accepted/pending'),
      grant: evidence('agent/receipt/pending'),
      attachment: 'attachment-1',
      attempt: run.attempt,
    })
    const { port } = counting(a)
    const scope: SessionInputScope = { kind: 'pending', inputs: work.pending }
    const whole = (await coldWorker()).readHistory(port, textOf(TENANT_A), SESSION, work, scope)
    const paged = (await coldWorker()).workIndexOf(port, textOf(TENANT_A), SESSION, work)
    if (whole === 'too-many' || paged === 'too-many') throw new Error('the read is over its bound')
    const admitted = (index: typeof paged.index) =>
      index.inputs.find(item => item.input === 'input-pending')
    expect(admitted(paged.index)).toMatchObject({ count: '1' })
    expect(admitted(paged.index)).toEqual(admitted(whole.index))
  })

  it('reads nothing of the Agent record for a session with no active Run', async () => {
    const a = await app()
    ok(await a.create(TENANT_A))
    ok(await a.accept(TENANT_A, SESSION, 'input-1'))
    const work = await workOf(a)
    const { port, reads } = counting(a)
    const answer = (await coldWorker()).workIndexOf(port, textOf(TENANT_A), SESSION, work)
    if (answer === 'too-many') throw new Error('the read is over its page')
    expect(answer.index.inputs).toMatchObject([{ input: 'input-1', count: '0', members: [] }])
    expect(reads.filter(item => /AND input = \?/u.test(item.sql))).toEqual([])
  })
})

describe('a work index that one read does not finish', () => {
  // The storage answers as a reader that still has rows of the session to go through.
  function unfinished(a: App, pages: number) {
    let asked = 0
    const storage: SqlStorage = {
      database: {},
      registerCombination: input => a.provider.storage.registerCombination(input),
      commit: request => a.provider.storage.commit(request),
      query: identity => a.provider.storage.query(identity),
      async read(request) {
        const answer = await a.provider.storage.read(request)
        if (answer.kind !== 'read') return answer
        const output = answer.output as Record<string, JsonValue>
        if (request.handler === 'session.work' && output['kind'] === 'state') {
          const { historyIndex: _index, ...snapshot } = decodeValue(
            output['snapshot'] as JsonValue,
          ) as WorkSnapshot
          return { ...answer, output: { ...output, snapshot: encodeValue(snapshot) } }
        }
        if (request.handler !== 'session.work-index' || output['kind'] !== 'index') return answer
        asked += 1
        return asked <= pages
          ? { ...answer, output: { kind: 'too-many', published: output['published'] ?? null } }
          : answer
      },
    }
    return {
      port: createSessionStorage<string>({ ...a.storageOptions, storage }),
      asked: () => asked,
    }
  }

  const whole = (a: App) =>
    a.provider.calls.filter(call => call.kind === 'read' && call.handler === 'session.work').length

  it('is read on until it is whole: the snapshot answered carries the index', async () => {
    const { a, work } = await sessionOf(2)
    const slow = unfinished(a, 3)
    const read = ok<WorkSnapshot>(await slow.port.readWork(a.access(TENANT_A)))
    expect(read.historyIndex).toEqual(work.historyIndex)
    expect(slow.asked()).toBe(4)
    // The whole snapshot is kept with its index: the next read asks the store for neither again.
    const from = whole(a)
    expect(ok<WorkSnapshot>(await slow.port.readWork(a.access(TENANT_A)))).toBe(read)
    expect([whole(a) - from, slow.asked()]).toEqual([0, 4])
  })

  it('a whole read that carries the index asks for no index', async () => {
    const { a, work } = await sessionOf(1)
    let asked = 0
    const storage: SqlStorage = {
      ...a.provider.storage,
      database: {},
      async read(request) {
        if (request.handler === 'session.work-index') asked += 1
        return a.provider.storage.read(request)
      },
    }
    const port = createSessionStorage<string>({ ...a.storageOptions, storage })
    expect(ok<WorkSnapshot>(await port.readWork(a.access(TENANT_A))).historyIndex).toEqual(
      work.historyIndex,
    )
    expect(asked).toBe(0)
  })

  it('answers unavailable while it is not whole, keeps nothing, and the next read goes on', async () => {
    const { a } = await sessionOf(2)
    const slow = unfinished(a, 100)
    const from = whole(a)
    expect(await slow.port.readWork(a.access(TENANT_A))).toMatchObject({
      failure: {
        kind: 'unavailable',
        diagnostic: 'read session.work: the index of the session rows is still being read',
      },
    })
    expect(slow.asked()).toBe(64)
    const again = unfinished(a, 0)
    ok(await again.port.readWork(a.access(TENANT_A)))
    expect(whole(a) - from).toBe(2)
  })
})
