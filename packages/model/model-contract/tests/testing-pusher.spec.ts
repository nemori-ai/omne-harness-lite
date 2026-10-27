import { describe, expect, it } from 'vitest'
import type { CallAccount } from '@omne-harness/call-account'
import { succeed } from '@omne-harness/operation-result'
import type {
  DispatchId,
  ModelDeliveryFailure,
  ModelDeliveryKey,
  ModelResultReceiver,
  ResultVersion,
} from '@omne-harness/model-contract'
import {
  createScriptedResultPusher,
  ScriptedModelError,
  type ScriptedResultPusherOptions,
} from '@omne-harness/model-contract/testing'
import { createDeliveryFixture, type Budget } from './helpers/result-delivery-fixture.ts'
import {
  access,
  admission,
  alice,
  call,
  callRef,
  consumer,
  dispatch,
  evidence,
  must,
  operation,
  scriptedProvider,
  startedDispatch,
  tenantA,
  textBlock,
  version,
  type Principal,
} from './scripted-support.ts'

const limits: Budget = { records: 20, bytes: 100000, attachments: 10000, inFlight: 10 }

/** The receiver fixture behind a queue of scripted failures that answer the next pushes first. */
function scriptedReplies(inner: ModelResultReceiver<Principal>) {
  const replies: ModelDeliveryFailure[] = []
  const receiver: ModelResultReceiver<Principal> = {
    push: input => {
      const failure = replies.shift()
      return failure === undefined ? inner.push(input) : Promise.resolve({ failure })
    },
  }
  return { receiver, answer: (...failures: ModelDeliveryFailure[]) => replies.push(...failures) }
}

/**
 * A scripted provider behind the pusher, and the receiver fixture as the consumer owner `test`.
 * `answer` queues failures that the next pushes get before they reach the fixture.
 */
function harness(over: Partial<ScriptedResultPusherOptions<Principal>> = {}) {
  const scripted = scriptedProvider()
  const store = createDeliveryFixture<Principal>({
    limits,
    tenants: [{ tenant: tenantA, reserved: limits }],
  })
  store.setAccess({ tenant: tenantA, principal: alice }, 'allow')
  const replies = scriptedReplies(store.receiver)
  const pusher = createScriptedResultPusher<Principal>({
    scripted,
    principal: alice,
    resolveReceiver: owner => (owner === consumer.owner ? replies.receiver : null),
    ...over,
  })
  return { scripted, store, pusher, answer: replies.answer }
}
type Harness = ReturnType<typeof harness>

/** Admits the call through the pusher and tells the receiver about the original call. */
async function admitted(
  h: Harness,
  name: string,
  dispatches: readonly DispatchId[] = [],
  over: Parameters<typeof admission>[1] = {},
) {
  const accepted = must(await h.pusher.provider.runtime.calls.admit(admission(name, over)))
  h.store.establishOriginalCall({ reference: accepted.reference, consumer, dispatches })
  return accepted
}

/** Settles the call as completed with three blocks in pages of two. */
function settle(h: Harness, name: string): void {
  h.pusher.controller.settle({
    ...callRef(name),
    version: version(name),
    termination: { kind: 'completed', reason: 'stop' },
    parts: [textBlock('b1', 'one'), textBlock('b2', 'two'), textBlock('b3', 'three')].map(
      block => ({ kind: 'sealed' as const, block, trims: [] }),
    ),
    source: evidence(`settlement-${name}`),
    pageSize: 2,
    pageTargetBytes: 1024,
  })
}

const resultKey = (name: string): ModelDeliveryKey => ({
  kind: 'result',
  reference: access(name).reference,
  result: version(name),
})

function account(name: string, revision: string): CallAccount {
  return {
    subject: { kind: 'model_call', id: call(name) },
    usage: [],
    cost: [],
    trimmed: { state: 'unknown', unit: 'token' },
    place: 'test',
    duration: { state: 'unknown' },
    receipt: 'late',
    revision,
  }
}

function isDeepFrozen(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return true
  return Object.isFrozen(value) && Object.values(value).every(isDeepFrozen)
}

