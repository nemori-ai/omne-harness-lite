import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import { encodeToolInvocationRef, type ToolDelivery } from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolRevision,
} from '@omne-harness/tool-contract/provider'
import { createLocalInvocationSource } from '@omne-harness/tool-host-local'
import { createLocalTextResults } from '../src/text-results.ts'
import { evidence } from './coordinator-values.ts'
import { forwardingFixture, ok } from './forwarding-values.ts'

async function receiverFixture(durableDeclaration = true) {
  // The declared durability tests the protocol gate only. The underlying store is an explicit double.
  const f = await forwardingFixture({ durableDeclaration })
  const target = await f.source.forwarding.resolve({
    ...f.parent,
    intent: f.intent,
    target: f.target,
  })
  if (target.kind !== 'bound') throw new Error(JSON.stringify(target))
  const reference = ok(
    encodeToolInvocationRef({
      tenant: f.parent.tenant,
      call: target.call,
      admission: target.admission,
    }),
  )
  const payload: ToolDelivery<ContentBlock> = {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference,
      result: ok(decodeToolResultVersion('result-1')),
    },
    consumer: target.request.consumer,
    delivery: ok(decodeToolDeliveryId('delivery-1')),
    relation: 'original',
    terminal: { kind: 'completed' },
    actualTerminal: null,
    effect: { kind: 'not-started' },
    source: evidence('target'),
    value: ok(createLocalTextResults().text('full original payload')),
    account: null,
  }
  const push = (delivery = payload) =>
    f.source.receiver.push({ access: f.parent, delivery, signal: new AbortController().signal })
  return { ...f, target, payload, push }
}
describe('forwarding receiver custody protocol over an explicit store double', () => {
  it('does not acknowledge saved before a confirmed store commit', async () => {
    const f = await receiverFixture()
    f.arm('unavailable')
    expect(await f.push()).toMatchObject({ failure: { kind: 'unavailable' } })
    f.arm('unwritten')
    expect(await f.push()).toEqual({ failure: { kind: 'outcome-unknown' } })
    f.arm('lost')
    expect(await f.push()).toEqual({ failure: { kind: 'outcome-unknown' } })
    const rebuilt = createLocalInvocationSource(f.input)
    const recovered = ok(
      await rebuilt.receiver.push({
        access: f.parent,
        delivery: f.payload,
        signal: new AbortController().signal,
      }),
    )
    expect(recovered.key).toEqual(f.payload.key)
    expect(recovered.evidence.owner).toBe(f.payload.consumer.owner)
    expect(ok(await f.push())).toEqual(recovered)
  })
  it('answers a receipt write the store rejects as a definite failure, without another attempt', async () => {
    const f = await receiverFixture()
    f.arm('rejected')
    expect(await f.push()).toEqual({
      failure: { kind: 'invalid', field: 'storage', reason: 'command_limit' },
    })
  })
  it('refuses a non-durable store, distinct payload and different subject', async () => {
    const memory = await receiverFixture(false)
    expect(await memory.push()).toMatchObject({
      failure: { kind: 'unavailable', dependency: 'forwarding-durable-store' },
    })
    const f = await receiverFixture()
    ok(await f.push())
    expect(
      await f.push({ ...f.payload, value: ok(createLocalTextResults().text('changed')) }),
    ).toEqual({ failure: { kind: 'conflict' } })
    expect(
      await f.source.receiver.push({
        access: { ...f.parent, principal: 'mallory' },
        delivery: f.payload,
        signal: new AbortController().signal,
      }),
    ).toEqual({ failure: { kind: 'denied' } })
  })
  it('retains full payload after parent settlement and separates later result versions', async () => {
    const f = await receiverFixture()
    expect(f.call.state.phase).toBe('settled')
    const first = ok(await f.push())
    const late: typeof f.payload = {
      ...f.payload,
      key: { ...f.payload.key, result: ok(decodeToolResultVersion('result-2')) },
      relation: 'late',
    }
    const second = ok(await f.push(late))
    expect(second.key).not.toEqual(first.key)
    const read = await f.memory.read({
      kind: 'host',
      tenant: f.parent.tenant,
      key: 'invocation-source',
    })
    expect(JSON.stringify(read)).toContain('full original payload')
    expect(JSON.stringify(read)).toContain('result-2')
    const account: ToolDelivery<ContentBlock> = {
      kind: 'account',
      key: {
        kind: 'account',
        producer: 'tool',
        reference: f.payload.key.reference,
        event: 'late-account',
        revision: '2',
      },
      consumer: f.payload.consumer,
      account: {
        subject: { kind: 'tool_execution', id: f.target.call },
        usage: [],
        cost: [],
        trimmed: { state: 'unknown', unit: 'tokens' },
        place: 'test',
        duration: { state: 'unknown' },
        receipt: 'late',
        revision: '2',
      },
    }
    const received = ok(
      await f.source.receiver.push({
        access: f.parent,
        delivery: account,
        signal: new AbortController().signal,
      }),
    )
    expect(received.key).toEqual(account.key)
    expect(received.key).not.toEqual(second.key)
    expect(ok(await f.push())).toEqual(first)
  })
  it('does not trust a stored digest when the actual retained payload was changed', async () => {
    const f = await receiverFixture()
    ok(await f.push())
    const domain = { kind: 'host', tenant: f.parent.tenant, key: 'invocation-source' } as const
    const read = await f.memory.read(domain)
    if (read.kind !== 'complete') throw new Error('fixture read')
    const record = read.records.find(
      row => row.kind === 'host' && JSON.stringify(row.host.value).includes('received'),
    )
    if (
      record?.kind !== 'host' ||
      typeof record.host.value !== 'object' ||
      record.host.value === null ||
      !('received' in record.host.value) ||
      !Array.isArray(record.host.value.received)
    )
      throw new Error('fixture record')
    const old: unknown = record.host.value.received[0]
    if (typeof old !== 'object' || old === null) throw new Error('fixture receipt')
    await f.memory.commit({
      domain,
      expected: read.revision,
      revision: ok(decodeToolRevision(String(BigInt(read.revision) + 1n))),
      writes: [
        {
          kind: 'put',
          record: {
            kind: 'host',
            host: {
              ...record.host,
              value: { ...record.host.value, received: [{ ...old, payload: { changed: true } }] },
            },
          },
        },
      ],
    })
    expect(await f.push()).toEqual({ failure: { kind: 'conflict' } })
  })
})
