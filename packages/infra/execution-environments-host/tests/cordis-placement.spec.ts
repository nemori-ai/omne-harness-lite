import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { ResourceRecoveryAuthorityService } from '@omne-harness-lite/execution-environments/cordis'
import { environmentRegistry } from '../src/cordis.ts'
import { fixture } from './protocol-fixture.ts'

test('the caller Cordis fiber owns placement authority and waits for its original read', async () => {
  const f = fixture(),
    ctx = new Context(),
    entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>()
  class Access extends SessionAccessService {
    authorize = f.access.authorize
  }
  class Recovery extends ResourceRecoveryAuthorityService {
    async authorizeRecovery() {
      return 'notAuthorized' as const
    }
  }
  const dependencies = await ctx.plugin({
    name: 'environment-test-dependencies',
    apply(inner: Context) {
      new Access(inner)
      new Recovery(inner)
    },
  })
  const registry = await ctx.plugin(environmentRegistry, {})
  const provider = await ctx.plugin({
    name: 'environment-test-provider',
    inject: ['executionEnvironments'],
    apply(inner: Context) {
      inner.executionEnvironments.registerProvider(f.provider)
    },
  })
  const source = await ctx.plugin({
    name: 'environment-test-placement',
    inject: ['executionEnvironments'],
    apply(inner: Context) {
      inner.executionEnvironments.registerPlacementSource({
        ...f.source,
        async read(...args) {
          entered.resolve()
          await resume.promise
          return f.source.read(...args)
        },
      })
    },
  })
  try {
    const acquiring = ctx.executionEnvironments.acquire(f.request())
    await entered.promise
    const closing = source.dispose()
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(await ctx.executionEnvironments.acquire(f.request())).toMatchObject({
      reason: 'policyUnavailable',
    })
    expect(closed).toBe(false)
    resume.resolve()
    expect(await acquiring).toMatchObject({ reason: 'placementChanged' })
    await closing
    expect(f.provider.acquire).not.toHaveBeenCalled()
    const replacement = await ctx.plugin({
      name: 'environment-test-new-placement',
      inject: ['executionEnvironments'],
      apply(inner: Context) {
        inner.executionEnvironments.registerPlacementSource(f.source)
      },
    })
    try {
      expect((await ctx.executionEnvironments.acquire(f.request())).kind).toBe('acquired')
    } finally {
      await replacement.dispose()
    }
  } finally {
    resume.resolve()
    await source.dispose()
    await provider.dispose()
    await registry.dispose()
    await dependencies.dispose()
    await ctx.fiber.dispose()
    await f.dispose()
  }
})