describe('a settled call behind the push-producer double', () => {
  it('pushes the frozen result, is saved, and takes the ACK through the retained handoff', async () => {
    const h = harness()
    await admitted(h, 'a')
    settle(h, 'a')
    const record = await h.pusher.settled(callRef('a'))
    expect(record).toMatchObject({ status: 'saved', attempts: 1, key: resultKey('a') })
    if (record.status !== 'saved' || record.delivery?.kind !== 'result')
      throw new Error('expected a saved result delivery')
    expect(record.receipt.key).toEqual(resultKey('a'))
    expect(record.delivery.parts.map(part => part.kind)).toEqual(['sealed', 'sealed', 'sealed'])
    expect(record.delivery.accounts).toEqual([])
    expect(record.delivery.consumer).toEqual(consumer)
    expect(record.delivery.settlement.version).toBe(version('a'))
    expect(isDeepFrozen(record.delivery)).toBe(true)
    expect(h.pusher.deliveries()).toEqual([record])
    const acks = h.pusher.acknowledgements()
    expect(acks).toHaveLength(1)
    expect(acks[0]).toMatchObject({
      call: callRef('a'),
      operation: operation('ack-a'),
      result: version('a'),
      attempt: 1,
      reply: { ok: { custody: { kind: 'acknowledged', receipt: record.receipt.evidence } } },
    })
    const state = must(await h.scripted.provider.runtime.calls.inspect(access('a')))
    expect(state).toMatchObject({
      kind: 'found',
      state: { custody: { kind: 'acknowledged', operation: operation('ack-a') } },
    })
    expect(h.store.readRecord(resultKey('a'))).toMatchObject({ attempts: 1, receiptObserved: true })
  })

  it('takes no ACK while one of the four saved facts is missing, and a redelivery completes it', async () => {
    const h = harness()
    await admitted(h, 'a')
    h.store.pauseAt(resultKey('a'), 'responsibility')
    settle(h, 'a')
    await h.store.reached(resultKey('a'), 'responsibility')
    h.store.resume(resultKey('a'), 'responsibility', { actual: 'absent', observed: 'known' })
    const record = await h.pusher.settled(callRef('a'))
    expect(record).toMatchObject({
      status: 'failed',
      attempts: 1,
      failure: { kind: 'rejected', failure: { kind: 'unavailable', dependency: 'responsibility' } },
    })
    expect(h.pusher.acknowledgements()).toEqual([])
    expect(must(await h.scripted.provider.runtime.calls.inspect(access('a')))).toMatchObject({
      state: { custody: { kind: 'producer' } },
    })
    const again = await h.pusher.redeliver(resultKey('a'))
    expect(again).toMatchObject({ status: 'saved', attempts: 2 })
    expect(h.pusher.acknowledgements()).toHaveLength(1)
    expect(h.store.events().filter(event => event.action === 'material.commit')).toHaveLength(1)
  })

  it('recognises the same key and content on a redelivery and keeps the original receipt', async () => {
    const h = harness()
    await admitted(h, 'a')
    settle(h, 'a')
    const first = await h.pusher.settled(callRef('a'))
    const again = await h.pusher.redeliver(resultKey('a'))
    expect(again).toMatchObject({ status: 'saved', attempts: 2 })
    if (first.status !== 'saved' || again.status !== 'saved') throw new Error('expected saved')
    expect(again.receipt).toEqual(first.receipt)
    expect(again.delivery).toEqual(first.delivery)
    expect(h.store.readRecord(resultKey('a'))?.attempts).toBe(1)
    expect(h.store.events().filter(event => event.action === 'key.read')).toHaveLength(2)
    expect(h.pusher.acknowledgements()).toHaveLength(1)
    expect(h.pusher.deliveries()).toHaveLength(1)
  })

  it('redelivers at once with the original key and payload when the reply is lost', async () => {
    const h = harness()
    await admitted(h, 'a')
    h.store.dropReplyOnce(resultKey('a'))
    settle(h, 'a')
    const record = await h.pusher.settled(callRef('a'))
    expect(record).toMatchObject({ status: 'saved', attempts: 2 })
    expect(h.store.events().filter(event => event.action === 'reply.lost')).toHaveLength(1)
    expect(h.store.events().filter(event => event.action === 'material.commit')).toHaveLength(1)
    expect(h.pusher.acknowledgements()).toHaveLength(1)
  })

  it('stays unknown after the bounded redeliveries and keeps the payload for a manual redelivery', async () => {
    const h = harness({ maxRedeliveries: 2 })
    await admitted(h, 'a')
    h.store.pauseAt(resultKey('a'), 'material')
    settle(h, 'a')
    await h.store.reached(resultKey('a'), 'material')
    h.store.resume(resultKey('a'), 'material', { actual: 'committed', observed: 'unknown' })
    const record = await h.pusher.settled(callRef('a'))
    expect(record).toMatchObject({ status: 'unknown', attempts: 3 })
    expect(record.delivery).not.toBeNull()
    expect(h.pusher.acknowledgements()).toEqual([])
    h.store.resolveUnknown(resultKey('a'), 'material', 'committed')
    const again = await h.pusher.redeliver(resultKey('a'))
    expect(again).toMatchObject({ status: 'saved', attempts: 4 })
    expect(again.delivery).toEqual(record.delivery)
    expect(h.pusher.acknowledgements()).toHaveLength(1)
  })

  it('resends the ACK with the same operation on commit-unknown and recognises the original one', async () => {
    const h = harness()
    await admitted(h, 'a')
    h.scripted.controller.commitUnknown({
      tenant: tenantA,
      action: 'acknowledge',
      operation: operation('ack-a'),
      effect: 'applied',
      query: 'answers',
    })
    settle(h, 'a')
    const record = await h.pusher.settled(callRef('a'))
    expect(record.status).toBe('saved')
    const acks = h.pusher.acknowledgements()
    expect(acks.map(ack => [ack.attempt, ack.operation, 'ok' in ack.reply])).toEqual([
      [1, operation('ack-a'), false],
      [2, operation('ack-a'), true],
    ])
    expect(acks[0]?.reply).toEqual({
      failure: { kind: 'commit-unknown', operation: operation('ack-a') },
    })
  })
})

