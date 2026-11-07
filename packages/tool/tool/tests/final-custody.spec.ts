import { createHash } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { succeed } from '@omne-harness/operation-result'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import {
  decodeToolMaterialInstant,
  decodeToolRevision,
  type ToolMaterialStore,
} from '@omne-harness/tool-contract/provider'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  adoption,
  configurationOf,
  evidence,
  guards,
  ok,
  operationId,
  testSettlementPorts,
  principalB,
  type Principal,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function fixture() {
  const f = await settlementFixture()
  const written: Uint8Array[] = []
  const prepared: unknown[] = []
  const store: ToolMaterialStore<Principal> = {
    inspect: async () => succeed({ kind: 'unknown' }),
    write: async input => {
      prepared.push(await f.records())
      written.push(input.bytes.slice())
      return succeed({
        material: input.material,
        codec: input.codec,
        bytes: String(input.bytes.length),
        sha256: createHash('sha256').update(input.bytes).digest('hex'),
        evidence: evidence('material-sealed'),
      })
    },
    read: async () => {
      throw new Error('not used')
    },
    erase: async () => {
      throw new Error('not used')
    },
    inspectErase: async () => {
      throw new Error('not used')
    },
  }
  const sample = vi.fn(async () =>
    succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.000Z'))),
  )
  const ports = {
    ...testSettlementPorts(),
    materials: { provider: adoption('materials'), store, clock: { sample } },
  }
  const baseGuards = guards()
  let revoked = false
  const guarded = {
    ...baseGuards,
    access: {
      qualify: async (input: Parameters<typeof baseGuards.access.qualify>[0]) =>
        revoked ? { kind: 'denied' as const, reason: 'revoked' } : baseGuards.access.qualify(input),
    },
  }
  const rebuild = () =>
    createToolLedger(f.harness.memory, guarded, createMemoryToolClock(), configurationOf({}), ports)
  const input = {
    ...f.access,
    operation: operationId('exact-final'),
    start: f.batch.start,
    source: f.batch.source,
    final: f.final,
  }
  return {
    ...f,
    ports,
    revoke: () => {
      revoked = true
    },
    input,
    written,
    prepared,
    store,
    sample,
    rebuild,
    exact: rebuild().finalCustody,
  }
}

it('commits preparation responsibility and time before preserving the exact rendered final', async () => {
  const f = await fixture()
  const pointer = ok(await f.exact.preserveFinal(f.input))
  expect(f.written).toHaveLength(1)
  expect(JSON.parse(new TextDecoder().decode(f.written[0]))).toEqual(f.final)
  expect(f.prepared[0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'material',
        material: expect.objectContaining({ state: { kind: 'preparing' } }),
      }),
      expect.objectContaining({
        kind: 'material-use',
        use: expect.objectContaining({ kind: 'preparation', operation: f.input.operation }),
      }),
      { kind: 'material-time', time: { highWatermark: '2026-11-07T00:00:00.000Z' } },
    ]),
  )
  expect(pointer).toMatchObject({
    kind: 'final',
    raw: f.final.raw,
    terminal: f.final.terminal,
    effect: f.final.effect,
  })
  expect(pointer.value.digest).toBe(pointer.envelope.sha256)
  expect(pointer.value.bytes).toBe(pointer.envelope.bytes)
  expect(ok(await f.rebuild().finalCustody.preserveFinal(f.input))).toEqual(pointer)
  expect(f.written).toHaveLength(1)
  expect(f.sample).toHaveBeenCalledTimes(1)
})

it.each([250, 251, 256])(
  'preserves and recalls a final with a %i-character operation',
  async length => {
    const f = await fixture()
    const input = { ...f.input, operation: operationId('x'.repeat(length)) }
    const pointer = ok(await f.exact.preserveFinal(input))
    expect(ok(await f.rebuild().finalCustody.preserveFinal(input))).toEqual(pointer)
    expect(f.written).toHaveLength(1)
    expect(JSON.parse(new TextDecoder().decode(f.written[0]))).toEqual(f.final)
  },
)

