import { describe, expect, it } from 'vitest'
import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import {
  decodeModelCallId,
  decodeModelInstanceId,
  decodeModelOperationId,
  encodeModelInvocationRef,
  type ModelDelivery,
  type ModelDeliveryFailure,
  type ModelResultReceiver,
} from '@omne-harness/model-contract'
import { createLiveEvents, type LiveEventsInput } from '../src/plugins/live-events.ts'

function unbox<T>(value: { ok: T } | { failure: unknown }): T {
  if ('ok' in value) return value.ok
  throw new Error('invalid fixture')
}
const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('fixture identity')
const TENANT = tenantOf(organization.value, account.value)
const CALL = unbox(decodeModelCallId('mcall_live'))
const REFERENCE = unbox(
  encodeModelInvocationRef({
    tenant: TENANT,
    call: CALL,
    admission: unbox(decodeModelOperationId('mop_admit')),
  }),
)
const PRINCIPAL = Object.freeze({ subject: 'host' })
const DRIVE = {
  principal: PRINCIPAL,
  tenant: TENANT,
  call: CALL,
  operation: unbox(decodeModelOperationId('mop_drive')),
  instance: unbox(decodeModelInstanceId('minst_live')),
  continuity: { owner: 'host', record: 'live', revision: '1', digest: '1'.repeat(64) },
}
const CONSUMER = { owner: 'agent', work: 'run', position: 'step', purpose: 'live' }
const FRAMES = [
  { seq: 1, at: '2026-11-27T00:00:00.000Z', event: { t: 'started', expiresAt: null } },
  { gap: { from: 2, to: 3 } },
] as const
const RUN = { tenant: TENANT, call: CALL, consumer: CONSUMER, from: 1, to: 3, frames: FRAMES }
const signal = new AbortController().signal

function receiverAnswering(
  answer: (delivery: ModelDelivery) => Awaited<ReturnType<ModelResultReceiver<unknown>['push']>>,
) {
  const pushed: ModelDelivery[] = []
  const receiver: ModelResultReceiver<unknown> = {
    async push({ delivery }) {
      pushed.push(delivery)
      return answer(delivery)
    },
  }
  return { receiver, pushed }
}
const saving = (delivery: ModelDelivery) => ({
  ok: {
    key: delivery.key,
    evidence: { owner: CONSUMER.owner, record: 'r', revision: '1', digest: 'd' },
  },
})

function port(overrides: Partial<LiveEventsInput> = {}) {
  const exited: unknown[] = []
  const { receiver, pushed } = receiverAnswering(saving)
  const events = createLiveEvents({
    authority: { resolve: async () => ({ ok: DRIVE }) },
    reference: async () => REFERENCE,
    receiver: () => receiver,
    exited: target => exited.push(target),
    ...overrides,
  })
  return { events, exited, pushed }
}

describe('the events of a live call go to the receiver of its consumer', () => {
  it('pushes the run under the reference of the call and the numbers it covers, and answers saved', async () => {
    const { events, pushed } = port()
    expect(await events.deliver(RUN, signal)).toBe('saved')
    expect(pushed).toEqual([
      {
        kind: 'live',
        key: { kind: 'live', reference: REFERENCE, from: 1, to: 3 },
        consumer: CONSUMER,
        frames: FRAMES,
      },
    ])
    expect(Object.isFrozen(pushed[0])).toBe(true)
  })

  it('waits while the principal, the reference or the receiver cannot be had', async () => {
    const cases: Partial<LiveEventsInput>[] = [
      {
        authority: {
          resolve: async () => ({
            failure: { kind: 'unavailable', dependency: 'identity', diagnostic: 'offline' },
          }),
        },
      },
      { reference: async () => null },
      { receiver: () => null },
    ]
    for (const overrides of cases)
      expect(await port(overrides).events.deliver(RUN, signal)).toBe('waiting')
  })

  it.each([
    [{ kind: 'outcome-unknown' }, 'unknown'],
    [{ kind: 'unavailable', dependency: 'store' }, 'waiting'],
    [{ kind: 'backpressured', resource: 'records' }, 'waiting'],
    [{ kind: 'cancelled-before-accept' }, 'waiting'],
    [{ kind: 'denied' }, 'refused'],
    [{ kind: 'invalid', field: 'frames', reason: 'shape' }, 'refused'],
    [{ kind: 'conflict' }, 'refused'],
  ] as const satisfies readonly (readonly [ModelDeliveryFailure, string])[])(
    'answers %o from the receiver as %s',
    async (failure, answer) => {
      const { receiver } = receiverAnswering(() => ({ failure }))
      expect(await port({ receiver: () => receiver }).events.deliver(RUN, signal)).toBe(answer)
    },
  )

  it('takes a receipt for another key, or a push that throws, as unknown', async () => {
    const other = receiverAnswering(delivery => ({
      ok: {
        key: { ...delivery.key, kind: 'live', reference: REFERENCE, from: 2, to: 2 },
        evidence: { owner: CONSUMER.owner, record: 'r', revision: '1', digest: 'd' },
      },
    }))
    expect(await port({ receiver: () => other.receiver }).events.deliver(RUN, signal)).toBe(
      'unknown',
    )
    const throwing: ModelResultReceiver<unknown> = {
      push: () => Promise.reject(new Error('synthetic-receiver-failure')),
    }
    expect(await port({ receiver: () => throwing }).events.deliver(RUN, signal)).toBe('unknown')
  })

  it('passes on that the body has gone', () => {
    const { events, exited } = port()
    events.exited({ tenant: TENANT, call: CALL })
    expect(exited).toEqual([{ tenant: TENANT, call: CALL }])
  })
})
