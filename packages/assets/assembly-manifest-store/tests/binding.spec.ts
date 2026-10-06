import { Context } from '@deepseek-ai/cordis'
import { expect, test, vi } from 'vitest'
import {
  AssemblyManifestService,
  ASSEMBLY_MANIFEST_RESOURCES,
} from '@omne-harness-lite/assembly-manifest/cordis'
import { SqlStorageService } from '@omne-harness-lite/storage-sql/cordis'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  assemblyManifestStorePlugin,
  AssemblyManifestResourcesService,
  AssemblyManifestStoreService,
} from '../src/cordis.ts'
import { createAssemblyManifestStore } from '../src/index.ts'
import { database, input } from './support.ts'

test('required services hold pending and callback configuration is rejected', async () => {
  const ctx = new Context()
  const consumer = ctx.plugin(assemblyManifestStorePlugin, {})
  await consumer
  expect(consumer.state).toBe(FIBER_STATE.PENDING)
  expect(ctx.get('assemblyManifest')).toBeUndefined()
  expect(() => new AssemblyManifestResourcesService(ctx, { diagnostic: () => {} })).toThrow(
    'diagnostic failure port is required',
  )
  expect(ctx.get(ASSEMBLY_MANIFEST_RESOURCES)).toBeUndefined()
  await database(async storage => {
    const badContext = new Context()
    new SqlStorageService(badContext, storage)
    new AssemblyManifestResourcesService(badContext)
    const bad = badContext.plugin(assemblyManifestStorePlugin, { diagnostic: () => {} } as never)
    await expect(Promise.resolve(bad)).rejects.toThrow()
    expect(bad.state).toBe(FIBER_STATE.FAILED)
    expect(badContext.get('assemblyManifest')).toBeUndefined()
  })
  await consumer.dispose()
})

test('resource withdrawal preserves blocked generation until actual drain and replacement uses new ports', async () => {
  await database(async storage => {
    const ctx = new Context()
    const storageFiber = await ctx.plugin((inner: Context) => {
      new SqlStorageService(inner, storage)
    })
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    const events: unknown[] = [],
      failures: unknown[] = []
    let oldReads = 0,
      newReads = 0
    const resourceFiber = await ctx.plugin((inner: Context) => {
      new AssemblyManifestResourcesService(inner, {
        presenceSource: {
          async read() {
            oldReads++
            entered.resolve()
            await release.promise
            return { svc: 'present' } as const
          },
        },
        diagnostic: event => {
          events.push(event)
          throw Error('private output failure')
        },
        diagnosticFailure: fact => {
          failures.push(fact)
          throw Error('private failure output')
        },
      })
    })
    const consumer = await ctx.plugin(assemblyManifestStorePlugin, {})
    const old = ctx.assemblyManifest
    expect(old).toBeInstanceOf(AssemblyManifestService)
    expect(old).toBeInstanceOf(AssemblyManifestStoreService)
    if (!(old instanceof AssemblyManifestStoreService)) throw Error('wrong concrete provider')
    let closed = false
    void old.closed.then(() => {
      closed = true
    })
    const active = old.dependencyPresence('alpha', ['svc'])
    await entered.promise
    const removal = resourceFiber.dispose()
    try {
      await vi.waitFor(() => expect(ctx.get(ASSEMBLY_MANIFEST_RESOURCES)).toBeUndefined())
      expect(closed).toBe(false)
      expect(events).toHaveLength(0)
      const stopped = [
        old.readHead('alpha'),
        old.append('alpha', 0, input(1, 'given', 'old_a')),
        old.readHistory('alpha', 'tool', 1),
        old.readEvaluation('alpha'),
        old.readGiven('alpha', 0),
        old.dependencyPresence('alpha', ['svc']),
      ]
      expect(await Promise.all(stopped)).toEqual(Array(6).fill({ failure: 'unavailable' }))
      expect(await old.readHead(null)).toEqual({ failure: 'invalidInput' })
      expect(await storage.read(async () => 'borrowed-still-open')).toBe('borrowed-still-open')
      expect(closed).toBe(false)
    } finally {
      release.resolve()
    }
    expect(await active).toEqual({ presence: { svc: 'present' } })
    await old.closed
    await removal
    expect(closed).toBe(true)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      operation: 'dependencyPresence',
      resourceEnded: true,
      result: 'success',
    })
    expect(failures).toEqual([{ kind: 'manifest_diagnostic_unavailable' }])
    const replacement = await ctx.plugin((inner: Context) => {
      new AssemblyManifestResourcesService(inner, {
        presenceSource: {
          async read() {
            newReads++
            return { svc: 'absent' } as const
          },
        },
      })
    })
    await vi.waitFor(() =>
      expect(ctx.assemblyManifest).toBeInstanceOf(AssemblyManifestStoreService),
    )
    const fresh = ctx.assemblyManifest
    expect(fresh).not.toBe(old)
    expect(await fresh.dependencyPresence('alpha', ['svc'])).toEqual({
      presence: { svc: 'absent' },
    })
    expect([oldReads, newReads]).toEqual([1, 1])
    expect(await old.dependencyPresence('alpha', ['svc'])).toEqual({ failure: 'unavailable' })
    await consumer.dispose()
    if (!(fresh instanceof AssemblyManifestStoreService)) throw Error('wrong replacement')
    await fresh.closed
    await replacement.dispose()
    await storageFiber.dispose()
    expect(await storage.read(async () => 'owner-still-owns-storage')).toBe(
      'owner-still-owns-storage',
    )
  })
})

