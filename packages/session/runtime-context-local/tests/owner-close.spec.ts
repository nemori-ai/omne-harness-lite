import { setImmediate } from 'node:timers/promises'
import { expect, test, vi } from 'vitest'
import { createRuntimeContext } from '../src/index.ts'
import { at, scope, seed, host, init } from './fixture.ts'

test('close drains an admitted authority call and prevents subsequent business IO', async () => {
  const h = await host()
  try {
    await init(h)
    const gate = Promise.withResolvers<void>(),
      entered = Promise.withResolvers<void>()
    const original = vi.mocked(h.auth.operations.authorize).getMockImplementation()
    if (!original) throw new Error('fixture authority implementation missing')
    vi.spyOn(h.auth.operations, 'authorize').mockImplementation(async (...args) => {
      entered.resolve()
      await gate.promise
      return original(...args)
    })
    h.observedLog.readSince.mockClear()
    const admitted = h.owner.operations.registrations(h.access, scope)
    await entered.promise
    h.owner.closeAdmission()
    let drained = false
    const closing = h.owner.drain().then(() => {
      drained = true
    })
    await setImmediate()
    expect(drained).toBe(false)
    gate.resolve()
    expect(await admitted).toMatchObject({ reason: 'ownerStopped' })
    await closing
    expect(h.observedLog.readSince).not.toHaveBeenCalled()
    expect(await h.owner.initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'ownerStopped',
    })
  } finally {
    await h.close()
  }
})

test('initialization admitted before stop stays owned through a delayed original SQL read and cannot reopen admission', async () => {
  const h = await host()
  let owner: ReturnType<typeof createRuntimeContext> | undefined
  try {
    await init(h)
    h.owner.closeAdmission()
    await h.owner.drain()
    const gate = Promise.withResolvers<void>(),
      entered = Promise.withResolvers<void>()
    owner = createRuntimeContext({
      log: h.log,
      storage: {
        async read(fn) {
          entered.resolve()
          await gate.promise
          return h.storage.read(fn)
        },
        write: fn => h.storage.write(fn),
      },
      access: h.auth.operations,
      now: () => at,
    })
    const initializing = owner.initializer.initializeContextSession(scope, seed)
    await entered.promise
    owner.closeAdmission()
    let drained = false
    const closing = owner.drain().then(() => {
      drained = true
    })
    await setImmediate()
    expect(drained).toBe(false)
    gate.resolve()
    expect(await initializing).toHaveProperty('kind', 'applied')
    await closing
    expect(await owner.operations.bind(h.tool, scope, 'tool')).toMatchObject({
      reason: 'ownerStopped',
    })
    expect(await owner.initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'ownerStopped',
    })
  } finally {
    owner?.closeAdmission()
    await owner?.drain()
    await h.close()
  }
})
