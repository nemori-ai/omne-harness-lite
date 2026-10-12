import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { SqlStorageService } from '@omne-harness-lite/storage-sql/cordis'
import { SessionLogAuthorityService } from '@omne-harness-lite/session-log/cordis'
import { createAssemblyLifetime } from '@omne-harness-lite/assembly-lifecycle'
import { AssemblyLifetimeService } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { createSessionLogSql } from '@omne-harness-lite/session-log-sql/cordis'
import { boot, request, scope } from './support.ts'

test('public Cordis services share the original SQL journal and retain an unreleased borrow on withdrawal', async () => {
  const h = await boot(),
    ctx = new Context(),
    factory = createSessionLogSql()
  await h.log.close()
  const lifetime = createAssemblyLifetime(['journal'], () => {})
  expect(lifetime.tryClaim()).toBe(true)
  const port = lifetime.port('journal')
  class Authority extends SessionLogAuthorityService {
    storage = h.storage
    authorize = h.authority.authorize
    authorizeEnumeration = h.authority.authorizeEnumeration
  }
  class Lifetime extends AssemblyLifetimeService {
    isCurrent = port.isCurrent
    register = port.register
    retainClose = port.retainClose
  }
  const dependencies = await ctx.plugin({
    name: 'journal-dependencies',
    apply(inner: Context) {
      new SqlStorageService(inner, h.storage)
      new Authority(inner)
      new Lifetime(inner)
    },
  })
  const mounted = await ctx.plugin(factory.plugin, { operationLimit: 8 })
  await factory.ready
  let activations = 0,
    withdrawals = 0
  const consumer = await ctx.plugin({
    name: 'journal-consumer',
    inject: ['sessionLog'],
    apply(inner: Context) {
      activations++
      inner.effect(() => () => {
        withdrawals++
      })
    },
  })
  const held = await ctx.sessionLogOwner.borrow(h.access, scope)
  if (held.kind !== 'borrowed') throw new Error('Journal borrow failed')
  const r = request()
  expect(
    await h.storage.atomic(unit => ctx.sessionLogParticipant.appendIn(unit, h.access, r)),
  ).toHaveProperty('kind', 'staged')
  expect(await held.log.readSince(scope.session, 0)).toHaveProperty('tail', 1)
  expect(activations).toBe(1)
  const disposing = mounted.dispose()
  const control = lifetime.closeControl('journal')
  if (!control) throw new Error('Retained close control missing')
  expect(await control.closeAttempt()).toBe('retained')
  expect(withdrawals).toBe(1)
  expect(await held.log.readSince(scope.session, 0)).toEqual({ failure: 'unavailable' })
  await held.release()
  expect(await control.retryClose()).toBe('closed')
  await disposing
  expect((await lifetime.close()).complete).toBe(true)
  await consumer.dispose()
  await dependencies.dispose()
  await ctx.fiber.dispose()
  await h.close()
})

test('withdrawal during the setup transaction rejects readiness before publishing any old-generation service', async () => {
  const h = await boot(),
    ctx = new Context(),
    factory = createSessionLogSql()
  await h.log.close()
  const entered = Promise.withResolvers<void>(),
    proceed = Promise.withResolvers<void>()
  const read = h.storage.read.bind(h.storage)
  let block = true
  h.storage.read = async callback => {
    const result = await read(callback)
    if (block) {
      entered.resolve()
      await proceed.promise
    }
    return result
  }
  const lifetime = createAssemblyLifetime(['journal'], () => {})
  expect(lifetime.tryClaim()).toBe(true)
  const port = lifetime.port('journal')
  class Authority extends SessionLogAuthorityService {
    storage = h.storage
    authorize = h.authority.authorize
    authorizeEnumeration = h.authority.authorizeEnumeration
  }
  class Lifetime extends AssemblyLifetimeService {
    isCurrent = port.isCurrent
    register = port.register
    retainClose = port.retainClose
  }
  const dependencies = await ctx.plugin({
    name: 'journal-dependencies',
    apply(inner: Context) {
      new SqlStorageService(inner, h.storage)
      new Authority(inner)
      new Lifetime(inner)
    },
  })
  const mounted = await ctx.plugin(factory.plugin, { operationLimit: 8 })
  await entered.promise
  const closing = lifetime.close()
  expect(port.isCurrent()).toBe(false)
  block = false
  proceed.resolve()
  await expect(factory.ready).rejects.toThrow('session log owner stopped')
  expect(ctx.get('sessionLog')).toBeUndefined()
  expect(ctx.get('sessionLogOwner')).toBeUndefined()
  expect(ctx.get('sessionLogBacking')).toBeUndefined()
  expect(ctx.get('sessionLogParticipant')).toBeUndefined()
  expect((await closing).complete).toBe(false)
  await mounted.dispose()
  // Failed setup did not claim the original physical journal ownership.
  const { openSqlSessionLog } = await import('@omne-harness-lite/session-log-sql')
  const replacement = openSqlSessionLog({
    storage: h.storage,
    authority: h.authority,
    operationLimit: 8,
  })
  await replacement.close()
  await dependencies.dispose()
  await ctx.fiber.dispose()
  await h.close()
})

test('two actual SQL instances of the same file fail the Cordis startup instance check without claiming a journal owner', async () => {
  const h = await boot(),
    ctx = new Context(),
    factory = createSessionLogSql()
  await h.log.close()
  const { openStorage } = await import('@omne-harness-lite/storage-sql')
  const other = await openStorage({
    dialect: 'sqlite',
    file: h.file,
    synchronous: 'full',
    upgrade: false,
  })
  const lifetime = createAssemblyLifetime(['journal'], () => {})
  expect(lifetime.tryClaim()).toBe(true)
  const port = lifetime.port('journal')
  class Authority extends SessionLogAuthorityService {
    storage = other
    authorize = h.authority.authorize
    authorizeEnumeration = h.authority.authorizeEnumeration
  }
  class Lifetime extends AssemblyLifetimeService {
    isCurrent = port.isCurrent
    register = port.register
    retainClose = port.retainClose
  }
  const dependencies = await ctx.plugin({
    name: 'journal-dependencies',
    apply(inner: Context) {
      new SqlStorageService(inner, h.storage)
      new Authority(inner)
      new Lifetime(inner)
    },
  })
  const mounted = await ctx.plugin(factory.plugin, { operationLimit: 8 })
  await expect(factory.ready).rejects.toThrow('storage unit belongs to a different instance')
  expect(ctx.get('sessionLog')).toBeUndefined()
  expect(ctx.get('sessionLogOwner')).toBeUndefined()
  expect((await lifetime.close()).complete).toBe(false)
  await mounted.dispose()
  const { openSqlSessionLog } = await import('@omne-harness-lite/session-log-sql')
  const replacement = openSqlSessionLog({
    storage: h.storage,
    authority: h.authority,
    operationLimit: 8,
  })
  await replacement.close()
  await dependencies.dispose()
  await ctx.fiber.dispose()
  await other.close()
  await h.close()
})