/** Admits the call with one started dispatch that has no account yet. */
async function started(h: Harness, name: string) {
  await admitted(h, name, [dispatch('first')])
  h.pusher.controller.start({
    ...callRef(name),
    dispatch: dispatch('first'),
    firstContent: 'observed',
  })
  h.pusher.controller.recordDispatch({ ...callRef(name), record: startedDispatch })
}

const accountKey = (name: string, revision: string): ModelDeliveryKey => ({
  kind: 'account',
  reference: access(name).reference,
  dispatch: dispatch('first'),
  revision,
})

describe('late accounts behind the push-producer double', () => {
  it('queues accounts that arrive before the result is saved and pushes them after it, in order', async () => {
    const h = harness()
    await started(h, 'a')
    h.store.pauseAt(resultKey('a'), 'material')
    const settled = h.pusher.settled(callRef('a'))
    settle(h, 'a')
    await h.store.reached(resultKey('a'), 'material')
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '2') },
    })
    expect(h.pusher.deliveries().map(record => [record.key.kind, record.status])).toEqual([
      ['result', 'pending'],
    ])
    h.store.resume(resultKey('a'), 'material', { actual: 'committed', observed: 'known' })
    const record = await settled
    expect(record).toMatchObject({ status: 'saved' })
    if (record.delivery?.kind !== 'result') throw new Error('expected a result delivery')
    expect(record.delivery.accounts).toEqual([{ dispatch: dispatch('first'), account: null }])
    expect(h.pusher.deliveries().map(item => [item.key, item.status])).toEqual([
      [resultKey('a'), 'saved'],
      [accountKey('a', '1'), 'saved'],
      [accountKey('a', '2'), 'saved'],
    ])
    const actions = h.store.events().map(event => event.action)
    expect(actions.indexOf('reply.saved')).toBeLessThan(actions.lastIndexOf('record.create'))
    expect(h.store.readRecord(accountKey('a', '2'))?.delivery).toMatchObject({
      kind: 'account',
      consumer,
      account: account('a', '2'),
    })
  })

  it('pushes an account that arrives after the save, and never the same dispatch and revision twice', async () => {
    const h = harness()
    await started(h, 'a')
    settle(h, 'a')
    await h.pusher.settled(callRef('a'))
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '3') },
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '3') },
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '2') },
    })
    await h.pusher.settled(callRef('a'))
    expect(h.pusher.deliveries().map(item => [item.key, item.status])).toEqual([
      [resultKey('a'), 'saved'],
      [accountKey('a', '3'), 'saved'],
    ])
    expect(h.pusher.acknowledgements()).toHaveLength(1)
  })

  it('does not push an account revision that the frozen result already carried', async () => {
    const h = harness()
    await admitted(h, 'a', [dispatch('first')])
    h.pusher.controller.start({
      ...callRef('a'),
      dispatch: dispatch('first'),
      firstContent: 'observed',
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '5') },
    })
    settle(h, 'a')
    const record = await h.pusher.settled(callRef('a'))
    if (record.delivery?.kind !== 'result') throw new Error('expected a result delivery')
    expect(record.delivery.accounts).toEqual([
      { dispatch: dispatch('first'), account: account('a', '5') },
    ])
    expect(h.pusher.deliveries()).toHaveLength(1)
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '6') },
    })
    await h.pusher.settled(callRef('a'))
    expect(h.pusher.deliveries().map(item => item.key)).toEqual([
      resultKey('a'),
      accountKey('a', '6'),
    ])
  })
})