test('repeated disposal cannot substitute for a stable drain observation', async () => {
  await database(async storage => {
    const ctx = new Context()
    const entered = Promise.withResolvers<void>(),
      release = Promise.withResolvers<void>()
    const actual = storage.read.bind(storage)
    let held = false
    // Publish the same captured read function that is instrumented by this oracle.
    const spy = vi.spyOn(storage, 'read').mockImplementation(fn =>
      held
        ? actual(async tx => {
            entered.resolve()
            await release.promise
            return fn(tx)
          })
        : actual(fn),
    )
    new SqlStorageService(ctx, storage)
    new AssemblyManifestResourcesService(ctx)
    const consumer = await ctx.plugin(assemblyManifestStorePlugin, {})
    const service = ctx.assemblyManifest
    if (!(service instanceof AssemblyManifestStoreService)) throw Error('wrong provider')
    await service.readHead('alpha')
    held = true
    const active = service.readHead('alpha')
    await entered.promise
    let completed = false
    void service.closed.then(() => {
      completed = true
    })
    const original = consumer.dispose()
    const repeated = Promise.resolve(consumer.dispose())
    expect(completed).toBe(false)
    release.resolve()
    expect(await active).toEqual({ head: 0, latest: {} })
    await original
    await repeated
    await service.closed
    expect(completed).toBe(true)
    spy.mockRestore()
  })
})

test('close failure stays observable and does not certify release', async () => {
  await database(async storage => {
    const ctx = new Context()
    const store = createAssemblyManifestStore(storage)
    const fault = Error('controlled close defect')
    const fiber = await ctx.plugin((inner: Context) => {
      new AssemblyManifestStoreService(inner, { ...store, close: () => Promise.reject(fault) })
    })
    const service = ctx.assemblyManifest
    if (!(service instanceof AssemblyManifestStoreService)) throw Error('wrong provider')
    const observed = expect(service.closed).rejects.toBe(fault)
    await fiber.dispose()
    await observed
    await store.close()
  })
})

test('top-level port snapshot preserves bare diagnostics and the source receiver', async () => {
  await database(async storage => {
    const ctx = new Context()
    new SqlStorageService(ctx, storage)
    const diagnosticReceivers: unknown[] = [],
      sourceReceivers: unknown[] = []
    const source = {
      async read(this: unknown) {
        sourceReceivers.push(this)
        return { svc: 'present' } as const
      },
    }
    const supplied = {
      presenceSource: source,
      diagnostic(this: unknown) {
        diagnosticReceivers.push(this)
        throw Error('bounded diagnostic fault')
      },
      diagnosticFailure(this: unknown) {
        diagnosticReceivers.push(this)
      },
    }
    new AssemblyManifestResourcesService(ctx, supplied)
    supplied.presenceSource = {
      async read() {
        throw Error('mutated option must not be captured')
      },
    }
    supplied.diagnostic = () => {
      throw Error('mutated option must not be captured')
    }
    const fiber = await ctx.plugin(assemblyManifestStorePlugin, {})
    expect(await ctx.assemblyManifest.dependencyPresence('alpha', ['svc'])).toEqual({
      presence: { svc: 'present' },
    })
    expect(sourceReceivers).toEqual([source])
    expect(diagnosticReceivers).toEqual([undefined, undefined])
    const selected = ctx.assemblyManifest
    if (!(selected instanceof AssemblyManifestStoreService)) throw Error('wrong provider')
    await fiber.dispose()
    await selected.closed
  })
})
