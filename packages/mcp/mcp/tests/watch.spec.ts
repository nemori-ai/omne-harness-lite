import { describe, expect, it } from 'vitest'
import type { CorrelationKey, TaskRef, TaskWatch } from '@omne-harness/mcp-contract'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  generationOf,
  jsonOf,
  taskIdOf,
  type MemoryTaskRecords,
  type PeerReply,
  type TaskScript,
} from '@omne-harness/mcp-contract/testing'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { assemble } from '../src/internal/assembly.ts'
import type { TaskTimer } from '../src/watch.ts'
import { settled } from './doubles/deferred.ts'
import { alice, bob, type Principal } from './doubles/identities.ts'
import { listing, peer, taskHandle, taskStatus, text, type Peer } from './doubles/peer.ts'
import { adoptHttp } from './doubles/world.ts'

const files = endpointRefOf('files')
const task: TaskRef = { ref: files, taskId: taskIdOf('t1'), issuedAt: generationOf(1) }
const FLOOR = 100
const CAP = 1000
const NOW = new Date('2026-11-05T12:00:00Z').getTime()

function manualTimer() {
  const waits: { ms: number; go: () => void }[] = []
  const timer: TaskTimer = (ms, signal) =>
    new Promise(resolve => {
      waits.push({ ms, go: () => resolve() })
      signal.addEventListener('abort', () => resolve())
    })
  return {
    timer,
    waiting: () => waits.map(wait => wait.ms),
    async tick() {
      waits.shift()?.go()
      for (let round = 0; round < 6; round += 1) await settled()
    },
  }
}

type Shape = Readonly<{ t2?: TaskScript; answer?: PeerReply; cut?: boolean }>

async function watched(t1: TaskScript, hints: Record<string, number> = {}, shape: Shape = {}) {
  const first = shape.answer ?? taskHandle('t1', hints)
  const p: Peer = peer({
    listing: { '': listing([{ name: 'read' }]) },
    calls: { read: shape.t2 === undefined ? first : [first, taskHandle('t2')] },
    tasks: shape.t2 === undefined ? { t1 } : { t1, t2: shape.t2 },
  })
  const records = p.ports.tasks as MemoryTaskRecords
  if (shape.cut === true) records.cut()
  adoptHttp(p, files, { auth: 'none' })
  const clock = manualTimer()
  const { services } = assemble(
    p.ports,
    { ...p.config, taskWatch: { pollFloorMs: FLOOR, backoffCapMs: CAP } },
    undefined,
    undefined,
    clock.timer,
  )
  await services.discovery.refresh(alice, { ref: files })
  const current = await services.discovery.current(alice, files)
  if (!('ok' in current) || current.ok.kind !== 'acquired') throw new Error('not acquired')
  const digest = current.ok.actions[0]?.definitionDigest
  if (digest === undefined) throw new Error('no digest')
  const invoke = (call: string) =>
    services.invoker.invoke(alice, {
      ref: files,
      action: actionNameOf('read'),
      args: jsonOf({}),
      expectedDefinition: digest,
      correlationKey: correlationKeyOf(call),
      signal: new AbortController().signal,
    })
  const answered = await invoke('call-1')
  const watch = services.tasks as TaskWatch<Principal>
  const told: [TenantId, CorrelationKey][] = []
  watch.subscribe((tenant, call) => told.push([tenant, call]))
  const row = async () => {
    const listed = await p.ports.tasks.following(alice.tenant)
    const kept = 'ok' in listed ? listed.ok[0]?.key : undefined
    return kept
  }
  const key = shape.answer === undefined && shape.cut !== true ? await row() : undefined
  if (key === undefined && shape.answer === undefined && shape.cut !== true)
    throw new Error('the task row was not kept before the answer')
  return {
    answered,
    invoke,
    records,
    p,
    clock,
    watch,
    told,
    services,
    read: async () => (key === undefined ? undefined : p.ports.tasks.read(key)),
    key,
    gets: () => p.requests('tasks/get').length,
    cancels: () => p.requests('tasks/cancel').length,
  }
}

const MEMBERS: Record<string, Parameters<typeof taskStatus>[2]> = {
  completed: { result: { content: [text('ok')] } },
  failed: { error: { code: -32000, message: 'the report broke' } },
  cancelled: {},
}

const status = (value: string, members: Parameters<typeof taskStatus>[2] = {}): PeerReply =>
  taskStatus('t1', value, members)