describe('what the push-producer double records instead of a save', () => {
  it('records no-receiver when the consumer owner has none, and pushes nothing', async () => {
    const h = harness({ resolveReceiver: () => null })
    await admitted(h, 'a')
    settle(h, 'a')
    expect(await h.pusher.settled(callRef('a'))).toMatchObject({
      status: 'failed',
      attempts: 0,
      failure: { kind: 'no-receiver' },
    })
    expect(h.pusher.acknowledgements()).toEqual([])
    expect(h.store.events()).toEqual([])
  })

  it('records a receipt whose key is not the original as a failure and takes no ACK', async () => {
    const other: ModelResultReceiver<Principal> = {
      push: async input => {
        const result: ResultVersion = version('other')
        return succeed({
          key: { kind: 'result', reference: input.delivery.key.reference, result },
          evidence: evidence('other'),
        })
      },
    }
    const h = harness({ resolveReceiver: () => other })
    await admitted(h, 'a')
    settle(h, 'a')
    const record = await h.pusher.settled(callRef('a'))
    expect(record).toMatchObject({
      status: 'failed',
      attempts: 1,
      failure: {
        kind: 'receipt-key-mismatch',
        receipt: { key: { kind: 'result', result: version('other') } },
      },
    })
    expect(h.pusher.acknowledgements()).toEqual([])
  })

  it('records not-frozen when the pusher may not inspect the settled call, and pushes nothing', async () => {
    const h = harness()
    await admitted(h, 'a')
    h.scripted.controller.revokeAccess({ ...callRef('a'), principal: alice, actions: ['inspect'] })
    settle(h, 'a')
    expect(await h.pusher.settled(callRef('a'))).toEqual({
      key: resultKey('a'),
      delivery: null,
      attempts: 0,
      status: 'failed',
      failure: {
        kind: 'not-frozen',
        step: 'inspect',
        reason: JSON.stringify({ kind: 'denied', action: 'inspect' }),
      },
    })
    expect(h.pusher.acknowledgements()).toEqual([])
    expect(h.store.events()).toEqual([])
  })

  it('refuses to settle a call that was not admitted through the pusher, and leaves the call open', async () => {
    const h = harness()
    must(await h.scripted.provider.runtime.calls.admit(admission('a')))
    expect(() => settle(h, 'a')).toThrow(ScriptedModelError)
    expect(must(await h.scripted.provider.runtime.calls.inspect(access('a')))).toMatchObject({
      state: { phase: 'accepted' },
    })
    expect(h.pusher.deliveries()).toEqual([])
  })

  it('refuses to settle a call whose body is longer than 242 characters, before forwarding', async () => {
    const h = harness()
    const long = 'x'.repeat(243)
    await admitted(h, long)
    expect(() => settle(h, long)).toThrow(ScriptedModelError)
    expect(() => settle(h, long)).toThrow('push-read')
    expect(must(await h.scripted.provider.runtime.calls.inspect(access(long)))).toMatchObject({
      state: { phase: 'accepted' },
    })
    expect(h.pusher.deliveries()).toEqual([])
    const longest = 'y'.repeat(242)
    await admitted(h, longest, [], {
      capacity: { bytes: '4000', blocks: '10', attachmentBytes: '0' },
    })
    settle(h, longest)
    expect((await h.pusher.settled(callRef(longest))).status).toBe('saved')
  })

  it('refuses to redeliver an unknown key or a delivery that is in flight', async () => {
    const h = harness()
    await admitted(h, 'a')
    expect(() => h.pusher.redeliver(resultKey('a'))).toThrow(ScriptedModelError)
    h.store.pauseAt(resultKey('a'), 'material')
    settle(h, 'a')
    await h.store.reached(resultKey('a'), 'material')
    expect(() => h.pusher.redeliver(resultKey('a'))).toThrow('in flight')
    h.store.resume(resultKey('a'), 'material', { actual: 'committed', observed: 'known' })
    expect((await h.pusher.settled(callRef('a'))).status).toBe('saved')
  })
  it('shows a failed delivery as pending while a redelivery is in flight, and refuses a second one', async () => {
    const h = harness()
    await admitted(h, 'a')
    h.answer({ kind: 'unavailable', dependency: 'material' })
    settle(h, 'a')
    expect(await h.pusher.settled(callRef('a'))).toMatchObject({ status: 'failed', attempts: 1 })
    h.store.pauseAt(resultKey('a'), 'material')
    const again = h.pusher.redeliver(resultKey('a'))
    await h.store.reached(resultKey('a'), 'material')
    expect(h.pusher.deliveries().map(item => item.status)).toEqual(['pending'])
    expect(() => h.pusher.redeliver(resultKey('a'))).toThrow('in flight')
    h.store.resume(resultKey('a'), 'material', { actual: 'committed', observed: 'known' })
    expect(await again).toMatchObject({ status: 'saved', attempts: 2 })
    expect(h.pusher.acknowledgements()).toHaveLength(1)
  })
})

