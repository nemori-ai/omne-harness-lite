import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { createAssemblyLifetime, type AssemblyLifetimePort, type OwnedWork } from '../src/index.ts'
import { AssemblyLifetimeService, startAssemblyWork } from '../src/cordis.ts'

class PortService extends AssemblyLifetimeService {
  constructor(
    ctx: Context,
    readonly port: AssemblyLifetimePort,
  ) {
    super(ctx)
  }
  isCurrent = () => this.port.isCurrent()
  register = (work: OwnedWork) => this.port.register(work)
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    lifecycleTestResource: { read(): string }
  }
}

test('managed setup remains owned after its active fiber is withdrawn', async () => {
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  const ctx = new Context()
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let readiness: Promise<void> | undefined
  let closes = 0
  let acquired = false
  let disposed = false
  const port = lifetime.port('row')
  const provider = await ctx.plugin(inner => {
    new PortService(inner, {
      isCurrent: () => port.isCurrent(),
      register(work) {
        readiness = work.ready
        return port.register(work)
      },
    })
  })
  const caller = await ctx.plugin({
    inject: ['assemblyLifetime'],
    apply(inner) {
      startAssemblyWork(
        inner,
        async () => {
          started.resolve()
          await release.promise
          acquired = true
        },
        async () => {
          expect(acquired).toBe(true)
          acquired = false
          closes++
        },
      )
    },
  })
  await started.promise
  const disposal = Promise.resolve(caller.dispose()).then(() => {
    disposed = true
  })
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(lifetime.isCurrent()).toBe(false)
    expect(disposed).toBe(false)
    expect(closes).toBe(0)
    const failed = expect(readiness).rejects.toThrow()
    release.resolve()
    await failed
    expect((await lifetime.closed).rows).toEqual([
      { id: 'row', result: { kind: 'failed', codes: ['setup'] } },
    ])
    await disposal
    expect(acquired).toBe(false)
    expect(closes).toBe(1)
  } finally {
    release.resolve()
    await lifetime.close()
    await disposal
    await provider.dispose()
  }
})

test('forced dependency withdrawal preserves the admitted caller continuation', async () => {
  const lifetime = createAssemblyLifetime(['backend', 'caller'], () => {})
  lifetime.tryClaim()
  const ctx = new Context()
  const backendScope = ctx.isolate('assemblyLifetime')
  const callerScope = ctx.isolate('assemblyLifetime')
  const backendPort = await backendScope.plugin(inner => {
    new PortService(inner, lifetime.port('backend'))
  })
  const callerPort = await callerScope.plugin(inner => {
    new PortService(inner, lifetime.port('caller'))
  })
  const release = Promise.withResolvers<void>()
  const draining = Promise.withResolvers<void>()
  const order: string[] = []
  let alive = true
  const resource = {
    read() {
      if (!alive) throw new Error('backend closed')
      return 'saved'
    },
  }
  const backend = await backendScope.plugin({
    name: 'lifecycle-test-backend',
    inject: ['assemblyLifetime'],
    apply(inner) {
      const receipt = inner.assemblyLifetime.register({
        ready: Promise.resolve(),
        async close() {
          alive = false
          order.push('backend closed')
        },
      })
      inner.effect(() => async () => {
        receipt.requestStop()
        await receipt.closed
      })
      inner.provide('lifecycleTestResource', resource)
    },
  })
  const caller = await callerScope.plugin({
    name: 'lifecycle-test-caller',
    inject: ['assemblyLifetime', 'lifecycleTestResource'],
    apply(inner) {
      const captured = inner.lifecycleTestResource
      const receipt = inner.assemblyLifetime.register({
        ready: Promise.resolve(),
        async close() {
          order.push('caller stopping')
          draining.resolve()
          await release.promise
          order.push(captured.read())
          order.push('caller closed')
        },
      })
      inner.effect(() => async () => {
        receipt.requestStop()
        await receipt.closed
      })
    },
  })
  let disposed = false
  const disposal = Promise.resolve(backend.dispose()).then(() => {
    disposed = true
  })
  try {
    await draining.promise
    expect(lifetime.isCurrent()).toBe(false)
    expect(alive).toBe(true)
    expect(disposed).toBe(false)
    expect(order).toEqual(['caller stopping'])
    release.resolve()
    expect((await lifetime.closed).complete).toBe(true)
    await disposal
    expect(order).toEqual(['caller stopping', 'saved', 'caller closed', 'backend closed'])
  } finally {
    release.resolve()
    await lifetime.close()
    await disposal
    await caller.dispose()
    await callerPort.dispose()
    await backendPort.dispose()
  }
})

