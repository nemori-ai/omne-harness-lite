// The lifetime of the durable state of one call, at the ledger's public seams
// (`commands.releaseDelivery`, `reads.operation`, `sweep`), each case one action of the
// CallLifecycle model: Ack schedules the removal of the call domain at `now + G`, or at the expiry
// of its offloaded body when that is later; Sweep deletes the bytes of the bodies and then drops
// the domain; a domain that is not released, or that still has a pending task, is not dropped.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { instantAt } from '@omne-harness/tool-contract/testing'
import { createToolSweep } from '@omne-harness/tool'
import { recordKey } from '../src/ledger-store.ts'
import { sealedText, settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, evidence, ok, operationId, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const G = configuration().offloading.orphanGraceMs
const CALL_DUE = 'call'

type Fixture = Awaited<ReturnType<typeof settlementFixture>>
const msOf = (instant: string) => Date.parse(instant) - Date.parse(instantAt(0))

/** The due entries of the tenant at the end of time, as `key@instant`. */
async function due(f: Fixture) {
  const read = await f.harness.memory.due(f.access.tenant, instantAt(10 ** 9), 20)
  if (read.kind !== 'complete') throw new Error('due index unreadable')
  return read.entries.map(entry => `${entry.key}@${String(msOf(entry.dueAt))}`)
}

/** The acknowledgement of the consumer: the release of the owed delivery of the result. */
async function acknowledge(f: Fixture, operation = 'ack') {
  const recovery = await f.load()
  if (recovery.result === null) throw new Error('fixture has no result')
  const owed = recovery.state.delivery
  if (owed?.kind !== 'pending') throw new Error(`the delivery is ${String(owed?.kind)}`)
  return f.ledger.commands.releaseDelivery({
    ...f.access,
    operation: operationId(operation),
    result: recovery.result.version,
    delivery: owed.delivery,
    consumer: owed.consumer,
    evidence: { kind: 'retained', custody: evidence('kept', owed.consumer.owner) },
  })
}

const offloaded = () =>
  settlementFixture({
    value: async (ledger, access) => {
      const sealed = await sealedText(ledger, access, 'the linked body')
      return {
        content: [text('content', 'Answer: 42')],
        data: { kind: 'none' },
        attachments: [],
        original: { kind: 'offloaded', source: sealed.source, summary: [text('summary', 'brief')] },
      }
    },
  })

it('Ack: the release of an inline result schedules the call domain at now + G', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  expect(await due(f)).toEqual([])
  const now = msOf(f.bodies.clock.now())
  expect(ok(await acknowledge(f)).kind).toBe('released')
  expect(await due(f)).toEqual([`${CALL_DUE}@${String(now + G)}`])
})

it('Ack: with an offloaded body the call domain is due at the expiry of the body when that is later', async () => {
  const f = await offloaded()
  ok(await f.preserve())
  const page = await f.resultPage()
  if (page.value.original.kind !== 'offloaded') throw new Error('expected an offloaded result')
  const expiry = msOf(page.value.original.retention.expiresAt)
  expect(expiry).toBeGreaterThan(msOf(f.bodies.clock.now()) + G)
  ok(await acknowledge(f))
  expect(await due(f)).toContain(`${CALL_DUE}@${String(expiry)}`)
})

type HostAnswer = 'removed' | 'held'

/**
 * Ends the tasks the settled call still holds. In an assembly the driver does this work (the
 * acknowledgement of the facts to the executor); the fixture has no driver.
 */
async function quiesce(f: Fixture) {
  const domain = { kind: 'call' as const, tenant: f.access.tenant, call: f.access.call }
  const read = await f.harness.memory.read(domain)
  if (read.kind !== 'complete') throw new Error('fixture store unreadable')
  const tasks = read.records.flatMap(record => (record.kind === 'task' ? [record] : []))
  await f.harness.memory.commit({
    domain,
    expected: read.revision,
    revision: `${String(Number(read.revision) + 1)}` as never,
    writes: tasks.map(record => ({ kind: 'delete' as const, key: recordKey(record) })),
  })
}

/** The sweep of the application over the fixture's store, with the host's answers in order. */
function sweeper(f: Fixture, host: HostAnswer[] = []) {
  const asked: string[] = []
  const sweep = createToolSweep(f.harness.memory, f.bodies, 4, {
    graceMs: G,
    hostRecords: (_tenant, call) => {
      asked.push(call)
      return Promise.resolve({ ok: host.shift() ?? 'removed' })
    },
  })
  return { asked, run: (ms: number) => sweep.sweep(f.access.tenant, instantAt(ms), 10).then(ok) }
}

it('Sweep: nothing before the instant; at the instant the domain is dropped with its due entry, after the host let its records go', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  const now = msOf(f.bodies.clock.now())
  ok(await acknowledge(f))
  await quiesce(f)
  const s = sweeper(f)
  expect(await s.run(now + G - 1)).toEqual({ reclaimed: 0, removed: 0 })
  expect((await f.records()).length).toBeGreaterThan(0)
  expect(await s.run(now + G)).toEqual({ reclaimed: 0, removed: 1 })
  expect(s.asked).toEqual([f.access.call])
  expect(await f.records()).toEqual([])
  expect(await due(f)).toEqual([])
  const read = await f.harness.memory.read({
    kind: 'call',
    tenant: f.access.tenant,
    call: f.access.call,
  })
  expect(read).toMatchObject({ kind: 'complete', revision: '0' })
  expect(await s.run(now + G)).toEqual({ reclaimed: 0, removed: 0 })
})