describe('the task watcher follows a task row (C111, MC-28)', () => {
  it('keeps the row before the call is answered, following in round one, with the call and the hints of the peer', async () => {
    const w = await watched({ get: status('working') }, { pollIntervalMs: 250, ttlMs: 60_000 })
    expect(await w.read()).toStrictEqual({
      ok: {
        account: { kind: 'anonymous' },
        issuedAt: 1,
        call: 'call-1',
        state: 'following',
        round: 1,
        pollIntervalMs: 250,
        expiresAt: NOW + 60_000,
      },
    })
  })

  it('a working task is looked at again after the interval of the peer, never sooner than the floor', async () => {
    const w = await watched(
      { get: [status('working', { pollIntervalMs: 20 })] },
      { pollIntervalMs: 250 },
    )
    expect(await w.watch.follow(alice, task)).toEqual({ ok: { state: 'following', round: 1 } })
    expect(w.clock.waiting()).toEqual([250])
    await w.clock.tick()
    expect(w.gets()).toBe(1)
    expect(w.clock.waiting()).toEqual([FLOOR])
    expect(await w.read()).toMatchObject({ ok: { state: 'following' } })
    expect(w.told).toEqual([])
  })

  it.each([
    ['completed', { kind: 'terminal', status: 'completed' }],
    ['failed', { kind: 'terminal', status: 'failed' }],
    ['cancelled', { kind: 'terminal', status: 'cancelled' }],
  ] as const)(
    'a %s task arrives: the row says so and the call is told once',
    async (value, arrival) => {
      const w = await watched({
        get: status(value, MEMBERS[value]),
      })
      await w.watch.follow(alice, task)
      await w.clock.tick()
      expect(await w.read()).toMatchObject({ ok: { state: 'arrived', round: 1, arrival } })
      expect(w.told).toEqual([[alice.tenant, 'call-1']])
      expect(w.clock.waiting()).toEqual([])
    },
  )

  it('a task that asks for input awaits a person: the row keeps what the peer asks', async () => {
    const asks = { when: { method: 'elicitation/create', params: { message: 'Which day?' } } }
    const w = await watched({ get: status('input_required', { inputRequests: asks }) })
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(await w.read()).toMatchObject({
      ok: {
        state: 'awaiting',
        arrival: { kind: 'input', inputRequests: { untrusted: jsonOf(asks) } },
      },
    })
    expect(w.told).toHaveLength(1)
  })

  it('an answer about the task that cannot be read ends it as not known', async () => {
    const w = await watched({ get: status('failed') })
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(await w.read()).toMatchObject({ ok: { state: 'arrived', arrival: { kind: 'unknown' } } })
  })

  it('a task the peer says is expired, or that its own error ends, arrives as expired or not known', async () => {
    const gone = await watched({
      get: { kind: 'error', error: { code: -32602, message: 'Unknown task' } },
    })
    await gone.watch.follow(alice, task)
    await gone.clock.tick()
    expect(await gone.read()).toMatchObject({
      ok: { state: 'arrived', arrival: { kind: 'expired' } },
    })
    const broken = await watched({
      get: { kind: 'error', error: { code: -32603, message: 'boom' } },
    })
    await broken.watch.follow(alice, task)
    await broken.clock.tick()
    expect(await broken.read()).toMatchObject({
      ok: { state: 'arrived', arrival: { kind: 'unknown' } },
    })
  })

  it('a look without an answer changes nothing and backs off, doubling up to the cap; a working answer starts over', async () => {
    const w = await watched({
      get: [
        { kind: 'unsent' },
        { kind: 'unsent' },
        { kind: 'unsent' },
        { kind: 'unsent' },
        status('working'),
      ],
    })
    await w.watch.follow(alice, task)
    const seen: number[] = []
    for (let look = 0; look < 5; look += 1) {
      seen.push(...w.clock.waiting())
      await w.clock.tick()
    }
    seen.push(...w.clock.waiting())
    expect(seen).toEqual([FLOOR, 200, 400, 800, CAP, FLOOR])
    expect(await w.read()).toMatchObject({ ok: { state: 'following', round: 1 } })
    expect(w.told).toEqual([])
  })

  it('a task past its expiry arrives as expired without asking the peer', async () => {
    const w = await watched({ get: status('working') }, { ttlMs: 0 })
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(w.gets()).toBe(0)
    expect(await w.read()).toMatchObject({ ok: { state: 'arrived', arrival: { kind: 'expired' } } })
  })

  it('following twice keeps one watcher: each wait looks once', async () => {
    const w = await watched({ get: status('working') })
    await w.watch.follow(alice, task)
    await w.watch.follow(alice, task)
    expect(w.clock.waiting()).toEqual([FLOOR])
  })

  it('another principal follows nothing: the task is not known to it', async () => {
    const w = await watched({ get: status('working') })
    expect(await w.watch.follow(bob, task)).toEqual({ failure: { kind: 'unknown' } })
    expect(await w.watch.follow(alice, { ...task, issuedAt: generationOf(2) })).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(w.clock.waiting()).toEqual([])
  })

  it('lists the calls whose tasks a tenant follows', async () => {
    const w = await watched({ get: status('working') })
    expect(await w.watch.following(alice.tenant)).toEqual({ ok: ['call-1'] })
  })
})