describe('a saved result behind the push-producer double stays saved', () => {
  it('keeps saved and the original receipt when a later redelivery is denied, and still pushes a late account', async () => {
    const h = harness()
    await started(h, 'a')
    settle(h, 'a')
    const first = await h.pusher.settled(callRef('a'))
    if (first.status !== 'saved') throw new Error('expected saved')
    h.store.setAccess({ tenant: tenantA, principal: alice }, 'deny')
    const attempt = await h.pusher.redeliver(resultKey('a'))
    expect(attempt).toMatchObject({
      key: resultKey('a'),
      status: 'failed',
      attempts: 2,
      failure: { kind: 'rejected', failure: { kind: 'denied' } },
    })
    expect(attempt.delivery).toEqual(first.delivery)
    h.store.setAccess({ tenant: tenantA, principal: alice }, 'allow')
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    const record = await h.pusher.settled(callRef('a'))
    expect(record).toMatchObject({ status: 'saved', attempts: 2, receipt: first.receipt })
    expect(h.pusher.deliveries().map(item => [item.key, item.status])).toEqual([
      [resultKey('a'), 'saved'],
      [accountKey('a', '1'), 'saved'],
    ])
    expect(h.pusher.acknowledgements()).toHaveLength(1)
  })

  it('keeps saved when a later redelivery is backpressured, and still pushes a late account', async () => {
    const h = harness()
    await started(h, 'a')
    settle(h, 'a')
    const first = await h.pusher.settled(callRef('a'))
    if (first.status !== 'saved') throw new Error('expected saved')
    h.answer({ kind: 'backpressured', resource: 'in-flight' })
    expect(await h.pusher.redeliver(resultKey('a'))).toMatchObject({
      status: 'failed',
      attempts: 2,
      failure: { kind: 'rejected', failure: { kind: 'backpressured', resource: 'in-flight' } },
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    expect(await h.pusher.settled(callRef('a'))).toMatchObject({
      status: 'saved',
      attempts: 2,
      receipt: first.receipt,
    })
    expect(h.pusher.deliveries().map(item => [item.key, item.status])).toEqual([
      [resultKey('a'), 'saved'],
      [accountKey('a', '1'), 'saved'],
    ])
  })

  it('keeps saved when a later redelivery stays unknown past the bound, and still pushes a late account', async () => {
    const h = harness({ maxRedeliveries: 1 })
    await started(h, 'a')
    settle(h, 'a')
    const first = await h.pusher.settled(callRef('a'))
    if (first.status !== 'saved') throw new Error('expected saved')
    h.answer({ kind: 'outcome-unknown' }, { kind: 'outcome-unknown' })
    expect(await h.pusher.redeliver(resultKey('a'))).toMatchObject({
      status: 'unknown',
      attempts: 3,
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    expect(await h.pusher.settled(callRef('a'))).toMatchObject({
      status: 'saved',
      attempts: 3,
      receipt: first.receipt,
    })
    expect(h.pusher.deliveries().map(item => [item.key, item.status])).toEqual([
      [resultKey('a'), 'saved'],
      [accountKey('a', '1'), 'saved'],
    ])
    expect(h.pusher.acknowledgements()).toHaveLength(1)
  })
})

describe('what the push-producer double keeps of a receiver that throws', () => {
  it('keeps the thrown error itself, with its class and fields', async () => {
    class ReceiverError extends Error {
      readonly code = 'E42'
    }
    const thrown = new ReceiverError('the receiver broke')
    const h = harness({
      resolveReceiver: () => ({
        push: () => Promise.reject(thrown),
      }),
    })
    await admitted(h, 'a')
    settle(h, 'a')
    const record = await h.pusher.settled(callRef('a'))
    if (record.status !== 'failed' || record.failure.kind !== 'threw')
      throw new Error('expected a threw failure')
    expect(record.attempts).toBe(1)
    expect(record.failure.error).toBe(thrown)
    expect(record.failure.error).toBeInstanceOf(ReceiverError)
    expect(thrown.code).toBe('E42')
    expect(Object.isFrozen(thrown)).toBe(false)
    expect(h.pusher.acknowledgements()).toEqual([])
  })

  it('still lists every delivery when the resolver throws a value that cannot be cloned', async () => {
    const thrown = { detail: 'no receiver today', retry() {} }
    const h = harness({
      resolveReceiver: () => {
        throw thrown
      },
    })
    await admitted(h, 'a')
    settle(h, 'a')
    const record = await h.pusher.settled(callRef('a'))
    expect(record).toMatchObject({ status: 'failed', attempts: 0, failure: { kind: 'threw' } })
    const listed = h.pusher.deliveries()
    expect(listed).toHaveLength(1)
    const only = listed[0]
    if (only?.status !== 'failed' || only.failure.kind !== 'threw')
      throw new Error('expected a threw failure')
    expect(only.failure.error).toBe(thrown)
  })
})

describe('what the push-producer double does with an operation it reserves', () => {
  it('refuses an admission whose operation starts with mop_ack- and does not forward it', async () => {
    const h = harness()
    await expect(
      h.pusher.provider.runtime.calls.admit(admission('a', { operation: operation('ack-a') })),
    ).rejects.toThrow(ScriptedModelError)
    expect(h.pusher.deliveries()).toEqual([])
    const accepted = must(await h.pusher.provider.runtime.calls.admit(admission('a')))
    expect(accepted).toMatchObject({ call: call('a'), recovered: false })
  })

  it('refuses an admission whose operation starts with mop_push-read- and does not forward it', async () => {
    const h = harness()
    await expect(
      h.pusher.provider.runtime.calls.admit(
        admission('a', { operation: operation('push-read-b') }),
      ),
    ).rejects.toMatchObject({ reason: 'invalid-script' })
    const accepted = must(await h.pusher.provider.runtime.calls.admit(admission('a')))
    expect(accepted).toMatchObject({ call: call('a'), recovered: false })
  })

  it('admits an operation that only contains a reserved prefix later in its body', async () => {
    const h = harness()
    await admitted(h, 'a', [], { operation: operation('x-ack-a') })
    settle(h, 'a')
    expect((await h.pusher.settled(callRef('a'))).status).toBe('saved')
  })
})