it('does not touch bytes after an unknown preparation commit and recovers the same responsibility', async () => {
  const f = await fixture()
  f.harness.memory.injectCommit('unknown-applied')
  expect(await f.exact.preserveFinal(f.input)).toEqual({
    failure: { kind: 'commit-unknown', operation: f.input.operation },
  })
  expect(f.written).toHaveLength(0)
  f.sample.mockImplementation(async () => {
    throw new Error('clock offline after restart')
  })
  expect(await f.rebuild().finalCustody.preserveFinal(f.input)).toHaveProperty('ok')
  expect(f.written).toHaveLength(1)
  expect(f.sample).toHaveBeenCalledTimes(1)
})

it('rejects a restarted clock behind the persisted call watermark and resamples after CAS conflict', async () => {
  const f = await fixture()
  ok(await f.exact.preserveFinal(f.input))
  f.sample.mockResolvedValueOnce(succeed(ok(decodeToolMaterialInstant('2026-11-06T23:59:59.999Z'))))
  const next = { ...f.input, operation: operationId('second-envelope') }
  expect(await f.rebuild().finalCustody.preserveFinal(next)).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'material-custody' },
  })
  expect(f.written).toHaveLength(1)
  f.harness.memory.injectCommit('conflict')
  f.sample.mockResolvedValueOnce(succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.100Z'))))
  f.sample.mockResolvedValueOnce(succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.200Z'))))
  ok(await f.exact.preserveFinal(next))
  expect(f.sample).toHaveBeenCalledTimes(4)
  expect(await f.records()).toContainEqual({
    kind: 'material-time',
    time: { highWatermark: '2026-11-07T00:00:00.200Z' },
  })
})

it('rejects another final under the same operation and a different original execution', async () => {
  const f = await fixture()
  ok(await f.exact.preserveFinal(f.input))
  const changed = { ...f.input, source: evidence('different-source') }
  expect(await f.exact.preserveFinal(changed)).toEqual({
    failure: { kind: 'conflict', operation: f.input.operation },
  })
  expect(
    await f.exact.preserveFinal({
      ...f.input,
      operation: operationId('other-start'),
      start: { ...f.input.start, operation: operationId('forged-start') },
    }),
  ).toMatchObject({ failure: { kind: 'invalid', field: 'start' } })
  expect(f.written).toHaveLength(1)
})

it('retains preparation after a byte commit loses its reply and adopts the inspected seal', async () => {
  const f = await fixture()
  const original = f.store.write
  let saved: Awaited<ReturnType<typeof original>> | null = null
  f.store.write = async input => {
    saved = await original(input)
    return { failure: { kind: 'commit-unknown', operation: input.operation } }
  }
  expect(await f.exact.preserveFinal(f.input)).toHaveProperty('failure.kind', 'commit-unknown')
  f.store.inspect = async () => {
    if (saved === null || 'failure' in saved) throw new Error('fixture did not preserve bytes')
    return succeed({ kind: 'sealed', seal: saved.ok })
  }
  ok(await f.rebuild().finalCustody.preserveFinal(f.input))
  expect(f.written).toHaveLength(1)
})

it('does not return a pointer when the seal commit is unknown, then recalls it without byte IO', async () => {
  const f = await fixture()
  const original = f.store.write
  f.store.write = async input => {
    const sealed = await original(input)
    f.harness.memory.injectCommit('unknown-applied')
    return sealed
  }
  expect(await f.exact.preserveFinal(f.input)).toHaveProperty('failure.kind', 'commit-unknown')
  f.store.inspect = async () => {
    throw new Error('replay must not inspect bytes')
  }
  ok(await f.rebuild().finalCustody.preserveFinal(f.input))
  expect(f.written).toHaveLength(1)
})

it('rejects an invalid seal without throwing or claiming sealed custody', async () => {
  const f = await fixture()
  f.store.write = async () => succeed(null as never)
  expect(await f.exact.preserveFinal(f.input)).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'material-custody' },
  })
  expect(await f.records()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: 'material',
        material: expect.objectContaining({ state: { kind: 'preparing' } }),
      }),
    ]),
  )
})

