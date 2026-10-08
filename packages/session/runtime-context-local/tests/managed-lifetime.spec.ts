import { expect, test } from 'vitest'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import { RUNTIME_CONTEXT } from '@omne-harness-lite/runtime-context/cordis'
import { managedHost } from './managed-fixture.ts'
import { scope, seed } from './fixture.ts'

test('setup readiness gates the trusted initializer and a late setup cannot reopen a stopped owner', async () => {
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  const h = await managedHost({
    beforeStorageRead: async () => {
      entered.resolve()
      await gate.promise
    },
  })
  // Observe a rejection before stopping the real assembly row.
  const ready = h.binding.ready.catch(error => error)
  try {
    await entered.promise
    expect(h.ctx.get(RUNTIME_CONTEXT)).toBeUndefined()
    expect(await h.binding.initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'unavailable',
    })
    const closing = h.lifetime.close()
    expect(await h.binding.initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'ownerStopped',
    })
    expect(h.releases).toBe(0)
    gate.resolve()
    expect(await ready).toBeInstanceOf(Error)
    expect(await closing).toMatchObject({
      complete: false,
      rows: [{ result: { kind: 'failed', codes: ['setup'] } }],
    })
    expect(h.ctx.get(RUNTIME_CONTEXT)).toBeUndefined()
    expect(h.releases).toBe(1)
    expect(await h.h.log.readSince(scope.session, 0)).toMatchObject({ entries: [] })
    expect(await h.lifetime.closeControl('context')?.closeAttempt()).toBe('closed')
  } finally {
    gate.resolve()
    await h.close()
  }
})

test('setup failure releases the original borrow without publishing the service', async () => {
  const h = await managedHost({
    beforeStorageRead: async () => {
      throw new StorageUnavailable('setup read cutpoint')
    },
  })
  try {
    await expect(h.binding.ready).rejects.toBeInstanceOf(StorageUnavailable)
    expect(await h.lifetime.closed).toMatchObject({
      complete: false,
      rows: [{ result: { codes: ['setup'] } }],
    })
    expect(h.ctx.get(RUNTIME_CONTEXT)).toBeUndefined()
    expect(h.borrows).toBe(1)
    expect(h.releases).toBe(1)
    expect(await h.binding.initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'ownerStopped',
    })
  } finally {
    await h.close()
  }
})

test('unload retains the same original borrow when release fails and retry does not reacquire dependencies', async () => {
  let unavailable = true
  const h = await managedHost({
    release: async () => {
      if (unavailable) throw new Error('original borrow release unavailable')
    },
  })
  try {
    await h.binding.ready
    expect(await h.binding.initializer.initializeContextSession(scope, seed)).toHaveProperty(
      'kind',
      'applied',
    )
    const disposing = h.fiber.dispose()
    const control = h.lifetime.closeControl('context')
    expect(control).toBeDefined()
    expect(await control!.closeAttempt()).toBe('retained')
    expect(h.releases).toBe(0)
    expect(h.borrows).toBe(1)
    expect(await h.binding.initializer.initializeContextSession(scope, seed)).toMatchObject({
      reason: 'ownerStopped',
    })
    expect(await h.h.log.readSince(scope.session, 0)).toHaveProperty('tail', 1)
    unavailable = false
    expect(await control!.retryClose()).toBe('closed')
    expect(h.lifetime.closeControl('context')).toBe(control)
    await disposing
    expect(h.releases).toBe(1)
    expect(h.borrows).toBe(1)
  } finally {
    unavailable = false
    await h.close()
  }
})
