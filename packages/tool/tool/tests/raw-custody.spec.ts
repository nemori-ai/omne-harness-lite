import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  adoption,
  configurationOf,
  evidence,
  guards,
  ok,
  operationId,
  principalB,
  callId,
  testSettlementPorts,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function fixture() {
  const f = await settlementFixture()
  const ports = testSettlementPorts()
  const store = ports.materials.store
  const write = store.write.bind(store)
  const observed: unknown[] = []
  store.write = vi.fn(async input => {
    observed.push(await f.records())
    return write(input)
  })
  const base = guards()
  let revoked = false
  const guarded = {
    ...base,
    access: {
      qualify: async (input: Parameters<typeof base.access.qualify>[0]) =>
        revoked ? { kind: 'denied' as const, reason: 'revoked' } : base.access.qualify(input),
    },
  }
  const rebuild = () =>
    createToolLedger(f.harness.memory, guarded, createMemoryToolClock(), configurationOf({}), ports)
  return {
    ...f,
    ports,
    store,
    observed,
    rebuild,
    revoke: () => {
      revoked = true
    },
    custody: rebuild().rawCustody,
    input: {
      ...f.access,
      operation: operationId('raw-preparation'),
      codec: adoption('binary-codec'),
      source: evidence('original-output'),
      bytes: new Uint8Array([0, 255, 128, 13, 10, 0]),
    },
  }
}

it('preserves the exact raw bytes and codec after durably recording preparation responsibility', async () => {
  const f = await fixture()
  const raw = ok(await f.custody.preserve(f.input))
  expect(f.observed[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'material-use',
        use: expect.objectContaining({ kind: 'preparation', operation: f.input.operation }),
      }),
    ]),
  )
  expect(f.store.write).toHaveBeenCalledOnce()
  expect(f.store.write).toHaveBeenCalledWith(
    expect.objectContaining({ bytes: f.input.bytes, codec: f.input.codec }),
  )
  expect(raw.codec).toEqual(f.input.codec)
  expect(raw.content.bytes).toBe('6')
  expect(ok(await f.rebuild().rawCustody.inspect(f.input))).toEqual({ kind: 'retained', raw })
  expect(ok(await f.rebuild().rawCustody.preserve(f.input))).toEqual(raw)
  expect(f.store.write).toHaveBeenCalledOnce()
})

it('fixes the input bytes before qualification yields', async () => {
  const f = await fixture()
  const pending = f.custody.preserve(f.input)
  f.input.bytes.fill(42)
  const raw = ok(await pending)
  expect(f.store.write).toHaveBeenCalledWith(
    expect.objectContaining({ bytes: new Uint8Array([0, 255, 128, 13, 10, 0]) }),
  )
  expect(raw.content.bytes).toBe('6')
})

it.each(['bytes', 'codec', 'source'] as const)(
  'rejects changed %s under the original operation',
  async field => {
    const f = await fixture()
    const raw = ok(await f.custody.preserve(f.input))
    const changed =
      field === 'bytes'
        ? { ...f.input, bytes: new Uint8Array([0, 255, 128, 13, 10, 1]) }
        : field === 'codec'
          ? { ...f.input, codec: adoption('different-codec') }
          : { ...f.input, source: evidence('different-source') }
    expect(await f.custody.preserve(changed)).toEqual({
      failure: { kind: 'conflict', operation: f.input.operation },
    })
    expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'retained', raw })
    expect(f.store.write).toHaveBeenCalledOnce()
  },
)

it('leaves bytes untouched when the preparation commit is unknown and recovers after restart', async () => {
  const f = await fixture()
  f.harness.memory.injectCommit('unknown-applied')
  expect(await f.custody.preserve(f.input)).toEqual({
    failure: { kind: 'commit-unknown', operation: f.input.operation },
  })
  expect(f.store.write).not.toHaveBeenCalled()
  expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'unknown' })
  expect(await f.rebuild().rawCustody.preserve(f.input)).toHaveProperty('ok')
  expect(f.store.write).toHaveBeenCalledOnce()
})

it('recovers a lost byte-write reply without writing the bytes again', async () => {
  const f = await fixture()
  const original = f.store.write
  f.store.write = vi.fn(async input => {
    ok(await original(input))
    return { failure: { kind: 'commit-unknown' as const, operation: input.operation } }
  })
  expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'commit-unknown')
  expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'unknown' })
  expect(await f.rebuild().rawCustody.preserve(f.input)).toHaveProperty('ok')
  expect(f.store.write).toHaveBeenCalledOnce()
})

it('does not disclose raw after access is revoked during byte IO', async () => {
  const f = await fixture()
  const original = f.store.write
  f.store.write = async input => {
    const saved = await original(input)
    f.revoke()
    return saved
  }
  expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'denied')
  expect(await f.custody.inspect(f.input)).toHaveProperty('failure.kind', 'denied')
})

it('does not inspect a final envelope as raw output or claim an absent operation is excluded', async () => {
  const f = await fixture()
  expect(ok(await f.custody.inspect({ ...f.input, operation: operationId('absent') }))).toEqual({
    kind: 'unknown',
  })
  ok(
    await f
      .rebuild()
      .finalCustody.preserveFinal({ ...f.input, start: f.batch.start, final: f.final }),
  )
  expect(ok(await f.custody.inspect(f.input))).toEqual({ kind: 'unknown' })
  expect(await f.custody.preserve(f.input)).toHaveProperty('failure.kind', 'conflict')
})

it('rejects cross-tenant access before touching or disclosing raw materials', async () => {
  const f = await fixture()
  ok(await f.custody.preserve(f.input))
  const foreign = { ...f.input, principal: principalB }
  expect(await f.custody.preserve(foreign)).toHaveProperty('failure.kind', 'denied')
  expect(await f.custody.inspect(foreign)).toHaveProperty('failure.kind', 'denied')
  expect(f.store.write).toHaveBeenCalledOnce()
})

it('does not create raw preparation for an unstarted call', async () => {
  const f = await fixture()
  expect(await f.custody.preserve({ ...f.input, call: callId('unstarted') })).toHaveProperty(
    'failure.kind',
    'invalid',
  )
  expect(f.store.write).not.toHaveBeenCalled()
})

it('recalls existing raw after settlement but rejects new preparation', async () => {
  const f = await fixture()
  const raw = ok(await f.custody.preserve(f.input))
  ok(await f.preserve())
  expect(ok(await f.rebuild().rawCustody.preserve(f.input))).toEqual(raw)
  expect(
    await f.custody.preserve({ ...f.input, operation: operationId('after-settlement') }),
  ).toMatchObject({ failure: { kind: 'invalid', reason: 'not-running' } })
  expect(f.store.write).toHaveBeenCalledOnce()
})

it('serializes concurrent different raw values without overwriting the first preparation', async () => {
  const f = await fixture()
  const answers = await Promise.all([
    f.custody.preserve(f.input),
    f.custody.preserve({ ...f.input, bytes: new Uint8Array([9]) }),
  ])
  expect(answers.filter(answer => 'ok' in answer)).toHaveLength(1)
  expect(answers.filter(answer => 'failure' in answer)).toEqual([
    { failure: { kind: 'conflict', operation: f.input.operation } },
  ])
  expect(f.store.write).toHaveBeenCalledOnce()
})
