import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { createToolLedger } from '@omne-harness/tool'
import type { FactBatch } from '@omne-harness/tool-contract/provider'
import { createMemoryToolClock } from '@omne-harness/tool-contract/testing'
import { settlementFixture } from './settlement-values.ts'
import { configurationOf, guards, ok, testSettlementPorts, type Block } from './runtime-values.ts'

async function fixture() {
  const f = await settlementFixture()
  const ports = testSettlementPorts(f.harness.memory)
  const read = vi.fn(ports.materials.store.read)
  const write = vi.fn(ports.materials.store.write)
  const inspect = vi.fn(ports.materials.store.inspect)
  const ledger = createToolLedger(
    f.harness.memory,
    guards(),
    createMemoryToolClock(),
    configurationOf({}),
    {
      ...ports,
      materials: { ...ports.materials, store: { ...ports.materials.store, read, write, inspect } },
    },
  )
  const task = f.before.tasks.find(task => task.kind === 'settle')
  if (task?.kind !== 'settle') throw new Error('missing final task')
  const receive = (batch: FactBatch<Block> = f.batch) =>
    ledger.commands.receiveFacts({ ...f.access, start: batch.start, batch })
  return { ...f, ledger, read, write, inspect, receive, basis: task.basis }
}

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
    events: [{ event: 'alias', fact: f.final }],
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
      { event: 'new', fact: f.final },
      {
        event: 'new',
        fact: {
          ...f.final,
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
