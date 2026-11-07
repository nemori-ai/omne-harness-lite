import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolLedger } from '@omne-harness/tool'
import type { FactBatch } from '@omne-harness/tool-contract/provider'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { settlementFixture } from './settlement-values.ts'
import { callId, configurationOf, guards, ok, testSettlementPorts } from './runtime-values.ts'

async function fixture() {
  const f = await settlementFixture()
  const ports = testSettlementPorts(f.harness.memory)
  const read = vi.fn(ports.materials.store.read)
  const write = vi.fn(ports.materials.store.write)
  const inspect = vi.fn(ports.materials.store.inspect)
  const revoked = new Set<string>()
  const baseGuards = guards()
  const ledger = createToolLedger(
    f.harness.memory,
    {
      ...baseGuards,
      access: {
        qualify: input =>
          revoked.has(input.call)
            ? Promise.resolve({ kind: 'denied' as const, reason: 'revoked' })
            : baseGuards.access.qualify(input),
      },
    },
    createMemoryToolClock(),
    configurationOf({}),
    {
      ...ports,
      materials: { ...ports.materials, store: { ...ports.materials.store, read, write, inspect } },
    },
  )
  const task = f.before.tasks.find(task => task.kind === 'settle')
  if (task?.kind !== 'settle') throw new Error('missing final task')
  const receive = (batch: FactBatch = f.batch) =>
    ledger.commands.receiveFacts({ ...f.access, start: batch.start, batch })
  return { ...f, ledger, read, write, inspect, receive, revoked, basis: task.basis }
}

it('rechecks the original call after material IO even when the caller changes the input', async () => {
  const f = await fixture()
  const input = { ...f.access, basis: f.basis }
  const read = f.read.getMockImplementation()
  if (read === undefined) throw new Error('missing material reader')
  f.read.mockImplementation(async page => {
    const result = await read(page)
    f.revoked.add(f.access.call)
    input.call = callId('still-authorized-call')
    return result
  })
  expect(await f.ledger.facts.read(input)).toHaveProperty('failure.kind', 'denied')
})

it('recalls the received final and its aliases without reading or writing its material', async () => {
  const f = await fixture()
  const offline = async () => {
    throw new Error('material provider is offline')
  }
  f.read.mockImplementation(offline)
  f.write.mockImplementation(offline)
  f.inspect.mockImplementation(offline)
  const receipt = ok(await f.receive())
  expect(ok(await f.receive())).toEqual(receipt)
  const alias = {
    ...f.batch,
    batch: 'alias',
    after: f.batch.cursor,
    cursor: 'alias/end',
    events: [{ event: 'alias', fact: f.pointer }],
  }
  ok(await f.receive(alias))
  expect(f.read).not.toHaveBeenCalled()
  expect(f.write).not.toHaveBeenCalled()
  expect(f.inspect).not.toHaveBeenCalled()
  expect(
    (await f.records()).filter(record => record.kind === 'task' && record.task.kind === 'settle'),
  ).toHaveLength(1)
})

it.each(['truncated', 'wrong-continuation', 'corrupt', 'unavailable'] as const)(
  'does not disclose a recovered final when its material is %s',
  async fault => {
    const f = await fixture()
    const read = f.read.getMockImplementation()
    if (read === undefined) throw new Error('missing material reader')
    f.read.mockImplementation(async input => {
      if (fault === 'unavailable')
        return fail({ kind: 'unavailable', dependency: 'test', diagnostic: 'offline' })
      const page = await read(input)
      if ('failure' in page) return page
      if (fault === 'truncated') return succeed({ bytes: page.ok.bytes.slice(0, -1), next: null })
      if (fault === 'wrong-continuation') return succeed({ bytes: page.ok.bytes, next: '0' })
      const bytes = page.ok.bytes.slice()
      bytes[0] = 0
      return succeed({ bytes, next: page.ok.next })
    })
    expect(await f.ledger.facts.read({ ...f.access, basis: f.basis })).toHaveProperty(
      'failure.kind',
      'unavailable',
    )
    f.read.mockImplementation(read)
    expect(ok(await f.ledger.facts.read({ ...f.access, basis: f.basis })).fact).toEqual(f.final)
  },
)

it('rejects conflicting duplicate final events before material IO or acknowledgement', async () => {
  const f = await fixture()
  const batch = {
    ...f.batch,
    batch: 'conflicting',
    after: f.batch.cursor,
    cursor: 'conflicting/end',
    events: [
      { event: 'new', fact: f.pointer },
      {
        event: 'new',
        fact: {
          ...f.pointer,
          terminal: {
            kind: 'failed' as const,
            cause: 'executor' as const,
            diagnostic: 'different',
          },
        },
      },
    ],
  }
  const before = f.harness.memory.commits
  expect(await f.receive(batch)).toHaveProperty('failure.kind', 'invalid')
  expect(f.harness.memory.commits).toBe(before)
  expect(f.write).not.toHaveBeenCalled()
  expect(f.inspect).not.toHaveBeenCalled()
})

it.each(['pending', 'settled'] as const)(
  'rejects an unsupported stored fingerprint codec during %s recovery without reading bytes',
  async phase => {
    const f = await fixture()
    if (phase === 'settled') ok(await f.preserve())
    const read = f.harness.memory.read.bind(f.harness.memory)
    vi.spyOn(f.harness.memory, 'read').mockImplementation(async domain => {
      const snapshot = await read(domain)
      if (snapshot.kind === 'complete') {
        for (const record of snapshot.records) {
          if (record.kind === 'fact-event' && record.fact.fact.kind === 'final') {
            Reflect.set(record.fact.fact.value, 'codec', 'tool-canonical-json-v2')
          }
        }
      }
      return snapshot
    })
    expect(await f.ledger.facts.read({ ...f.access, basis: f.basis })).toHaveProperty(
      'failure.kind',
      'unsupported',
    )
    expect(f.read).not.toHaveBeenCalled()
  },
)
