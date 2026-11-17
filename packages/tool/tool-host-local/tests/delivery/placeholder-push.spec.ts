import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolTask } from '@omne-harness/tool-contract/provider'
import { decodeToolDeliveryId, decodeToolRevision } from '@omne-harness/tool-contract/provider'
import { evidence, operationId } from '../coordinator-values.ts'
import { createLocalToolResultDelivery } from '../../src/result-delivery.ts'
import { fixture, ok } from './fixture.ts'

const MOVE = operationId('background-move')

async function backgrounded() {
  const f = await fixture()
  const consumer = f.call.request.consumer
  const delivery = ok(decodeToolDeliveryId('d0'))
  const source = { kind: 'control', operation: MOVE } as const
  const task: ToolTask = {
    kind: 'placeholder',
    operation: MOVE,
    state: 'pending',
    diagnostic: null,
    delivery,
    consumer,
    source,
    evidence: evidence('placeholder'),
  }
  const call = {
    ...f.call,
    state: {
      ...f.call.state,
      relation: 'background',
      foreground: {
        kind: 'background',
        call: f.call.call,
        source,
        delivery: { kind: 'pending', delivery, consumer },
      },
    },
  } as typeof f.call
  const committed = await f.store.commit({
    domain: f.domain,
    expected: ok(decodeToolRevision('1')),
    revision: ok(decodeToolRevision('2')),
    writes: [
      { kind: 'put', record: { kind: 'call', call } },
      { kind: 'put', record: { kind: 'task', task } },
    ],
  })
  expect(committed.kind).toBe('committed')
  const releasePlaceholder = vi.fn(f.ledger.commands.releasePlaceholder)
  const input = { ...f.input, commands: { ...f.input.commands, releasePlaceholder } }
  return { ...f, input, releasePlaceholder, task, delivery, source }
}

it('pushes the placeholder and releases it before it pushes the result of the same call', async () => {
  const f = await backgrounded()
  expect(await f.drive(createLocalToolResultDelivery(f.input))).toEqual(succeed({ pending: 0 }))
  expect(f.pushes.map(push => push.kind)).toEqual(['placeholder', 'result'])
  expect(f.pushes[0]).toMatchObject({
    key: { kind: 'placeholder', producer: 'tool' },
    consumer: f.call.request.consumer,
    delivery: f.delivery,
    source: f.source,
    evidence: f.task.evidence,
  })
  expect(f.releasePlaceholder).toHaveBeenCalledTimes(1)
  const order = [
    f.releasePlaceholder.mock.invocationCallOrder[0] ?? 0,
    vi.mocked(f.receiver.push).mock.invocationCallOrder[1] ?? 0,
  ]
  expect(order[0]).toBeLessThan(order[1] ?? 0)
  const read = await f.store.read(f.domain)
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  expect(read.records.some(row => row.kind === 'task' && row.task.kind === 'placeholder')).toBe(
    false,
  )
  const call = read.records.find(row => row.kind === 'call')
  expect(call?.kind === 'call' && call.call.state.foreground).toMatchObject({
    kind: 'background',
    delivery: { kind: 'released' },
  })
})

it('keeps the placeholder and the result owed while the receiver is unavailable', async () => {
  const f = await backgrounded()
  vi.mocked(f.receiver.push).mockImplementation(async () =>
    fail({ kind: 'unavailable', dependency: 'receiver' }),
  )
  expect(await f.drive(createLocalToolResultDelivery(f.input))).toEqual(succeed({ pending: 2 }))
  expect(vi.mocked(f.receiver.push).mock.calls.map(([input]) => input.delivery.kind)).toEqual([
    'placeholder',
  ])
  expect(f.releasePlaceholder).not.toHaveBeenCalled()
  const read = await f.store.read(f.domain)
  if (read.kind !== 'complete') throw new Error('the call domain is unreadable')
  expect(
    read.records
      .filter(row => row.kind === 'task')
      .map(row => row.kind === 'task' && row.task.kind)
      .sort(),
  ).toEqual(['deliver', 'placeholder'])
})

it('pushes only the result once the placeholder is already released', async () => {
  const f = await backgrounded()
  const answered = await f.input.commands.releasePlaceholder({
    ...f.access,
    operation: operationId(`${MOVE}/release-placeholder`),
    delivery: f.delivery,
    consumer: f.call.request.consumer,
    evidence: {
      kind: 'retained',
      custody: { ...evidence('saved'), owner: f.call.request.consumer.owner },
    },
  })
  expect('ok' in answered).toBe(true)
  expect(await f.drive(createLocalToolResultDelivery(f.input))).toEqual(succeed({ pending: 0 }))
  expect(f.pushes.map(push => push.kind)).toEqual(['result'])
})
