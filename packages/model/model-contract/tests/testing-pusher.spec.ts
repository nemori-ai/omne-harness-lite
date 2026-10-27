import { describe, expect, it } from 'vitest'
import type { CallAccount } from '@omne-harness/call-account'
import { succeed } from '@omne-harness/operation-result'
import type {
  DispatchId,
  ModelConsumption,
  ModelDeliveryFailure,
  ModelFailure,
  ModelDeliveryKey,
  ModelResultReceiver,
  ResultVersion,
} from '@omne-harness/model-contract'
import {
  createScriptedResultPusher,
  ScriptedModelError,
  type ScriptedModelProvider,
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
import { within } from './helpers/within.ts'

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
  const accepted = must(
    await within(h.pusher.provider.runtime.calls.admit(admission(name, over)), 'admit'),
  )
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

/**
 * The scripted provider with an `acknowledge` that answers the queued failures first and records
 * every input it gets; the rest of the provider is the scripted one.
 */
function answeringAcknowledge(
  scripted: ScriptedModelProvider<Principal>,
  ...failures: ModelFailure[]
) {
  const { runtime } = scripted.provider
  const inputs: Parameters<ModelConsumption<Principal>['acknowledge']>[0][] = []
  const consumption: ModelConsumption<Principal> = {
    ...runtime.consumption,
    acknowledge: input => {
      inputs.push(input)
      const failure = failures.shift()
      return failure === undefined
        ? runtime.consumption.acknowledge(input)
        : Promise.resolve({ failure })
    },
  }
  const provider: ScriptedModelProvider<Principal> = {
    controller: scripted.controller,
    provider: {
      runtime: { ...runtime, consumption },
      recover: input => scripted.provider.recover(input),
      quiesce: () => scripted.provider.quiesce(),
    },
  }
  return { scripted: provider, inputs }
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
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
    const state = must(
      await within(h.scripted.provider.runtime.calls.inspect(access('a')), 'inspect'),
    )
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
    await within(h.store.reached(resultKey('a'), 'responsibility'), 'reached')
    h.store.resume(resultKey('a'), 'responsibility', { actual: 'absent', observed: 'known' })
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
    expect(record).toMatchObject({
      status: 'failed',
      attempts: 1,
      failure: { kind: 'rejected', failure: { kind: 'unavailable', dependency: 'responsibility' } },
    })
    expect(h.pusher.acknowledgements()).toEqual([])
    expect(
      must(await within(h.scripted.provider.runtime.calls.inspect(access('a')), 'inspect')),
    ).toMatchObject({
      state: { custody: { kind: 'producer' } },
    })
    const again = await within(h.pusher.redeliver(resultKey('a')), 'redeliver')
    expect(again).toMatchObject({ status: 'saved', attempts: 2 })
    expect(h.pusher.acknowledgements()).toHaveLength(1)
    expect(h.store.events().filter(event => event.action === 'material.commit')).toHaveLength(1)
  })

  it('recognises the same key and content on a redelivery and keeps the original receipt', async () => {
    const h = harness()
    await admitted(h, 'a')
    settle(h, 'a')
    const first = await within(h.pusher.settled(callRef('a')), 'settled')
    const again = await within(h.pusher.redeliver(resultKey('a')), 'redeliver')
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
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
    await within(h.store.reached(resultKey('a'), 'material'), 'reached')
    h.store.resume(resultKey('a'), 'material', { actual: 'committed', observed: 'unknown' })
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
    expect(record).toMatchObject({ status: 'unknown', attempts: 3 })
    expect(record.delivery).not.toBeNull()
    expect(h.pusher.acknowledgements()).toEqual([])
    h.store.resolveUnknown(resultKey('a'), 'material', 'committed')
    const again = await within(h.pusher.redeliver(resultKey('a')), 'redeliver')
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
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
    await within(h.store.reached(resultKey('a'), 'material'), 'reached')
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
    const record = await within(settled, 'settled')
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
    await within(h.pusher.settled(callRef('a')), 'settled')
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
    await within(h.pusher.settled(callRef('a')), 'settled')
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
    if (record.delivery?.kind !== 'result') throw new Error('expected a result delivery')
    expect(record.delivery.accounts).toEqual([
      { dispatch: dispatch('first'), account: account('a', '5') },
    ])
    expect(h.pusher.deliveries()).toHaveLength(1)
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '6') },
    })
    await within(h.pusher.settled(callRef('a')), 'settled')
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
    expect(await within(h.pusher.settled(callRef('a')), 'settled')).toMatchObject({
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
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
    expect(await within(h.pusher.settled(callRef('a')), 'settled')).toEqual({
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
    must(await within(h.scripted.provider.runtime.calls.admit(admission('a')), 'admit'))
    expect(() => settle(h, 'a')).toThrow(ScriptedModelError)
    expect(
      must(await within(h.scripted.provider.runtime.calls.inspect(access('a')), 'inspect')),
    ).toMatchObject({
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
    expect(
      must(await within(h.scripted.provider.runtime.calls.inspect(access(long)), 'inspect')),
    ).toMatchObject({
      state: { phase: 'accepted' },
    })
    expect(h.pusher.deliveries()).toEqual([])
    const longest = 'y'.repeat(242)
    await admitted(h, longest, [], {
      capacity: { bytes: '4000', blocks: '10', attachmentBytes: '0' },
    })
    settle(h, longest)
    expect((await within(h.pusher.settled(callRef(longest)), 'settled')).status).toBe('saved')
  })

  it('refuses to redeliver an unknown key or a delivery that is in flight', async () => {
    const h = harness()
    await admitted(h, 'a')
    expect(() => h.pusher.redeliver(resultKey('a'))).toThrow(ScriptedModelError)
    h.store.pauseAt(resultKey('a'), 'material')
    settle(h, 'a')
    await within(h.store.reached(resultKey('a'), 'material'), 'reached')
    expect(() => h.pusher.redeliver(resultKey('a'))).toThrow('in flight')
    h.store.resume(resultKey('a'), 'material', { actual: 'committed', observed: 'known' })
    expect((await within(h.pusher.settled(callRef('a')), 'settled')).status).toBe('saved')
  })
  it('shows a failed delivery as pending while a redelivery is in flight, and refuses a second one', async () => {
    const h = harness()
    await admitted(h, 'a')
    h.answer({ kind: 'unavailable', dependency: 'material' })
    settle(h, 'a')
    expect(await within(h.pusher.settled(callRef('a')), 'settled')).toMatchObject({
      status: 'failed',
      attempts: 1,
    })
    h.store.pauseAt(resultKey('a'), 'material')
    const again = h.pusher.redeliver(resultKey('a'))
    await within(h.store.reached(resultKey('a'), 'material'), 'reached')
    expect(h.pusher.deliveries().map(item => item.status)).toEqual(['pending'])
    expect(() => h.pusher.redeliver(resultKey('a'))).toThrow('in flight')
    h.store.resume(resultKey('a'), 'material', { actual: 'committed', observed: 'known' })
    expect(await within(again, 'again')).toMatchObject({ status: 'saved', attempts: 2 })
    expect(h.pusher.acknowledgements()).toHaveLength(1)
  })
})

describe('a saved result behind the push-producer double stays saved', () => {
  it('keeps saved and the original receipt when a later redelivery is denied, and still pushes a late account', async () => {
    const h = harness()
    await started(h, 'a')
    settle(h, 'a')
    const first = await within(h.pusher.settled(callRef('a')), 'settled')
    if (first.status !== 'saved') throw new Error('expected saved')
    h.store.setAccess({ tenant: tenantA, principal: alice }, 'deny')
    const attempt = await within(h.pusher.redeliver(resultKey('a')), 'redeliver')
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
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
    const first = await within(h.pusher.settled(callRef('a')), 'settled')
    if (first.status !== 'saved') throw new Error('expected saved')
    h.answer({ kind: 'backpressured', resource: 'in-flight' })
    expect(await within(h.pusher.redeliver(resultKey('a')), 'redeliver')).toMatchObject({
      status: 'failed',
      attempts: 2,
      failure: { kind: 'rejected', failure: { kind: 'backpressured', resource: 'in-flight' } },
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    expect(await within(h.pusher.settled(callRef('a')), 'settled')).toMatchObject({
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
    const first = await within(h.pusher.settled(callRef('a')), 'settled')
    if (first.status !== 'saved') throw new Error('expected saved')
    h.answer({ kind: 'outcome-unknown' }, { kind: 'outcome-unknown' })
    expect(await within(h.pusher.redeliver(resultKey('a')), 'redeliver')).toMatchObject({
      status: 'unknown',
      attempts: 3,
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    expect(await within(h.pusher.settled(callRef('a')), 'settled')).toMatchObject({
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
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
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
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
      within(
        h.pusher.provider.runtime.calls.admit(admission('a', { operation: operation('ack-a') })),
        'admit',
      ),
    ).rejects.toThrow(ScriptedModelError)
    expect(h.pusher.deliveries()).toEqual([])
    const accepted = must(
      await within(h.pusher.provider.runtime.calls.admit(admission('a')), 'admit'),
    )
    expect(accepted).toMatchObject({ call: call('a'), recovered: false })
  })

  it('refuses an admission whose operation starts with mop_push-read- and does not forward it', async () => {
    const h = harness()
    await expect(
      within(
        h.pusher.provider.runtime.calls.admit(
          admission('a', { operation: operation('push-read-b') }),
        ),
        'admit',
      ),
    ).rejects.toMatchObject({ reason: 'invalid-script' })
    const accepted = must(
      await within(h.pusher.provider.runtime.calls.admit(admission('a')), 'admit'),
    )
    expect(accepted).toMatchObject({ call: call('a'), recovered: false })
  })

  it('admits an operation that only contains a reserved prefix later in its body', async () => {
    const h = harness()
    await admitted(h, 'a', [], { operation: operation('x-ack-a') })
    settle(h, 'a')
    expect((await within(h.pusher.settled(callRef('a')), 'settled')).status).toBe('saved')
  })
})

describe('how the push-producer double takes the ACK', () => {
  it('takes the ACK with the retained custody of the receipt', async () => {
    const h = harness()
    const ack = answeringAcknowledge(h.scripted)
    const pusher = createScriptedResultPusher<Principal>({
      scripted: ack.scripted,
      principal: alice,
      resolveReceiver: () => h.store.receiver,
    })
    must(await within(pusher.provider.runtime.calls.admit(admission('a')), 'admit'))
    h.store.establishOriginalCall({ reference: access('a').reference, consumer, dispatches: [] })
    pusher.controller.settle({
      ...callRef('a'),
      version: version('a'),
      termination: { kind: 'completed', reason: 'stop' },
      parts: [],
      source: evidence('settlement-a'),
      pageSize: 2,
      pageTargetBytes: 1024,
    })
    const record = await within(pusher.settled(callRef('a')), 'settled')
    if (record.status !== 'saved') throw new Error('expected saved')
    expect(ack.inputs).toHaveLength(1)
    expect(ack.inputs[0]).toMatchObject({
      operation: operation('ack-a'),
      result: version('a'),
      evidence: { kind: 'retained', custody: record.receipt.evidence },
    })
  })

  it('resends the ACK on commit-unknown at most maxRedeliveries times and then stops', async () => {
    const h = harness()
    const unknown: ModelFailure = { kind: 'commit-unknown', operation: operation('ack-a') }
    const ack = answeringAcknowledge(h.scripted, unknown, unknown, unknown)
    const pusher = createScriptedResultPusher<Principal>({
      scripted: ack.scripted,
      principal: alice,
      resolveReceiver: () => h.store.receiver,
      maxRedeliveries: 1,
    })
    must(await within(pusher.provider.runtime.calls.admit(admission('a')), 'admit'))
    h.store.establishOriginalCall({ reference: access('a').reference, consumer, dispatches: [] })
    pusher.controller.settle({
      ...callRef('a'),
      version: version('a'),
      termination: { kind: 'completed', reason: 'stop' },
      parts: [],
      source: evidence('settlement-a'),
      pageSize: 2,
      pageTargetBytes: 1024,
    })
    expect((await within(pusher.settled(callRef('a')), 'settled')).status).toBe('saved')
    expect(pusher.acknowledgements().map(item => [item.attempt, item.reply])).toEqual([
      [1, { failure: unknown }],
      [2, { failure: unknown }],
    ])
    expect(
      must(await within(h.scripted.provider.runtime.calls.inspect(access('a')), 'inspect')),
    ).toMatchObject({ state: { custody: { kind: 'producer' } } })
  })

  it('does not resend an ACK whose failure is not commit-unknown', async () => {
    const h = harness()
    const denied: ModelFailure = { kind: 'denied', action: 'acknowledge' }
    const ack = answeringAcknowledge(h.scripted, denied)
    const pusher = createScriptedResultPusher<Principal>({
      scripted: ack.scripted,
      principal: alice,
      resolveReceiver: () => h.store.receiver,
    })
    must(await within(pusher.provider.runtime.calls.admit(admission('a')), 'admit'))
    h.store.establishOriginalCall({ reference: access('a').reference, consumer, dispatches: [] })
    pusher.controller.settle({
      ...callRef('a'),
      version: version('a'),
      termination: { kind: 'completed', reason: 'stop' },
      parts: [],
      source: evidence('settlement-a'),
      pageSize: 2,
      pageTargetBytes: 1024,
    })
    expect((await within(pusher.settled(callRef('a')), 'settled')).status).toBe('saved')
    expect(pusher.acknowledgements().map(item => item.reply)).toEqual([{ failure: denied }])
  })

  it('takes no ACK when an account delivery is redelivered, even while the result has none', async () => {
    const h = harness()
    const denied: ModelFailure = { kind: 'denied', action: 'acknowledge' }
    const ack = answeringAcknowledge(h.scripted, denied)
    const pusher = createScriptedResultPusher<Principal>({
      scripted: ack.scripted,
      principal: alice,
      resolveReceiver: () => h.store.receiver,
    })
    must(await within(pusher.provider.runtime.calls.admit(admission('a')), 'admit'))
    h.store.establishOriginalCall({
      reference: access('a').reference,
      consumer,
      dispatches: [dispatch('first')],
    })
    pusher.controller.start({
      ...callRef('a'),
      dispatch: dispatch('first'),
      firstContent: 'observed',
    })
    pusher.controller.recordDispatch({ ...callRef('a'), record: startedDispatch })
    pusher.controller.settle({
      ...callRef('a'),
      version: version('a'),
      termination: { kind: 'completed', reason: 'stop' },
      parts: [],
      source: evidence('settlement-a'),
      pageSize: 2,
      pageTargetBytes: 1024,
    })
    await within(pusher.settled(callRef('a')), 'settled')
    pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    await within(pusher.settled(callRef('a')), 'settled')
    expect(ack.inputs).toHaveLength(1)
    expect(await within(pusher.redeliver(accountKey('a', '1')), 'redeliver')).toMatchObject({
      status: 'saved',
      attempts: 2,
    })
    expect(ack.inputs).toHaveLength(1)
    expect(pusher.acknowledgements()).toHaveLength(1)
  })
})

describe('what the push-producer double compares by value', () => {
  it('finds no delivery for a key that has a field the delivery key does not have', async () => {
    const h = harness()
    await admitted(h, 'a')
    settle(h, 'a')
    await within(h.pusher.settled(callRef('a')), 'settled')
    const widened = { ...resultKey('a'), extra: 'field' }
    expect(() => h.pusher.redeliver(widened)).toThrow('no delivery has this key')
    expect((await within(h.pusher.redeliver(resultKey('a')), 'redeliver')).status).toBe('saved')
  })

  it('pushes a late account whose revision has more digits, and not one with fewer digits', async () => {
    const h = harness()
    await admitted(h, 'a', [dispatch('first')])
    h.pusher.controller.start({
      ...callRef('a'),
      dispatch: dispatch('first'),
      firstContent: 'observed',
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '9') },
    })
    settle(h, 'a')
    await within(h.pusher.settled(callRef('a')), 'settled')
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '10') },
    })
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '8') },
    })
    await within(h.pusher.settled(callRef('a')), 'settled')
    expect(h.pusher.deliveries().map(item => item.key)).toEqual([
      resultKey('a'),
      accountKey('a', '10'),
    ])
  })

  it('pushes a late account of a dispatch that the frozen result did not list', async () => {
    const h = harness()
    await admitted(h, 'a')
    settle(h, 'a')
    const record = await within(h.pusher.settled(callRef('a')), 'settled')
    if (record.delivery?.kind !== 'result') throw new Error('expected a result delivery')
    expect(record.delivery.accounts).toEqual([])
    h.pusher.controller.recordDispatch({
      ...callRef('a'),
      record: { ...startedDispatch, account: account('a', '1') },
    })
    expect((await within(h.pusher.settled(callRef('a')), 'settled')).status).toBe('saved')
    expect(h.pusher.deliveries().map(item => item.key)).toEqual([
      resultKey('a'),
      accountKey('a', '1'),
    ])
  })
})

describe('what the push-producer double does when its own work fails', () => {
  it('rejects settled with the error when the receipt the receiver answers cannot be copied', async () => {
    const h = harness({
      resolveReceiver: () => ({
        push: async input =>
          succeed({ key: input.delivery.key, evidence: evidence('odd'), extra: () => undefined }),
      }),
    })
    await admitted(h, 'a')
    settle(h, 'a')
    await expect(within(h.pusher.settled(callRef('a')), 'settled')).rejects.toMatchObject({
      name: 'DataCloneError',
    })
  })

  it('shows a result as pending while it is frozen, and refuses to redeliver it before', async () => {
    const h = harness()
    await admitted(h, 'a')
    settle(h, 'a')
    expect(h.pusher.deliveries().map(item => [item.key, item.status, item.delivery])).toEqual([
      [resultKey('a'), 'pending', null],
    ])
    expect(() => h.pusher.redeliver(resultKey('a'))).toThrow('the delivery was never frozen')
    expect((await within(h.pusher.settled(callRef('a')), 'settled')).status).toBe('saved')
  })
})
