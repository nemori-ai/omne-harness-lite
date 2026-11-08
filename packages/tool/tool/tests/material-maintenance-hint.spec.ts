import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, evidence, ok, operationId, text } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

type Fixture = Awaited<ReturnType<typeof settlementFixture>>
const hintOf = async (f: Fixture) =>
  (await f.records()).find(row => row.kind === 'material-maintenance-hint')

async function drain(f: Fixture) {
  for (let i = 0; i < 16; i += 1)
    if (ok(await f.ledger.maintenance.reclaim(f.access)).kind === 'idle') return
  throw new Error('reclaim did not finish')
}

it('commits ready, deadline and idle hints with the corresponding material transitions', async () => {
  let now = 0
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 64, maxRetentionMs: 10 },
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
    }),
    value: {
      content: [text('body', 'long body '.repeat(12))],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const hint = async () => (await f.records()).find(row => row.kind === 'material-maintenance-hint')
  expect(await hint()).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'ready' } })
  const settlement = f.commits.find(commit =>
    commit.writes.some(
      write =>
        write.kind === 'put' &&
        write.record.kind === 'material-use' &&
        write.record.use.kind === 'offloaded-body',
    ),
  )
  expect(settlement?.writes).toContainEqual({
    kind: 'put',
    record: { kind: 'material-maintenance-hint', hint: { kind: 'ready' } },
  })
  await drain(f)
  expect(await hint()).toEqual({
    kind: 'material-maintenance-hint',
    hint: { kind: 'due', at: '1970-01-01T00:00:00.010Z' },
  })
  now = 10
  ok(await f.ledger.maintenance.expire(f.access))
  expect(await hint()).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'ready' } })
  await drain(f)
  expect(await hint()).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'none' } })
})

it.each(['none', 'unknown-applied', 'unknown-dropped', 'conflict'] as const)(
  'backfills an untimed legacy call through the call CAS after %s',
  async fault => {
    const f = await settlementFixture()
    f.interceptCommit(input =>
      f.harness.memory.commit({
        ...input,
        writes: [
          ...input.writes.filter(
            write => write.kind !== 'put' || write.record.kind !== 'material-maintenance-hint',
          ),
          { kind: 'delete', key: 'material-maintenance-hint' },
        ],
      }),
    )
    ok(await f.preserve())
    await drain(f)
    expect(await hintOf(f)).toBeUndefined()
    f.interceptCommit(null)
    if (fault !== 'none') f.harness.memory.injectCommit(fault)
    const first = await f.ledger.maintenance.expire(f.access)
    if (fault.startsWith('unknown')) {
      expect(first).toHaveProperty('failure.kind', 'unavailable')
      expect(await hintOf(f)).toEqual(
        fault === 'unknown-applied'
          ? { kind: 'material-maintenance-hint', hint: { kind: 'none' } }
          : undefined,
      )
    } else ok(first)
    ok(await f.ledger.maintenance.expire(f.access))
    expect(await hintOf(f)).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'none' } })
    const commits = f.commits.length
    ok(await f.ledger.maintenance.expire(f.access))
    expect(f.commits).toHaveLength(commits)
  },
)

it('schedules reclamation when delivery ends while retaining a native reference', async () => {
  const f = await settlementFixture({
    value: raw => ({
      content: [text('answer', 'done')],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [raw.content],
    }),
  })
  const state = ok(await f.preserve())
  if (state.phase !== 'settled' || state.delivery === null) throw new Error('missing delivery')
  await drain(f)
  expect(await hintOf(f)).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'none' } })
  ok(
    await f.ledger.commands.releaseDelivery({
      ...f.access,
      operation: operationId('release-hint-delivery'),
      result: state.result,
      delivery: state.delivery.delivery,
      consumer: state.delivery.consumer,
      evidence: {
        kind: 'processed',
        completion: evidence('consumed', state.delivery.consumer.owner),
      },
    }),
  )
  expect(await hintOf(f)).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'ready' } })
  await drain(f)
  expect(await hintOf(f)).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'none' } })
  expect((await f.records()).filter(row => row.kind === 'material-use')).toEqual([
    expect.objectContaining({ use: expect.objectContaining({ kind: 'native-reference' }) }),
  ])
})

it('backfills a fixed deadline even when the sampled time has already been committed', async () => {
  const f = await settlementFixture({
    offloading: { ...configuration().offloading, maxInlineUtf8Bytes: 64, maxRetentionMs: 10 },
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant('1970-01-01T00:00:00.000Z'))),
    }),
    value: {
      content: [text('body', 'long body '.repeat(12))],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [],
    },
  })
  f.interceptCommit(input =>
    f.harness.memory.commit({
      ...input,
      writes: [
        ...input.writes.filter(
          write => write.kind !== 'put' || write.record.kind !== 'material-maintenance-hint',
        ),
        { kind: 'delete', key: 'material-maintenance-hint' },
      ],
    }),
  )
  ok(await f.preserve())
  await drain(f)
  expect(await hintOf(f)).toBeUndefined()
  expect(await f.records()).toContainEqual({
    kind: 'material-time',
    time: { highWatermark: '1970-01-01T00:00:00.000Z' },
  })
  f.interceptCommit(null)
  ok(await f.ledger.maintenance.expire(f.access))
  expect(await hintOf(f)).toEqual({
    kind: 'material-maintenance-hint',
    hint: { kind: 'due', at: '1970-01-01T00:00:00.010Z' },
  })
})

it('keeps a live page deadline after body expiry and becomes ready when the page finishes', async () => {
  let now = 0
  let hold = false
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const f = await settlementFixture({
    offloading: {
      ...configuration().offloading,
      maxInlineUtf8Bytes: 64,
      maxRetentionMs: 10,
      maxPageLeaseMs: 20,
    },
    wrapMaterialClock: () => ({
      sample: async () => succeed(ok(decodeToolMaterialInstant(new Date(now).toISOString()))),
    }),
    wrapMaterials: store => ({
      ...store,
      read: async input => {
        if (hold) {
          entered.resolve()
          await resume.promise
        }
        return store.read(input)
      },
    }),
    value: {
      content: [text('body', 'long body '.repeat(12))],
      original: { kind: 'none' },
      data: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const result = await f.resultPage()
  if (result.value.original.kind !== 'offloaded') throw new Error('missing body')
  await drain(f)
  hold = true
  const page = f.ledger.reads.body.read({
    ...f.access,
    result: result.result,
    bodyId: result.value.original.bodyId,
    after: null,
    maxBytes: 8,
  })
  await entered.promise
  try {
    now = 10
    ok(await f.ledger.maintenance.expire(f.access))
    expect(await hintOf(f)).toEqual({
      kind: 'material-maintenance-hint',
      hint: { kind: 'due', at: '1970-01-01T00:00:00.020Z' },
    })
  } finally {
    resume.resolve()
  }
  ok(await page)
  expect(await hintOf(f)).toEqual({ kind: 'material-maintenance-hint', hint: { kind: 'ready' } })
})
