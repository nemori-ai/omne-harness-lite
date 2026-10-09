import { expect, test } from 'vitest'
import { StorageDefect } from '@omne-harness-lite/storage'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import { createRuntimeContextLocal } from '../src/cordis.ts'
import { composePluginTree } from '@omne-harness-lite/cordis-plugin-tree'
import { preparePluginTree } from '@omne-harness-lite/cordis-plugin-tree/cordis'
import { z } from 'zod'
import { managedHost } from './managed-fixture.ts'
import { at, host, init, reader, scope, seed, source } from './fixture.ts'

test('one factory rejects a second independent Context without replacing its original owner', async () => {
  const first = await managedHost()
  let second: Awaited<ReturnType<typeof managedHost>> | undefined
  try {
    await first.binding.ready
    const initial = await first.binding.initializer.initializeContextSession(scope, seed)
    expect(initial.kind).toBe('applied')
    await expect(
      managedHost({ binding: first.binding }).then(value => {
        second = value
        return value
      }),
    ).rejects.toThrow()
    expect(first.borrows).toBe(1)
    expect(first.releases).toBe(0)
    expect(await first.binding.initializer.initializeContextSession(scope, seed)).toEqual(initial)
    expect(await first.ctx.runtimeContext.registrations(first.h.access, scope)).toHaveProperty(
      'kind',
      'registrations',
    )
  } finally {
    await second?.close()
    await first.close()
  }
})

test('trusted initialization emits the typed wake-up, and a listener failure does not undo the fact', async () => {
  const h = await managedHost()
  let wakes = 0
  const dispose = h.ctx.on('runtime-context/cache-invalidated', () => {
    wakes++
    throw new Error('controlled wake-up listener failure')
  })
  try {
    await h.binding.ready
    expect(await h.binding.initializer.initializeContextSession(scope, seed)).toHaveProperty(
      'kind',
      'applied',
    )
    expect(wakes).toBe(1)
    expect(await h.h.log.readSince(scope.session, 0)).toHaveProperty('tail', 1)
    expect(await h.binding.initializer.initializeContextSession(scope, seed)).toHaveProperty(
      'kind',
      'applied',
    )
    expect(wakes).toBe(1)
  } finally {
    dispose()
    await h.close()
  }
})

test('the injected clock controls publication; an unavailable clock adds no durable content fact', async () => {
  const parsed = instantFromRfc3339(at)
  if (!('ok' in parsed)) throw new Error('clock fixture invalid')
  let available = true
  const h = await managedHost({ now: async () => (available ? parsed.ok : 'unavailable') })
  try {
    await h.binding.ready
    await h.binding.initializer.initializeContextSession(scope, seed)
    const handle = h.ctx.runtimeContext.registerSource(source())
    const registrations = await h.ctx.runtimeContext.registrations(h.h.access, scope)
    if (registrations.kind !== 'registrations') throw new Error('registration fixture absent')
    expect(
      await h.ctx.runtimeContext.register(
        h.h.access,
        scope,
        { ...seed.required[0]!, key: 'public', required: false },
        registrations.revision,
      ),
    ).toHaveProperty('kind', 'applied')
    const initial = await h.ctx.runtimeContext.update(
      h.h.publisher,
      scope,
      { key: 'public', value: 'initial' },
      'absent',
    )
    if (initial.kind !== 'applied') throw new Error('publication fixture failed')
    const prior = await h.h.log.readSince(scope.session, 0)
    available = false
    expect(
      await h.ctx.runtimeContext.update(
        h.h.publisher,
        scope,
        { key: 'public', value: 'later' },
        initial.revision,
      ),
    ).toMatchObject({ reason: 'unavailable' })
    expect(await h.h.log.readSince(scope.session, 0)).toEqual(prior)
    available = true
    expect(
      await h.ctx.runtimeContext.update(
        h.h.publisher,
        scope,
        { key: 'public', value: 'later' },
        initial.revision,
      ),
    ).toHaveProperty('kind', 'applied')
    await handle.dispose()
  } finally {
    available = true
    await h.close()
  }
})

test.each(['read', 'write'] as const)(
  'a StorageDefect in %s propagates instead of becoming unavailable',
  async point => {
    let fault: 'off' | 'read' | 'write' = 'off'
    const defect = new StorageDefect('controlled storage programming defect')
    const h = await host(undefined, storage => ({
      ...storage,
      read: fn => {
        if (fault === 'read') throw defect
        return storage.read(fn)
      },
      write: fn => {
        if (fault === 'write') throw defect
        return storage.write(fn)
      },
    }))
    try {
      const revision = await init(h)
      const bound = await reader(h)
      fault = point
      const operation =
        point === 'read'
          ? bound.read(['identity'])
          : h.owner.operations.register(
              h.access,
              scope,
              { ...seed.required[0]!, key: 'public', required: false },
              revision,
            )
      await expect(operation).rejects.toBe(defect)
    } finally {
      fault = 'off'
      await h.close()
    }
  },
)

test('stopping admission while initialization awaits storage rejects before a log append', async () => {
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  let blocked = false
  const h = await managedHost({
    beforeStorageRead: async () => {
      if (blocked) {
        entered.resolve()
        await release.promise
      }
    },
  })
  try {
    await h.binding.ready
    blocked = true
    const initializing = h.binding.initializer.initializeContextSession(scope, seed)
    await entered.promise
    h.binding.closeAdmission()
    blocked = false
    release.resolve()
    expect(await initializing).toMatchObject({ kind: 'rejected', reason: 'ownerStopped' })
    expect(await h.h.log.readSince(scope.session, 0)).toEqual({ entries: [], tail: 0 })
  } finally {
    blocked = false
    release.resolve()
    await h.close()
  }
})

test('assembly declarations reject live configuration before admission', () => {
  const binding = createRuntimeContextLocal()
  expect(() => binding.plugin.describeAssembly({ callback: () => {} })).toThrow()
})

test('actual tree preparation verifies the consumer and every required external dependency', async () => {
  const binding = createRuntimeContextLocal()
  const consumer = {
    assemblyLifecycle: 1,
    Config: z.object({}).strict(),
    describeAssembly: () => ({
      provides: [],
      requires: ['runtimeContext'],
      optional: [],
      dynamicProvides: [],
      dynamicRequires: [],
      claims: [],
    }),
    apply() {},
  }
  const rows = composePluginTree([
    { id: 'context', plugin: { package: '@test/context', export: 'provider' }, config: {} },
    { id: 'consumer', plugin: { package: '@test/consumer', export: 'provider' }, config: {} },
  ])
  const services = ['sessionLogBacking', 'sessionAccess', 'clock', 'storage']
  const resolveModule = async (reference: { package: string }) => ({
    provider: reference.package === '@test/context' ? binding.plugin : consumer,
  })
  await expect(
    preparePluginTree(rows, { externalServices: services, resolveModule }),
  ).resolves.toHaveProperty('ids', ['context', 'consumer'])
  for (const missing of services) {
    await expect(
      preparePluginTree(rows, {
        externalServices: services.filter(service => service !== missing),
        resolveModule,
      }),
    ).rejects.toThrow()
  }
})