it('rejects an invalid inspection without starting a write', async () => {
  const f = await fixture()
  f.store.inspect = async () => succeed({ kind: 'alien' } as never)
  expect(await f.exact.preserveFinal(f.input)).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'material-custody' },
  })
  expect(f.written).toHaveLength(0)
})

it('honours an operation exclusion committed while preparation was sampling time', async () => {
  const f = await fixture()
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  f.sample.mockImplementation(async () => {
    entered.resolve()
    await resume.promise
    return succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.000Z')))
  })
  const pending = f.exact.preserveFinal(f.input)
  await entered.promise
  expect(ok(await f.rebuild().reads.operation(f.input))).toEqual({ kind: 'not-committed' })
  resume.resolve()
  expect(await pending).toMatchObject({
    failure: { kind: 'unavailable', dependency: 'ledger-store' },
  })
  expect(f.written).toHaveLength(0)
})

it('qualifies before disclosing a sealed result to another principal', async () => {
  const f = await fixture()
  ok(await f.exact.preserveFinal(f.input))
  expect(await f.exact.preserveFinal({ ...f.input, principal: principalB })).toMatchObject({
    failure: { kind: 'denied' },
  })
  expect(f.written).toHaveLength(1)
})

it('keeps the original final when inputs change during the clock await', async () => {
  const f = await fixture()
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const input = structuredClone(f.input)
  const original = structuredClone(input.final)
  f.sample.mockImplementation(async () => {
    entered.resolve()
    await resume.promise
    return succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.000Z')))
  })
  const pending = f.exact.preserveFinal(input)
  await entered.promise
  Object.assign(input.final, { result: { ...input.final.result, content: [] } })
  resume.resolve()
  ok(await pending)
  expect(JSON.parse(new TextDecoder().decode(f.written[0]))).toEqual(original)
})

it('rechecks current qualification before returning a pointer after byte IO', async () => {
  const f = await fixture()
  const original = f.store.write
  f.store.write = async input => {
    const saved = await original(input)
    f.revoke()
    return saved
  }
  expect(await f.exact.preserveFinal(f.input)).toMatchObject({ failure: { kind: 'denied' } })
  expect(f.written).toHaveLength(1)
})

it('fixes provider identity before asynchronous preparation', async () => {
  const f = await fixture()
  f.sample.mockImplementation(async () => {
    Object.assign(f.ports.materials.provider, { name: 'changed-after-entry' })
    return succeed(ok(decodeToolMaterialInstant('2026-11-07T00:00:00.000Z')))
  })
  const pointer = ok(await f.exact.preserveFinal(f.input))
  expect(pointer.envelope.material.provider).toEqual(adoption('materials'))
})

it('cannot seal or recreate a material after a concurrent deletion authorization', async () => {
  const f = await fixture()
  const original = f.store.write
  f.store.write = async input => {
    const sealed = await original(input)
    const domain = { kind: 'call' as const, tenant: f.access.tenant, call: f.access.call }
    const snapshot = await f.harness.memory.read(domain)
    if (snapshot.kind !== 'complete') throw new Error('fixture could not read call')
    const prepared = snapshot.records.find(
      record => record.kind === 'material' && record.material.writeOperation === f.input.operation,
    )
    if (prepared?.kind !== 'material') throw new Error('fixture has no preparation')
    expect(
      await f.harness.memory.commit({
        domain,
        expected: snapshot.revision,
        revision: ok(decodeToolRevision(String(BigInt(snapshot.revision) + 1n))),
        writes: [
          {
            kind: 'put',
            record: {
              kind: 'material',
              material: {
                ...prepared.material,
                state: {
                  kind: 'deleting',
                  operation: operationId('delete'),
                  fence: evidence('delete-authorized'),
                },
              },
            },
          },
        ],
      }),
    ).toEqual({ kind: 'committed' })
    return sealed
  }
  expect(await f.exact.preserveFinal(f.input)).toHaveProperty('failure.kind', 'conflict')
  expect(await f.rebuild().finalCustody.preserveFinal(f.input)).toHaveProperty(
    'failure.kind',
    'conflict',
  )
  expect(f.written).toHaveLength(1)
})