it('Sweep: the bytes of an offloaded body leave the body store before the domain is dropped', async () => {
  const f = await offloaded()
  ok(await f.preserve())
  const page = await f.resultPage()
  if (page.value.original.kind !== 'offloaded') throw new Error('expected an offloaded result')
  const ref = { tenant: f.access.tenant, call: f.access.call, body: page.value.original.bodyId }
  ok(await acknowledge(f))
  await quiesce(f)
  const expiry = msOf(page.value.original.retention.expiresAt)
  const s = sweeper(f)
  expect((await f.bodies.store.read(ref, { first: 0, count: 1 })).kind).toBe('found')
  await s.run(expiry - 1)
  expect((await f.bodies.store.read(ref, { first: 0, count: 1 })).kind).toBe('found')
  const swept = await s.run(expiry)
  expect(swept.removed).toBe(1)
  expect((await f.bodies.store.read(ref, { first: 0, count: 1 })).kind).toBe('absent')
  expect(await f.records()).toEqual([])
  expect(await due(f)).toEqual([])
})

it('Postpone: while the host holds records of the call the domain stays and is due again at now + G', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  const now = msOf(f.bodies.clock.now())
  ok(await acknowledge(f))
  await quiesce(f)
  const s = sweeper(f, ['held'])
  expect(await s.run(now + G)).toEqual({ reclaimed: 0, removed: 0 })
  expect((await f.records()).length).toBeGreaterThan(0)
  expect(await due(f)).toEqual([`${CALL_DUE}@${String(now + 2 * G)}`])
  expect(await s.run(now + 2 * G)).toEqual({ reclaimed: 0, removed: 1 })
  expect(await f.records()).toEqual([])
})

it('Sweep: a blocked clock task is a note about the timing, not a duty, and does not keep the domain', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  const now = msOf(f.bodies.clock.now())
  ok(await acknowledge(f))
  await quiesce(f)
  const domain = { kind: 'call' as const, tenant: f.access.tenant, call: f.access.call }
  const read = await f.harness.memory.read(domain)
  if (read.kind !== 'complete') throw new Error('fixture store unreadable')
  const call = read.records.find(record => record.kind === 'call')
  if (call?.kind !== 'call') throw new Error('fixture call missing')
  await f.harness.memory.commit({
    domain,
    expected: read.revision,
    revision: `${String(Number(read.revision) + 1)}` as never,
    writes: [
      {
        kind: 'put',
        record: {
          kind: 'task',
          task: {
            kind: 'clock',
            operation: call.call.admission,
            state: 'blocked',
            diagnostic: 'execution-end-clock-marker-unavailable',
            basis: call.call.state.source,
          },
        },
      },
    ],
  })
  expect(await sweeper(f).run(now + G)).toEqual({ reclaimed: 0, removed: 1 })
  expect(await f.records()).toEqual([])
})

it('Postpone: a domain with a pending task is not dropped, and the host is not asked', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  const now = msOf(f.bodies.clock.now())
  ok(await acknowledge(f))
  expect((await f.records()).some(record => record.kind === 'task')).toBe(true)
  const s = sweeper(f)
  expect(await s.run(now + G)).toEqual({ reclaimed: 0, removed: 0 })
  expect(s.asked).toEqual([])
  expect((await f.records()).length).toBeGreaterThan(0)
  expect(await due(f)).toEqual([`${CALL_DUE}@${String(now + 2 * G)}`])
})

it('LateOperation: a query in a domain without the call writes an exclusion that is due at now + G, and the sweep drops it', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  const now = msOf(f.bodies.clock.now())
  ok(await acknowledge(f))
  await quiesce(f)
  const s = sweeper(f)
  expect((await s.run(now + G)).removed).toBe(1)
  const answer = await f.ledger.reads.operation({ ...f.access, operation: operationId('late') })
  expect(answer).toEqual({ ok: { kind: 'not-committed' } })
  expect((await f.records()).map(record => record.kind)).toEqual(['exclusion'])
  expect(await due(f)).toEqual([`${CALL_DUE}@${String(now + G)}`])
  expect(s.asked).toHaveLength(1)
  expect((await s.run(now + G)).removed).toBe(1)
  expect(s.asked).toHaveLength(1)
  expect(await f.records()).toEqual([])
  expect(await due(f)).toEqual([])
})

it('LateOperation: a negative answer in a domain that holds the call schedules nothing', async () => {
  const f = await settlementFixture()
  ok(await f.preserve())
  await f.ledger.reads.operation({ ...f.access, operation: operationId('unknown') })
  expect((await f.records()).some(record => record.kind === 'exclusion')).toBe(true)
  expect(await due(f)).toEqual([])
})
