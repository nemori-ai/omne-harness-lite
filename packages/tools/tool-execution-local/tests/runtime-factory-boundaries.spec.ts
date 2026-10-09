import { expect, test, vi } from 'vitest'
import { LosslessNumber } from '@omne-harness-lite/content-blocks'
import { unwrap } from '@omne-harness-lite/identity-values'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type { ToolRuntimeDependencies } from '@omne-harness-lite/tool-execution-runtime'
import { createToolRuntime } from '../src/index.ts'
import { access, at, ref, request, scope } from './execution-owner-fixture.ts'
import { factoryConfig, factoryFixture } from './runtime-factory-fixture.ts'
import { recoveryFixture } from './runtime-recovery-fixture.ts'

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
  const gate =
    Promise.withResolvers<Awaited<ReturnType<ToolRuntimeDependencies['owner']['enumerate']>>>()
  f.enumerate.mockImplementationOnce(() => gate.promise)
  const runtime = f.start(factoryConfig())
  const ready = runtime.ready
  try {
    expect(await runtime.operations.submit(request)).toEqual({
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
    gate.resolve({ kind: 'sessions', sessions: [] })
    await ready
    expect(runtime.ready).toBe(ready)
    expect(await runtime.operations.submit(request)).toEqual({
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
    expect(f.borrow).toHaveBeenCalledOnce()
    expect(f.unused).not.toHaveBeenCalled()
  } finally {
    gate.resolve({ kind: 'sessions', sessions: [] })
    await f.close()
  }
})

test('close during recovery shares the original pending attempt and late readiness cannot reopen ingress', async () => {
  const f = await factoryFixture()
  const gate =
    Promise.withResolvers<Awaited<ReturnType<ToolRuntimeDependencies['owner']['enumerate']>>>()
  f.enumerate.mockImplementationOnce(() => gate.promise)
  const runtime = f.start(factoryConfig())
  const ready = runtime.ready
  try {
    const closing = runtime.close()
    expect(runtime.close()).toBe(closing)
    expect(f.release).not.toHaveBeenCalled()
    expect(await runtime.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    gate.resolve({ kind: 'sessions', sessions: [] })
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
    expect(f.borrow).toHaveBeenCalledOnce()
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.enumerate).toHaveBeenCalledOnce()
    expect(f.authorize).not.toHaveBeenCalled()
  } finally {
    gate.resolve({ kind: 'sessions', sessions: [] })
    await f.close()
  }
})

test('failed readiness and failed close retain the original ready and borrow for explicit same-instance retry', async () => {
  const f = await factoryFixture()
  f.enumerate
    .mockResolvedValueOnce({ kind: 'rejected', reason: 'unavailable' })
    .mockResolvedValueOnce({ kind: 'rejected', reason: 'unavailable' })
  const runtime = f.start(factoryConfig())
  const ready = runtime.ready
  try {
    await expect(ready).rejects.toThrow('cannot enumerate owned sessions')
    expect(await runtime.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    expect(await runtime.operations.acquire(access, ref)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    expect(f.release).not.toHaveBeenCalled()
    await expect(runtime.close()).rejects.toThrow('cannot enumerate owned sessions')
    expect(f.release).not.toHaveBeenCalled()
    const retry = runtime.close()
    expect(runtime.close()).toBe(retry)
    await retry
    expect(runtime.ready).toBe(ready)
    await expect(runtime.ready).rejects.toThrow('cannot enumerate owned sessions')
    expect(await runtime.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    expect(f.borrow).toHaveBeenCalledOnce()
    expect(f.enumerate).toHaveBeenCalledTimes(3)
    expect(f.release).toHaveBeenCalledOnce()
    expect(f.authorize).not.toHaveBeenCalled()
  } finally {
    await f.close()
  }
})

test('release rejection remains pending responsibility until retry succeeds and never closes the shared SQL log', async () => {
  const f = await factoryFixture()
  const error = new Error('original borrow release failed')
  f.release.mockRejectedValueOnce(error)
  const runtime = f.start(factoryConfig())
  try {
    await runtime.ready
    await expect(runtime.close()).rejects.toBe(error)
    expect(await runtime.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'ownerStopped',
    })
    await runtime.close()
    expect(f.release).toHaveBeenCalledTimes(2)
    expect(f.borrow).toHaveBeenCalledOnce()
    const prefix = await f.log.readSince(scope.session, 0)
    expect(prefix).not.toHaveProperty('failure')
    await runtime.close()
    expect(f.release).toHaveBeenCalledTimes(2)
  } finally {
    await f.close()
  }
})

test('unavailable asynchronous recovery clock prevents ready and preserves the original SQL resource obligation', async () => {
  const f = await factoryFixture()
  const cold = await recoveryFixture()
  const release = vi.fn(async () => {})
  const borrow = vi.fn(() => ({ log: cold.log, release }))
  const dependencies: ToolRuntimeDependencies = {
    ...f.dependencies,
    ...cold.input.dependencies,
    history: cold.f.history,
    backing: { ownerGeneration: cold.input.dependencies.backing.ownerGeneration, borrow },
  }
  cold.now.mockResolvedValueOnce('unavailable')
  const runtime = createToolRuntime(factoryConfig(), dependencies)
  const ready = runtime.ready
  try {
    await expect(ready).rejects.toThrow('clock unavailable')
    expect(release).not.toHaveBeenCalled()
    expect(await runtime.operations.submit(request)).toEqual({
      kind: 'rejected',
      reason: 'runtimeUnavailable',
    })
    await runtime.close()
    expect(runtime.ready).toBe(ready)
    expect(borrow).toHaveBeenCalledOnce()
    expect(release).toHaveBeenCalledOnce()
    const history = await cold.read()
    expect(history.terminal?.value.terminal).toEqual({
      outcome: 'failed',
      code: 'abnormal_interruption',
    })
    expect(history.resources.get('original-process')?.observations.at(-1)?.value.status).toBe(
      'confirmed',
    )
    expect(f.unused).not.toHaveBeenCalled()
  } finally {
    cold.now.mockResolvedValue(unwrap(instantFromRfc3339(at)))
    await runtime.close()
    await cold.close()
    await f.close()
  }
})
