import { expect, test, vi } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { unwrap } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type {
  PreparedToolExecution,
  ToolPoolInstance,
} from '@omne-harness-lite/tool-execution-runtime'
import { access, at, definition, ref, request, scope } from './execution-owner-fixture.ts'
import { factoryConfig } from './runtime-factory-fixture.ts'
import { nativeRuntimeFixture } from './native-runtime-fixture.ts'

async function factoryFixture() {
  const cleanup: (() => Promise<void>)[] = []
  const native = await nativeRuntimeFixture(cleanup)
  const source = await native.log.fixturePrefix(scope)
  if ('failure' in source) throw new Error('fixture source unavailable')
  if (request.call.arguments === undefined) throw new Error('fixture arguments missing')
  const prepared: PreparedToolExecution = {
    access,
    ref,
    origin: request.origin,
    call: request.call,
    source: source.source,
    afterAction: { pass: 'original-after-action', selectedChain: [] },
    selected: {
      capability: 'tool:echo',
      asset: 'echo-asset',
      version: '1',
      adoption: 'adopted',
      definition,
    },
    args: request.call.arguments,
    ...(request.admissionToken === undefined ? {} : { admissionToken: request.admissionToken }),
  }
  return {
    ...native,
    prepared,
    start: (value: unknown): ToolPoolInstance => Reflect.apply(native.start, undefined, [value]),
    async close() {
      await native.pool()?.close()
      for (const close of cleanup.splice(0)) await close()
    },
  }
}

