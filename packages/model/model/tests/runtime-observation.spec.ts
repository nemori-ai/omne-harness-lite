import { expect, it } from 'vitest'
import { createModelRuntime } from '@omne-harness/model'
import { createTestModelDependencies } from '@omne-harness/model/testing'
import { fixture, instance, op, proof, unbox } from './memory-fixture.ts'

export const configuration = {
  outputBatchBytes: 1024,
  outputBatchDelayMs: 0,
  observerBufferBytes: 1024,
  observerCheckIntervalMs: 25,
  resultPageTargetBytes: 128,
  readIdleMs: 1000,
  retryBackoffMs: 0,
  cleanupRetryMs: 0,
}
function assembled() {
  const f = fixture()
  const assembly = createTestModelDependencies({
    ...f.options,
    start: '2026-10-19T00:00:00Z',
    maxWaiters: 10,
    maxQueued: 100,
    sends: [],
  })
  const provider = createModelRuntime(assembly.dependencies, configuration)
  const drive = {
    ...f.admit,
    operation: op('claim'),
    instance: instance(),
    continuity: proof(f.admit.call),
  }
  return { ...f, ...assembly, provider, drive }
}
function preparedReceipt(
  result: Awaited<ReturnType<ReturnType<typeof createModelRuntime>['driver']['drive']>>,
) {
  if ('failure' in result)
    expect(result.failure).toMatchObject({ kind: 'unavailable', dependency: 'model-send' })
}
async function watch(f: ReturnType<typeof assembled>) {
  const route = unbox(
    await f.provider.runtime.instances.connect({
      principal: f.principal,
      tenant: f.tenant,
      reference: f.reference,
    }),
  )
  if (route.kind !== 'live') throw new Error('missing route')
  return {
    handle: route.handle,
    iterator: route.handle
      .observe({ ...f.admit, signal: new AbortController().signal })
      [Symbol.asyncIterator](),
  }
}
async function waiting(f: ReturnType<typeof assembled>) {
  for (let i = 0; i < 100 && f.controls.clock.pending() === 0; i++) await Promise.resolve()
  expect(f.controls.clock.pending()).toBe(1)
}
it('publishes the accepted view before send and updates cancellation independently of upstream', async () => {
  const f = assembled()
  unbox(await f.provider.runtime.calls.admit(f.admit))
  preparedReceipt(await f.provider.driver.drive(f.drive, new AbortController().signal))
  const { iterator } = await watch(f)
  expect(await iterator.next()).toMatchObject({
    value: { kind: 'snapshot', value: { cursor: '0', blocks: [] } },
  })
  const pending = iterator.next()
  await waiting(f)
  unbox(await f.provider.runtime.calls.cancel({ ...f.admit, operation: op('cancel') }))
  expect(await pending).toMatchObject({
    value: { kind: 'changed', value: { cursor: '0', state: { control: { kind: 'requested' } } } },
  })
  await iterator.return?.()
  expect(f.controls.clock.pending()).toBe(0)
  expect(unbox(await f.dependencies.commands.loadRecovery(f.admit)).state.phase).not.toBe('settled')
})
it('checks a pending observer with its own observe permission and closes timers on abort', async () => {
  const f = assembled()
  unbox(await f.provider.runtime.calls.admit(f.admit))
  preparedReceipt(await f.provider.driver.drive(f.drive, new AbortController().signal))
  const { handle } = await watch(f)
  f.denied.add('facts')
  f.denied.add('recovery')
  const abort = new AbortController()
  const iterator = handle.observe({ ...f.admit, signal: abort.signal })[Symbol.asyncIterator]()
  expect(await iterator.next()).toMatchObject({ value: { kind: 'snapshot' } })
  const pending = iterator.next()
  await waiting(f)
  f.denied.add('observe')
  f.controls.clock.advanceTo('2026-10-19T00:00:00.025Z')
  expect(await pending).toEqual({ done: false, value: { kind: 'ended', reason: 'denied' } })
  expect(f.controls.clock.pending()).toBe(0)
  f.denied.delete('observe')
  const other = handle.observe({ ...f.admit, signal: abort.signal })[Symbol.asyncIterator]()
  await other.next()
  const stopped = other.next()
  await waiting(f)
  abort.abort()
  expect(await stopped).toEqual({
    done: false,
    value: { kind: 'ended', reason: 'observer-closed' },
  })
  expect(f.controls.clock.pending()).toBe(0)
})
it('ends the original instance and publishes a successor without pretending to recover its contents', async () => {
  const f = assembled()
  unbox(await f.provider.runtime.calls.admit(f.admit))
  preparedReceipt(await f.provider.driver.drive(f.drive, new AbortController().signal))
  const old = await watch(f)
  await old.iterator.next()
  preparedReceipt(
    await f.provider.driver.drive(
      { ...f.drive, operation: op('successor'), instance: instance('successor') },
      new AbortController().signal,
    ),
  )
  expect(await old.iterator.next()).toMatchObject({
    value: { kind: 'ended', reason: 'stale-instance' },
  })
  const successor = await watch(f)
  expect(successor.handle.instance).toBe(instance('successor'))
  expect(await successor.iterator.next()).toMatchObject({
    value: { kind: 'ended', reason: 'unavailable' },
  })
})
