import { expect, it, vi } from 'vitest'
import { invokeModel } from '../src/invoke.ts'
import { adapter, deferred, fixturePlan, policy, request } from './invoke-policy-fixture.ts'

it('keeps stopped pending after an outcome until the original content callback ends', async () => {
  const entered = deferred()
  const gate = deferred()
  const wire = adapter()
  const handle = invokeModel({
    ...request(),
    transport: wire.transport,
    credential: 'controlled-key',
    signal: new AbortController().signal,
    policy: policy(),
    beforeFirstContent: () => {
      entered.resolve()
      return gate.promise
    },
  })
  try {
    await entered.promise
    handle.abort()
    await handle.outcome
    expect(wire.stopped()).toBe(1)
    let stopped = false
    void handle.stopped.then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)
    gate.resolve()
    await handle.stopped
    expect(stopped).toBe(true)
  } finally {
    gate.resolve()
  }
})

it('confirms stop when validation rejects before transport starts', async () => {
  const wire = adapter()
  const handle = invokeModel({
    ...request(),
    transport: wire.transport,
    credential: '',
    signal: new AbortController().signal,
    policy: policy(),
  })
  await expect(handle.stopped).resolves.toBeUndefined()
  expect(await handle.outcome).toHaveProperty('rejected')
  expect(wire.sends()).toBe(0)
})

it('confirms stop after a failed read if the original iterator can be closed', async () => {
  const cleanupFailure = new Error('reader cleanup failed')
  const wire = adapter({
    stopped: async () => {
      throw cleanupFailure
    },
  })
  const handle = invokeModel({
    ...request(),
    transport: wire.transport,
    credential: 'controlled-key',
    signal: new AbortController().signal,
    policy: policy(),
  })
  const outcome = expect(handle.outcome).rejects.toThrow('reader cleanup failed')
  const stopped = expect(handle.stopped).resolves.toBeUndefined()
  await Promise.all([outcome, stopped])
})

it('does not confirm stop when closing the original iterator fails', async () => {
  const wire = adapter()
  const iterator = wire.transport.read({}, fixturePlan(request()), new AbortController().signal)
  vi.spyOn(iterator, 'next').mockRejectedValue(new Error('read failed'))
  vi.spyOn(iterator, 'return').mockRejectedValue(new Error('close failed'))
  const handle = invokeModel({
    ...request(),
    transport: { ...wire.transport, read: () => iterator },
    credential: 'controlled-key',
    signal: new AbortController().signal,
    policy: policy(),
  })
  await Promise.all([
    expect(handle.outcome).rejects.toThrow('close failed'),
    expect(handle.stopped).rejects.toThrow('stop unconfirmed'),
  ])
})