test.each([
  ['null root', null],
  ['array root', []],
  ['missing storage', { frameQueueBytes: 0, tailRetry: factoryConfig().tailRetry }],
  ['unknown root field', { ...factoryConfig(), extra: true }],
  ['null retry', { ...factoryConfig(), tailRetry: null }],
  [
    'unknown retry field',
    { ...factoryConfig(), tailRetry: { ...factoryConfig().tailRetry, extra: 1 } },
  ],
  ['negative frame budget', { ...factoryConfig(), frameQueueBytes: -1 }],
  ['fractional frame budget', { ...factoryConfig(), frameQueueBytes: 0.5 }],
  ['unsafe frame budget', { ...factoryConfig(), frameQueueBytes: Number.MAX_SAFE_INTEGER + 1 }],
  ['represented frame budget', { ...factoryConfig(), frameQueueBytes: new LosslessNumber('0') }],
  [
    'zero attempts',
    { ...factoryConfig(), tailRetry: { attempts: 0, minDelayMs: 0, maxDelayMs: 0 } },
  ],
  [
    'fractional attempts',
    { ...factoryConfig(), tailRetry: { attempts: 1.5, minDelayMs: 0, maxDelayMs: 0 } },
  ],
  [
    'negative minimum',
    { ...factoryConfig(), tailRetry: { attempts: 1, minDelayMs: -1, maxDelayMs: 0 } },
  ],
  [
    'inverted bounds',
    { ...factoryConfig(), tailRetry: { attempts: 1, minDelayMs: 2, maxDelayMs: 1 } },
  ],
  [
    'infinite maximum',
    { ...factoryConfig(), tailRetry: { attempts: 1, minDelayMs: 0, maxDelayMs: Infinity } },
  ],
  ['empty storage', { ...factoryConfig(), resultStorage: '' }],
  ['nonstring storage', { ...factoryConfig(), resultStorage: 1 }],
])('rejects %s before borrowing the journal or enumerating recovery', async (_label, supplied) => {
  const f = await factoryFixture()
  try {
    expect(() => f.start(supplied)).toThrow(TypeError)
    expect(f.borrow).not.toHaveBeenCalled()
    expect(f.enumerate).not.toHaveBeenCalled()
    expect(f.unused).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('configuration accessors cannot run before construction rejection', async () => {
  const f = await factoryFixture()
  const get = vi.fn(() => {
    throw new Error('configuration getter ran')
  })
  const config = { ...factoryConfig() }
  Object.defineProperty(config, 'resultStorage', { enumerable: true, get })
  try {
    expect(() => f.start(config)).toThrow(TypeError)
    expect(get).not.toHaveBeenCalled()
    expect(f.borrow).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('a hostile configuration proxy retains its exception and creates no borrow', async () => {
  const f = await factoryFixture()
  const error = new Error('original configuration trap')
  const config = new Proxy(factoryConfig(), {
    getPrototypeOf() {
      throw error
    },
  })
  try {
    let caught: unknown
    try {
      f.start(config)
    } catch (failure) {
      caught = failure
    }
    expect(caught).toBe(error)
    expect(f.borrow).not.toHaveBeenCalled()
    expect(f.enumerate).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('recovery fences all ingress, retains ready identity and delegates only after readiness', async () => {
  const f = await factoryFixture()
  const gate = Promise.withResolvers<void>()
  const read = f.support.storage.read.bind(f.support.storage)
  const index = vi.spyOn(f.support.storage, 'read').mockImplementationOnce(async use => {
    await gate.promise
    return read(use)
  })
  const runtime = f.start(factoryConfig())
  const ready = runtime.ready
  try {
    expect(await runtime.operations.submit(f.prepared)).toEqual({
      kind: 'rejected',
      reason: 'runtimeNotReady',
    })
    expect(await runtime.operations.acquire(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'runtimeNotReady',
    })
    expect(await runtime.operations.stop(access, ref, 'stop')).toBe('unavailable')
    expect(await runtime.operations.answer(access, ref, 1, null)).toBe('unavailable')
    expect(f.authorize).not.toHaveBeenCalled()
    gate.resolve()
    await ready
    expect(runtime.ready).toBe(ready)
    expect(await runtime.operations.submit(f.prepared)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await runtime.operations.acquire(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'notAuthorized',
    })
    expect(await runtime.operations.stop(access, ref, 'stop')).toBe('notAuthorized')
    expect(await runtime.operations.answer(access, ref, 1, null)).toBe('unavailable')
    expect(f.authorize).toHaveBeenCalledTimes(3)
    await runtime.idle()
    expect(index).toHaveBeenCalledOnce()
    expect(f.borrow).not.toHaveBeenCalled()
    expect(f.enumerate).not.toHaveBeenCalled()
    expect(f.unused).not.toHaveBeenCalled()
  } finally {
    gate.resolve()
    await f.close()
  }
})

test('close during recovery shares the original attempt and late readiness cannot reopen ingress', async () => {
  const f = await factoryFixture()
  const gate = Promise.withResolvers<void>()
  const read = f.support.storage.read.bind(f.support.storage)
  vi.spyOn(f.support.storage, 'read').mockImplementationOnce(async use => {
    await gate.promise
    return read(use)
  })
  const runtime = f.start(factoryConfig())
  const ready = runtime.ready
  try {
    const closing = runtime.close()
    expect(runtime.close()).toBe(closing)
    expect(await runtime.operations.submit(f.prepared)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    gate.resolve()
    await ready
    await closing
    expect(runtime.ready).toBe(ready)
    expect(runtime.close()).toBe(closing)
    expect(await runtime.operations.acquire(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(await runtime.operations.stop(access, ref, 'stop')).toBe('unavailable')
    expect(await runtime.operations.answer(access, ref, 1, null)).toBe('ownerStopped')
    expect(f.borrow).not.toHaveBeenCalled()
    expect(f.enumerate).not.toHaveBeenCalled()
    expect(f.authorize).not.toHaveBeenCalled()
    expect(await f.log.readSince(scope.session, 0)).not.toHaveProperty('failure')
  } finally {
    gate.resolve()
    await f.close()
  }
})

test('failed index reads retain original readiness and require explicit same-instance close retry', async () => {
  const f = await factoryFixture()
  const error = new StorageUnavailable('original index unavailable')
  const index = vi
    .spyOn(f.support.storage, 'read')
    .mockRejectedValueOnce(error)
    .mockRejectedValueOnce(error)
  const runtime = f.start(factoryConfig())
  const ready = runtime.ready
  try {
    await expect(ready).rejects.toBe(error)
    expect(await runtime.operations.submit(f.prepared)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    expect(await runtime.operations.acquire(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    await expect(runtime.close()).rejects.toBe(error)
    const retry = runtime.close()
    expect(runtime.close()).toBe(retry)
    await retry
    expect(runtime.ready).toBe(ready)
    await expect(runtime.ready).rejects.toBe(error)
    expect(await runtime.operations.submit(f.prepared)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(index).toHaveBeenCalledTimes(3)
    expect(f.borrow).not.toHaveBeenCalled()
    expect(f.enumerate).not.toHaveBeenCalled()
    expect(f.authorize).not.toHaveBeenCalled()
    expect(await f.log.readSince(scope.session, 0)).not.toHaveProperty('failure')
  } finally {
    await f.close()
  }
})

test('unavailable recovery clock prevents ready and preserves the original resource obligation', async () => {
  const cleanup: (() => Promise<void>)[] = []
  const f = await nativeRuntimeFixture(cleanup)
  const original = await f.seed()
  const resource = {
    key: 'original-process',
    provider: 'controlled',
    reference: { unit: 'unit', generation: 'one' },
  }
  const planned = await f.support.storage.atomic(unit =>
    original.records.stageTransitionIn(unit, original.job, [
      { kind: 'resource_planned', revision: 1, ref, resource },
    ]),
  )
  expect(planned.kind).toBe('staged')
  const now = vi.spyOn(f.dependencies.clock, 'now').mockResolvedValueOnce('unavailable')
  const runtime = f.start()
  const ready = runtime.ready
  try {
    await expect(ready).rejects.toThrow('clock unavailable')
    expect((await f.history()).kind).toBe('found')
    await runtime.close()
    expect(runtime.ready).toBe(ready)
    const found = await f.history()
    if (found.kind !== 'found') throw new Error('original history unavailable')
    expect(found.history.terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
    expect(found.history.resources.get(resource.key)?.observations.at(-1)?.value.status).toBe(
      'confirmed',
    )
    expect(f.unused).not.toHaveBeenCalled()
  } finally {
    now.mockResolvedValue(unwrap(instantFromRfc3339(at)))
    await runtime.close()
    for (const close of cleanup.splice(0)) await close()
  }
})
