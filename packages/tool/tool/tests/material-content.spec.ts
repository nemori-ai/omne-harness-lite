import { decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { createToolLedger } from '@omne-harness/tool'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { settlementFixture } from './settlement-values.ts'
import { auditQueues } from './start-values.ts'
import {
  adoption,
  callId,
  configurationOf,
  evidence,
  guards,
  ok,
  operationId,
  principalA,
  principalB,
  tenantA,
  text,
  testSettlementPorts,
} from './runtime-values.ts'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))
afterEach(async () => {
  vi.useRealTimers()
  await auditQueues()
})

async function fixture(name = 'settlement', forge = false) {
  const f = await settlementFixture({
    call: name,
    value: async (_raw, ledger) => {
      const kept = ok(
        await ledger.rawCustody.preserve({
          principal: principalA,
          tenant: tenantA,
          call: callId(name),
          operation: operationId('binary-attachment'),
          codec: adoption('binary'),
          source: evidence('binary-source'),
          bytes: new Uint8Array([0, 255, 128, 13, 10, 0]),
        }),
      )
      return {
        content: [text('answer', 'binary output')],
        data: { kind: 'none' },
        original: { kind: 'none' },
        attachments: [forge ? { ...kept.content, key: 'forged-material-key' } : kept.content],
      }
    },
  })
  const state = ok(await f.preserve())
  if (state.phase !== 'settled') throw new Error('not settled')
  const attachment = f.final.result.attachments[0]
  if (attachment === undefined) throw new Error('missing attachment')
  const input = { ...f.access, result: state.result, attachment, maxBytes: 3 }
  const materials = testSettlementPorts(f.harness.memory).materials
  const denied: import('@omne-harness/tool').ToolLedgerAction[] = []
  const rebuild = () =>
    createToolLedger(
      f.harness.memory,
      guards({ deniedActions: denied }),
      createMemoryToolClock(),
      configurationOf({}),
      {
        materials,
        content: null,
        custody: f.custody,
        releaseInspection: f.environment,
      },
    )
  return { ...f, input, materials, denied, rebuild }
}

it('reads Tool-owned raw materials through the public content reader without an external byte provider', async () => {
  const f = await fixture()
  const { input } = f
  const first = ok(await f.ledger.reads.content.read({ ...input, after: null }))
  expect(first.bytes).toEqual(new Uint8Array([0, 255, 128]))
  expect(first.offset).toBe('0')
  expect(first.next).not.toBeNull()
  const second = ok(await f.ledger.reads.content.read({ ...input, after: first.next }))
  expect(second.bytes).toEqual(new Uint8Array([13, 10, 0]))
  expect(second.offset).toBe('3')
  expect(second.next).toBeNull()
})

it('rejects a referenced internal address that has no matching material owned by the call', async () => {
  const f = await fixture('forged', true)
  const read = vi.spyOn(f.materials.store, 'read')
  expect(await f.ledger.reads.content.read({ ...f.input, after: null })).toMatchObject({
    failure: { kind: 'invalid', reason: 'not-owned-material' },
  })
  expect(read.mock.calls.some(([input]) => input.maxBytes === 3)).toBe(false)
})

it('binds a material cursor to its call and result and rejects malformed positions', async () => {
  const first = await fixture('first')
  const other = await fixture('other')
  const page = ok(await first.ledger.reads.content.read({ ...first.input, after: null }))
  if (page.next === null) throw new Error('missing continuation')
  expect(
    await other.ledger.reads.content.read({ ...other.input, after: page.next }),
  ).toHaveProperty('failure.kind', 'invalid-cursor')
  for (const after of ['not-json', '{}', JSON.stringify({ ...JSON.parse(page.next), offset: '6' })])
    expect(await first.ledger.reads.content.read({ ...first.input, after })).toHaveProperty(
      'failure.kind',
      'invalid-cursor',
    )
})

it('rejects cross-tenant reads and checks raw permission even when a raw material is an explicit attachment', async () => {
  const f = await fixture()
  expect(
    await f.ledger.reads.content.read({ ...f.input, principal: principalB, after: null }),
  ).toHaveProperty('failure.kind', 'denied')
  f.denied.push('read-raw')
  expect(await f.rebuild().reads.content.read({ ...f.input, after: null })).toHaveProperty(
    'failure.kind',
    'denied',
  )
})

it('rechecks permission after material IO before returning bytes', async () => {
  const f = await fixture()
  const ledger = f.rebuild()
  const read = f.materials.store.read.bind(f.materials.store)
  vi.spyOn(f.materials.store, 'read').mockImplementation(async input => {
    const result = await read(input)
    if (input.maxBytes === 3) f.denied.push('read-raw')
    return result
  })
  expect(await ledger.reads.content.read({ ...f.input, after: null })).toHaveProperty(
    'failure.kind',
    'denied',
  )
})

it('rechecks material ownership after IO before returning bytes', async () => {
  const f = await fixture()
  const read = f.materials.store.read.bind(f.materials.store)
  vi.spyOn(f.materials.store, 'read').mockImplementation(async input => {
    const result = await read(input)
    if (input.maxBytes === 3) {
      const domain = { kind: 'call' as const, tenant: f.access.tenant, call: f.access.call }
      const snapshot = await f.harness.memory.read(domain)
      if (snapshot.kind !== 'complete') throw new Error('no snapshot')
      expect(
        await f.harness.memory.commit({
          domain,
          expected: snapshot.revision,
          revision: ok(decodeToolRevision(String(BigInt(snapshot.revision) + 1n))),
          writes: [{ kind: 'delete', key: 'material:binary-attachment' }],
        }),
      ).toEqual({ kind: 'committed' })
    }
    return result
  })
  const outcome = await f.ledger.reads.content.read({ ...f.input, after: null })
  expect(outcome).toMatchObject({ failure: { kind: 'invalid', reason: 'not-owned-material' } })
})