describe('dropping the task of a call that no longer waits (C111)', () => {
  it('a cancelled call drops a followed task and asks the peer to cancel it once; the watcher stops', async () => {
    const w = await watched({ get: status('working'), cancel: { kind: 'result', result: {} } })
    await w.watch.follow(alice, task)
    expect(await w.watch.drop(alice, task, true)).toEqual({ ok: 'dropped' })
    expect(await w.watch.drop(alice, task, true)).toEqual({ ok: 'already' })
    expect(w.cancels()).toBe(1)
    expect(await w.read()).toMatchObject({ ok: { state: 'dropped' } })
    await w.clock.tick()
    expect(w.gets()).toBe(0)
  })

  it('a task awaiting input is dropped and asked to cancel too; an arrived one is left as it is', async () => {
    const asks = status('input_required', { inputRequests: {} })
    const w = await watched({ get: asks, cancel: { kind: 'result', result: {} } })
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(await w.watch.drop(alice, task, true)).toEqual({ ok: 'dropped' })
    expect(w.cancels()).toBe(1)
    const done = await watched({ get: status('completed', { result: { content: [] } }) })
    await done.watch.follow(alice, task)
    await done.clock.tick()
    expect(await done.watch.drop(alice, task, true)).toEqual({ ok: 'already' })
    expect(done.cancels()).toBe(0)
  })

  it('a call that ended otherwise drops its task without asking the peer to cancel', async () => {
    const w = await watched({ get: status('working') })
    expect(await w.watch.drop(alice, task, false)).toEqual({ ok: 'dropped' })
    expect(w.cancels()).toBe(0)
  })

  it('closing the watcher stops every look', async () => {
    const w = await watched({ get: status('working') })
    await w.watch.follow(alice, task)
    await w.services.connections.closeAll()
    await w.clock.tick()
    expect(w.gets()).toBe(0)
    expect(await w.watch.follow(alice, task)).toMatchObject({ ok: { state: 'following' } })
    expect(w.clock.waiting()).toEqual([])
  })
})

