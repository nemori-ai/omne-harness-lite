import { textPage } from './body-read-values.ts'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { decodeToolMaterialInstant } from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import { configuration, ok, text, principalA, principalB } from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

const instant = (ms: number) => ok(decodeToolMaterialInstant(new Date(ms).toISOString()))

async function fixture(options: Parameters<typeof settlementFixture>[0] = {}) {
  let now = 0
  const f = await settlementFixture({
    ...options,
    offloading: {
      ...configuration().offloading,
      maxInlineUtf8Bytes: 8192,
      maxRetentionMs: 10,
      maxPageLeaseMs: 20,
      ...options.offloading,
    },
    wrapMaterialClock: () => {
      const clock = { sample: async () => succeed(instant(now)) }
      return options.wrapMaterialClock?.(clock) ?? clock
    },
    value: options.value ?? {
      content: [text('body', '中🙂'.repeat(1200))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
  })
  ok(await f.preserve())
  const before = await f.resultPage()
  if (before.value.original.kind !== 'offloaded') throw new Error('expected offloaded body')
  return {
    f,
    before,
    advance: (time: number) => {
      now = time
    },
    body: {
      ...f.access,
      result: before.result,
      bodyId: before.value.original.bodyId,
      after: null,
      maxBytes: 8,
    },
  }
}

it('expires a body without a user read and preserves the result terminal and effect', async () => {
  const { f, before, body, advance } = await fixture()
  const read = vi.spyOn(f.materialStore, 'read')
  const erase = vi.spyOn(f.materialStore, 'erase')
  advance(10)
  expect(ok(await f.ledger.maintenance.expire(f.access))).toMatchObject({
    expiredBodies: 1,
    expiredLeases: 0,
    cleanupPending: true,
  })
  expect(read).not.toHaveBeenCalled()
  expect(erase).not.toHaveBeenCalled()
  const expiration = (await f.records()).find(row => row.kind === 'body-expiration')
  expect(expiration).toMatchObject({
    expiration: { result: before.result, bodyId: body.bodyId, expiredAt: instant(10) },
  })
  if (expiration?.kind !== 'body-expiration') throw new Error('missing expiration')
  const transition = f.commits.find(input =>
    input.writes.some(write => write.kind === 'put' && write.record.kind === 'body-expiration'),
  )
  expect(transition?.writes).toEqual(
    expect.arrayContaining([
      { kind: 'put', record: expiration },
      { kind: 'delete', key: `material-use:body:${body.bodyId}` },
      { kind: 'put', record: { kind: 'material-time', time: { highWatermark: instant(10) } } },
      expect.objectContaining({
        kind: 'put',
        record: expect.objectContaining({ kind: 'material-cleanup' }),
      }),
    ]),
  )
  expect(await f.records()).toContainEqual(
    expect.objectContaining({
      kind: 'material-cleanup',
      cleanup: expect.objectContaining({ material: expiration.expiration.material }),
    }),
  )
  expect(await f.ledger.reads.body.read(body)).toEqual({
    failure: { kind: 'not-found', target: 'body', reason: 'expired' },
  })
  const after = await f.resultPage()
  expect(after.terminal).toEqual(before.terminal)
  expect(after.effect).toEqual(before.effect)
})

it('retains a live body before its deadline and does not renew it after retry or rebuild', async () => {
  const { f, body, advance } = await fixture()
  advance(9)
  expect(ok(await f.ledger.maintenance.expire(f.access)).expiredBodies).toBe(0)
  expect(textPage(ok(await f.ledger.reads.body.read(body))).text).toBe('中🙂')
  advance(10)
  expect(ok(await f.ledger.maintenance.expire(f.access)).expiredBodies).toBe(1)
  const expired = (await f.records()).filter(row => row.kind === 'body-expiration')
  f.rebuild({ ...configuration().offloading, maxRetentionMs: 1000 })
  advance(0)
  expect(ok(await f.ledger.maintenance.expire(f.access)).expiredBodies).toBe(0)
  expect((await f.records()).filter(row => row.kind === 'body-expiration')).toEqual(expired)
  expect(await f.ledger.reads.body.read(body)).toHaveProperty('failure.reason', 'expired')
})

it.each(['applied', 'dropped'] as const)(
  'recovers an %s unknown expiration without reporting it as complete',
  async mode => {
    const { f, body, advance } = await fixture()
    advance(10)
    f.interceptCommit(async input => {
      if (
        input.writes.some(write => write.kind === 'put' && write.record.kind === 'body-expiration')
      ) {
        if (mode === 'applied') await f.harness.memory.commit(input)
        return { kind: 'unknown', diagnostic: 'injected uncertainty' }
      }
      return f.harness.memory.commit(input)
    })
    expect(await f.ledger.maintenance.expire(f.access)).toHaveProperty(
      'failure.kind',
      'unavailable',
    )
    f.interceptCommit(null)
    const retry = ok(await f.ledger.maintenance.expire(f.access))
    expect(retry.expiredBodies).toBe(mode === 'applied' ? 0 : 1)
    expect((await f.records()).filter(row => row.kind === 'body-expiration')).toHaveLength(1)
    expect(await f.ledger.reads.body.read(body)).toHaveProperty('failure.reason', 'expired')
  },
)

it('rejects time below the persisted watermark without changing uses or cleanup', async () => {
  const { f, advance } = await fixture()
  advance(9)
  ok(await f.ledger.maintenance.expire(f.access))
  const before = await f.records()
  advance(8)
  expect(await f.ledger.maintenance.expire(f.access)).toHaveProperty('failure.kind', 'unavailable')
  expect(await f.records()).toEqual(before)
})

it.each([10, 20])('preserves the active page until its own deadline at time %i', async time => {
  let hold = false
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const { f, body, advance } = await fixture({
    wrapMaterials: store => ({
      ...store,
      read: async request => {
        if (hold) {
          entered.resolve()
          await resume.promise
        }
        return store.read(request)
      },
    }),
  })
  hold = true
  const page = f.ledger.reads.body.read(body)
  await entered.promise
  advance(time)
  const progress = ok(await f.ledger.maintenance.expire(f.access))
  expect(progress.expiredBodies).toBe(1)
  expect(progress.expiredLeases).toBe(time === 20 ? 1 : 0)
  expect(await f.ledger.reads.body.read(body)).toHaveProperty('failure.reason', 'expired')
  resume.resolve()
  const result = await page
  if (time === 10) expect(textPage(ok(result)).text).toBe('中🙂')
  else expect(result).toHaveProperty('failure.kind', 'unavailable')
})

it('separates maintenance from content authority and rejects a foreign principal', async () => {
  const maintainer = { ...principalA, subject: 'material-maintainer' }
  const { f, body, advance } = await fixture({
    wrapAccess: access => ({
      qualify: async input => {
        const verdict = await access.qualify(input)
        if (verdict.kind !== 'allowed') return verdict
        const maintenance = input.principal.subject === maintainer.subject
        return (input.action === 'maintain-materials') === maintenance
          ? { kind: 'allowed' }
          : { kind: 'denied', reason: 'wrong-capability' }
      },
    }),
  })
  advance(10)
  const before = await f.records()
  expect(await f.ledger.maintenance.expire(f.access)).toHaveProperty('failure.kind', 'denied')
  expect(await f.ledger.maintenance.expire({ ...f.access, principal: principalB })).toHaveProperty(
    'failure.kind',
    'denied',
  )
  expect(await f.ledger.reads.body.read({ ...body, principal: maintainer })).toHaveProperty(
    'failure.kind',
    'denied',
  )
  expect(await f.records()).toEqual(before)
  expect(
    ok(await f.ledger.maintenance.expire({ ...f.access, principal: maintainer })).expiredBodies,
  ).toBe(1)
})

it('rechecks authority after commit before returning maintenance information', async () => {
  let revoked = false
  const { f, advance } = await fixture({
    wrapAccess: access => ({
      qualify: input =>
        revoked ? Promise.resolve({ kind: 'denied', reason: 'revoked' }) : access.qualify(input),
    }),
  })
  advance(10)
  f.interceptCommit(async input => {
    const result = await f.harness.memory.commit(input)
    revoked = true
    return result
  })
  expect(await f.ledger.maintenance.expire(f.access)).toHaveProperty('failure.kind', 'denied')
})

it('redecides after a competing expiration rather than counting it twice', async () => {
  const { f, advance } = await fixture()
  advance(10)
  let first = true
  f.interceptCommit(async input => {
    if (first) {
      first = false
      await f.harness.memory.commit(input)
      return { kind: 'conflict', current: input.revision }
    }
    return f.harness.memory.commit(input)
  })
  expect(ok(await f.ledger.maintenance.expire(f.access)).expiredBodies).toBe(0)
  expect((await f.records()).filter(row => row.kind === 'body-expiration')).toHaveLength(1)
})

it('leaves native, process and delivery uses unchanged when the model body expires', async () => {
  const { f, advance } = await fixture({
    value: raw => ({
      content: [text('body', '中🙂'.repeat(1200))],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [raw.content],
    }),
    process: raw => [
      {
        index: 'output',
        mode: 'replace',
        state: 'open',
        sequence: '0',
        trim: null,
        content: {
          kind: 'file',
          id: text('process', '').id,
          visibility: { toHuman: true, toModel: false },
          ref: raw.content,
          transcript: null,
        },
      },
    ],
  })
  const before = (await f.records()).filter(
    row =>
      row.kind === 'material-use' &&
      ['native-reference', 'process-history', 'delivery'].includes(row.use.kind),
  )
  expect(
    new Set(before.flatMap(row => (row.kind === 'material-use' ? [row.use.kind] : []))),
  ).toEqual(new Set(['native-reference', 'process-history', 'delivery']))
  advance(10)
  ok(await f.ledger.maintenance.expire(f.access))
  expect(
    (await f.records()).filter(
      row =>
        row.kind === 'material-use' &&
        ['native-reference', 'process-history', 'delivery'].includes(row.use.kind),
    ),
  ).toEqual(before)
})

it('does not commit when maintenance authority is revoked while sampling time', async () => {
  let armed = false
  let revoked = false
  const { f, advance } = await fixture({
    wrapMaterialClock: clock => ({
      sample: async () => {
        const sampled = await clock.sample()
        if (armed) revoked = true
        return sampled
      },
    }),
    wrapAccess: access => ({
      qualify: input =>
        revoked ? Promise.resolve({ kind: 'denied', reason: 'revoked' }) : access.qualify(input),
    }),
  })
  advance(10)
  armed = true
  const before = await f.records()
  expect(await f.ledger.maintenance.expire(f.access)).toHaveProperty('failure.kind', 'denied')
  expect(await f.records()).toEqual(before)
})

it('does not end uses when the material clock is unavailable', async () => {
  let unavailable = false
  const { f, advance } = await fixture({
    wrapMaterialClock: clock => ({
      sample: () =>
        unavailable
          ? Promise.resolve(
              fail({ kind: 'unavailable', dependency: 'clock', diagnostic: 'offline' }),
            )
          : clock.sample(),
    }),
  })
  advance(10)
  unavailable = true
  const before = await f.records()
  expect(await f.ledger.maintenance.expire(f.access)).toHaveProperty('failure.kind', 'unavailable')
  expect(await f.records()).toEqual(before)
})

it.each(['advance', 'rollback'] as const)(
  'resamples time after a conflict that retains timed uses: %s',
  async mode => {
    const samples: string[] = []
    let observing = false
    const { f, body, advance } = await fixture({
      wrapMaterialClock: clock => ({
        sample: async () => {
          const sampled = await clock.sample()
          if (observing && 'ok' in sampled) samples.push(sampled.ok)
          return sampled
        },
      }),
    })
    let first = true
    f.interceptCommit(async input => {
      if (first) {
        first = false
        await f.harness.memory.commit({
          ...input,
          writes: [
            {
              kind: 'put',
              record: {
                kind: 'material-time',
                time: { highWatermark: instant(mode === 'advance' ? 8 : 10) },
              },
            },
          ],
        })
        advance(mode === 'advance' ? 10 : 9)
        return { kind: 'conflict', current: input.revision }
      }
      return f.harness.memory.commit(input)
    })
    advance(9)
    observing = true
    const result = await f.ledger.maintenance.expire(f.access)
    expect(samples).toEqual([instant(9), instant(mode === 'advance' ? 10 : 9)])
    if (mode === 'advance') {
      expect(ok(result).expiredBodies).toBe(1)
      expect(await f.ledger.reads.body.read(body)).toHaveProperty('failure.reason', 'expired')
    } else {
      expect(result).toHaveProperty('failure.kind', 'unavailable')
      expect((await f.records()).filter(row => row.kind === 'body-expiration')).toHaveLength(0)
      expect(
        (await f.records()).filter(
          row => row.kind === 'material-use' && row.use.kind === 'offloaded-body',
        ),
      ).toHaveLength(1)
    }
  },
)
