import { expect, it, vi } from 'vitest'
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

for (const close of ['return', 'abort'] as const) {
  it(`closes by ${close} before a silent directory reconnect returns and never exposes its late snapshot`, async () => {
    const base = assembled()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const returned = Promise.withResolvers<void>()
    let block = false
    let connects = 0
    const directory = base.dependencies.instances.directory
    const provider = createModelRuntime(
      {
        ...base.dependencies,
        instances: {
          ...base.dependencies.instances,
          directory: {
            async connect(input) {
              connects++
              const result = await directory.connect(input)
              if (block) {
                entered.resolve()
                await release.promise
                returned.resolve()
              }
              return result
            },
          },
        },
      },
      configuration,
    )
    const f = { ...base, provider }
    unbox(await provider.runtime.calls.admit(f.admit))
    preparedReceipt(await provider.driver.drive(f.drive, new AbortController().signal))
    const { handle, iterator: unused } = await watch(f)
    await unused.return?.()
    const abort = new AbortController()
    const add = vi.spyOn(abort.signal, 'addEventListener')
    const remove = vi.spyOn(abort.signal, 'removeEventListener')
    const iterator = handle.observe({ ...f.admit, signal: abort.signal })[Symbol.asyncIterator]()
    try {
      expect(await iterator.next()).toMatchObject({ value: { kind: 'snapshot' } })
      const pending = iterator.next()
      await waiting(f)
      block = true
      f.controls.clock.advanceTo('2026-10-19T00:00:00.025Z')
      await entered.promise
      expect(f.controls.clock.pending()).toBe(0)
      if (close === 'return') {
        expect(await iterator.return?.()).toEqual({ done: true, value: undefined })
        expect(await pending).toEqual({ done: true, value: undefined })
      } else {
        abort.abort()
        expect(await pending).toEqual({
          done: false,
          value: { kind: 'ended', reason: 'observer-closed' },
        })
      }
      expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0]?.[1])
      const before = connects
      release.resolve()
      await returned.promise
      expect(await iterator.next()).toEqual({ done: true, value: undefined })
      expect(connects).toBe(before)
      expect(f.controls.clock.pending()).toBe(0)
    } finally {
      release.resolve()
      await iterator.return?.()
      add.mockRestore()
      remove.mockRestore()
    }
  })
}