test('the direct-close negative control breaks a late consumer read', async () => {
  const ctx = new Context()
  let alive = true
  const resource = {
    read() {
      if (!alive) throw new Error('backend closed')
      return 'saved'
    },
  }
  const backend = await ctx.plugin(inner => {
    inner.provide('lifecycleTestResource', resource)
    inner.effect(() => () => {
      alive = false
    })
  })
  const release = Promise.withResolvers<void>()
  const called = Promise.withResolvers<void>()
  const result = Promise.withResolvers<string>()
  const caller = await ctx.plugin({
    inject: ['lifecycleTestResource'],
    apply(inner) {
      const captured = inner.lifecycleTestResource
      void release.promise.then(() => captured.read()).then(result.resolve, result.reject)
      called.resolve()
    },
  })
  await called.promise
  await backend.dispose()
  const rejected = expect(result.promise).rejects.toThrow('backend closed')
  release.resolve()
  await rejected
  await caller.dispose()
})

test('real inactive-fiber effect installation failure does not strand ready', async () => {
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  const ready = Promise.withResolvers<void>()
  const install = Promise.withResolvers<() => void>()
  const ctx = new Context()
  let resources = 0
  let closes = 0
  const fiber = await ctx.plugin(inner => {
    const receipt = lifetime.port('row').register({
      ready: ready.promise,
      async close() {
        closes++
      },
    })
    install.resolve(() => {
      try {
        inner.effect(() => async () => {
          receipt.requestStop()
          await receipt.closed
        })
        resources++
        ready.resolve()
      } catch (error) {
        ready.reject(error)
        receipt.requestStop()
        throw error
      }
    })
  })
  await fiber.dispose()
  const lateInstall = await install.promise
  expect(lateInstall).toThrow()
  expect(await lifetime.closed).toEqual({
    complete: false,
    assemblyErrors: [],
    rows: [{ id: 'row', result: { kind: 'failed', codes: ['setup'] } }],
  })
  expect(resources).toBe(0)
  expect(closes).toBe(1)
})

test('negative control: async apply delays the stop effect until setup ends', async () => {
  const lifetime = createAssemblyLifetime(['row'], () => {})
  lifetime.tryClaim()
  const ready = Promise.withResolvers<void>()
  const installed = Promise.withResolvers<void>()
  const releaseSetup = Promise.withResolvers<void>()
  const ctx = new Context()
  let alive = false
  let closes = 0
  const fiber = ctx.plugin({
    async apply(inner) {
      const receipt = lifetime.port('row').register({
        ready: ready.promise,
        async close() {
          closes++
          alive = false
        },
      })
      inner.effect(() => async () => {
        receipt.requestStop()
        await receipt.closed
      })
      alive = true
      installed.resolve()
      await releaseSetup.promise
      ready.resolve()
    },
  })
  // Observe the real startup thenable even when disposal interrupts activation.
  const startup = Promise.resolve(fiber).then(
    () => 'ready',
    () => 'stopped',
  )
  await installed.promise
  const disposal = Promise.resolve(fiber.dispose())
  try {
    await new Promise<void>(resolve => setImmediate(resolve))
    // This is the original startup counterexample, not a valid managed binding.
    expect(lifetime.isCurrent()).toBe(true)
    expect(alive).toBe(true)
    expect(closes).toBe(0)
    releaseSetup.resolve()
    expect((await lifetime.closed).rows).toEqual([{ id: 'row', result: { kind: 'closed' } }])
    await disposal
    await startup
    expect(alive).toBe(false)
    expect(closes).toBe(1)
  } finally {
    releaseSetup.resolve()
    await lifetime.close()
    await disposal
    await startup
  }
})