describe('what the watcher keeps and tells, read strictly (C111)', () => {
  const t2 = { ...task, taskId: taskIdOf('t2') }

  it('a call the peer answers at once keeps no task row', async () => {
    const w = await watched(
      {},
      {},
      { answer: { kind: 'result', result: { content: [text('now')] } } },
    )
    expect(w.answered).toMatchObject({ outcome: { kind: 'complete' } })
    expect(w.records.rows()).toEqual([])
  })

  it('a task whose row cannot be kept is asked to cancel once, and the call is not known', async () => {
    const w = await watched({ cancel: { kind: 'result', result: {} } }, {}, { cut: true })
    expect(w.answered).toEqual({ kind: 'sent', outcome: { kind: 'unknown', cause: 'abandoned' } })
    for (let round = 0; round < 6; round += 1) await settled()
    expect(w.cancels()).toBe(1)
  })

  it('a row without hints keeps none, and its view carries the arrival once it arrived', async () => {
    const w = await watched({ get: status('completed', MEMBERS['completed']) })
    expect(await w.read()).toStrictEqual({
      ok: {
        account: { kind: 'anonymous' },
        issuedAt: 1,
        call: 'call-1',
        state: 'following',
        round: 1,
      },
    })
    expect(await w.watch.follow(alice, task)).toStrictEqual({
      ok: { state: 'following', round: 1 },
    })
    await w.clock.tick()
    expect(await w.watch.follow(alice, task)).toStrictEqual({
      ok: { state: 'arrived', round: 1, arrival: { kind: 'terminal', status: 'completed' } },
    })
  })

  it('two tasks are followed by a watcher each', async () => {
    const w = await watched({ get: status('working') }, {}, { t2: { get: status('working') } })
    await w.invoke('call-2')
    await w.watch.follow(alice, task)
    await w.watch.follow(alice, t2)
    expect(w.clock.waiting()).toEqual([FLOOR, FLOOR])
  })

  it('a working report without an interval keeps the interval it had; a later arrival is still told', async () => {
    const w = await watched(
      {
        get: [
          status('working'),
          status('working', { pollIntervalMs: 300 }),
          status('completed', MEMBERS['completed']),
        ],
      },
      { pollIntervalMs: 250 },
    )
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(w.clock.waiting()).toEqual([250])
    await w.clock.tick()
    expect(w.clock.waiting()).toEqual([300])
    await w.clock.tick()
    expect(w.told).toEqual([[alice.tenant, 'call-1']])
  })

  it('a row the store cannot move is looked at again after a backoff, and arrives once the store is back', async () => {
    const w = await watched({ get: status('completed', MEMBERS['completed']) })
    await w.watch.follow(alice, task)
    const move = w.records.move
    Object.assign(w.records, { move: async () => fail('unavailable' as const) })
    await w.clock.tick()
    expect(w.told).toEqual([])
    expect(w.clock.waiting()).toEqual([2 * FLOOR])
    Object.assign(w.records, { move })
    await w.clock.tick()
    expect(w.told).toEqual([[alice.tenant, 'call-1']])
  })

  it('a drop the store cannot write is not known and cancels nothing; one another writer beat is already done', async () => {
    const w = await watched({ get: status('working'), cancel: { kind: 'result', result: {} } })
    const move = w.records.move
    Object.assign(w.records, { move: async () => fail('unavailable' as const) })
    expect(await w.watch.drop(alice, task, true)).toEqual({ failure: { kind: 'unknown' } })
    Object.assign(w.records, { move: async () => succeed('stale' as const) })
    expect(await w.watch.drop(alice, task, true)).toEqual({ ok: 'already' })
    Object.assign(w.records, { move })
    expect(w.cancels()).toBe(0)
  })

  it('a task followed again after its input went back gets a watcher again; an arrived one gets none', async () => {
    const asks = status('input_required', { inputRequests: {} })
    const w = await watched({
      get: [asks, status('working')],
      update: { kind: 'result', result: {} },
    })
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(await w.services.invoker.provideTaskInput(alice, task, jsonOf({}))).toEqual({
      ok: 'accepted',
    })
    expect(await w.watch.follow(alice, task)).toStrictEqual({
      ok: { state: 'following', round: 2 },
    })
    expect(w.clock.waiting()).toEqual([FLOOR])
    const done = await watched({ get: status('completed', MEMBERS['completed']) })
    await done.watch.follow(alice, task)
    await done.clock.tick()
    await done.watch.follow(alice, task)
    expect(done.clock.waiting()).toEqual([])
  })

  it('a row moved on elsewhere meanwhile is not told about, and the watcher stops', async () => {
    const w = await watched({ get: status('completed', MEMBERS['completed']) })
    await w.watch.follow(alice, task)
    if (w.key === undefined) throw new Error('no row')
    await w.records.move(w.key, { state: 'following', round: 1 }, { state: 'dropped', round: 1 })
    await w.clock.tick()
    expect(w.told).toEqual([])
    expect(w.clock.waiting()).toEqual([])
  })

  it('a store that cannot be read follows nothing and drops nothing', async () => {
    const w = await watched({ get: status('working') })
    w.records.cut()
    expect(await w.watch.follow(alice, task)).toEqual({ failure: { kind: 'unknown' } })
    expect(await w.watch.drop(alice, task, true)).toEqual({ failure: { kind: 'unknown' } })
    expect(await w.watch.following(alice.tenant)).toEqual({ failure: 'unavailable' })
    expect(w.cancels()).toBe(0)
  })

  it('a task before its expiry is asked about', async () => {
    const w = await watched({ get: status('working') }, { ttlMs: 60_000 })
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(w.gets()).toBe(1)
  })

  it('a listener that left is told nothing', async () => {
    const w = await watched({ get: status('completed', MEMBERS['completed']) })
    const heard: string[] = []
    const off = w.watch.subscribe((_tenant, call) => heard.push(call))
    off()
    await w.watch.follow(alice, task)
    await w.clock.tick()
    expect(heard).toEqual([])
    expect(w.told).toHaveLength(1)
  })
})

describe('the task operations read the kept row (C111)', () => {
  it('a store that cannot be read makes every task operation not known, and sends nothing', async () => {
    const w = await watched({ get: status('working') })
    w.records.cut()
    expect(await w.services.invoker.queryTask(alice, task)).toEqual({
      failure: { kind: 'unknown' },
    })
    expect(w.gets()).toBe(0)
  })
})
