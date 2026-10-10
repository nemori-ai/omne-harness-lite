import { Context } from '@deepseek-ai/cordis'
import { afterEach, expect, test, vi } from 'vitest'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { ToolRuntimeStartupService } from '@omne-harness-lite/tool-execution-runtime/cordis'
import type { ToolRuntimeStartupOperations } from '@omne-harness-lite/tool-execution-runtime'
import { managedToolExecutionLocal, runtimeRegistry } from '../src/cordis.ts'
import { nativeRuntimeFixture } from './native-runtime-fixture.ts'
import { factoryConfig } from './runtime-factory-fixture.ts'
import { access, ref } from './execution-owner-fixture.ts'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close()
})

async function fixture(
  prepare?: (native: Awaited<ReturnType<typeof nativeRuntimeFixture>>) => Promise<void>,
  retainError?: Error,
) {
  const native = await nativeRuntimeFixture(cleanup)
  await prepare?.(native)
  const root = new Context()
  const lifetime = createAssemblyLifetime(['tool-pool'], () => {})
  lifetime.tryClaim()
  const port = lifetime.port('tool-pool')
  const start = vi.fn<ToolRuntimeStartupOperations['start']>(native.start)
  const retain = vi.fn<ToolRuntimeStartupOperations['retainClose']>(() => {
    if (retainError) throw retainError
  })
  class Lifetime extends AssemblyLifetimeService {
    isCurrent = port.isCurrent.bind(port)
    register = port.register.bind(port)
    retainClose = port.retainClose.bind(port)
  }
  class Startup extends ToolRuntimeStartupService {
    start = start
    retainClose = retain
  }
  await root.plugin({
    name: 'root-tool-startup',
    apply(ctx) {
      new Lifetime(ctx)
      new Startup(ctx)
    },
  })
  await root.plugin(runtimeRegistry, {})
  const binding = root.plugin(managedToolExecutionLocal, factoryConfig())
  cleanup.unshift(async () => {
    await lifetime.close()
    await root.fiber.dispose()
  })
  await binding
  return { native, root, lifetime, binding, start, retain }
}

test('managed Tool binding consumes the actual native factory through the narrow startup service', async () => {
  const f = await fixture()
  await expect.poll(() => f.native.pool()).toBeDefined()
  await f.native.pool()!.ready
  await expect
    .poll(async () => (await f.root.toolRuntimeRegistry.acquire(access, ref)).kind)
    .toBe('rejected')
  await expect
    .poll(async () => await f.root.toolRuntimeRegistry.acquire(access, ref))
    .toMatchObject({ reason: 'notAuthorized' })
  expect(f.start).toHaveBeenCalledExactlyOnceWith(factoryConfig())
  expect(f.retain).toHaveBeenCalledOnce()
  expect(f.native.borrow).not.toHaveBeenCalled()
  expect(f.native.enumerate).not.toHaveBeenCalled()
  expect((await f.lifetime.close()).complete).toBe(true)
  expect(await f.native.pool()!.operations.acquire(access, ref)).toMatchObject({
    reason: 'ownerStopped',
  })
  expect(await f.root.toolRuntimeRegistry.acquire(access, ref)).toMatchObject({
    reason: 'runtimeUnavailable',
  })
})

test('withdrawal during native recovery waits for the original read and never publishes the pool', async () => {
  const entered = Promise.withResolvers<void>()
  const resume = Promise.withResolvers<void>()
  const f = await fixture(async native => {
    const read = native.support.storage.read.bind(native.support.storage)
    vi.spyOn(native.support.storage, 'read').mockImplementationOnce(async use => {
      entered.resolve()
      await resume.promise
      return read(use)
    })
  })
  try {
    await entered.promise
    expect(f.retain).toHaveBeenCalledOnce()
    expect(await f.root.toolRuntimeRegistry.acquire(access, ref)).toMatchObject({
      reason: 'runtimeUnavailable',
    })
    let closed = false
    const closing = f.lifetime.close().then(result => {
      closed = true
      return result
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    resume.resolve()
    expect(await closing).toEqual({
      complete: false,
      assemblyErrors: [],
      rows: [{ id: 'tool-pool', result: { kind: 'failed', codes: ['setup'] } }],
    })
    expect(await f.native.pool()!.operations.acquire(access, ref)).toMatchObject({
      reason: 'ownerStopped',
    })
    expect(await f.root.toolRuntimeRegistry.acquire(access, ref)).toMatchObject({
      reason: 'runtimeUnavailable',
    })
  } finally {
    resume.resolve()
  }
})

test('a failed control handoff closes the original instance without publishing it', async () => {
  const f = await fixture(undefined, new Error('host cannot retain original control'))
  await expect.poll(() => f.retain.mock.calls.length).toBe(1)
  const report = await f.lifetime.close()
  expect(report.complete).toBe(false)
  expect(report.rows).toEqual([{ id: 'tool-pool', result: { kind: 'failed', codes: ['setup'] } }])
  expect(await f.native.pool()!.operations.acquire(access, ref)).toMatchObject({
    reason: 'ownerStopped',
  })
  expect(await f.root.toolRuntimeRegistry.acquire(access, ref)).toMatchObject({
    reason: 'runtimeUnavailable',
  })
})

test('the managed declaration no longer requests Session history or Runner selection', () => {
  expect(managedToolExecutionLocal.describeAssembly(factoryConfig())).toEqual({
    provides: [],
    requires: ['toolRuntimeRegistry', 'toolRuntimeStartup'],
    optional: [],
    dynamicProvides: [],
    dynamicRequires: [],
    claims: [],
  })
})
