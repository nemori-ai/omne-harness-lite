import { Context } from '@deepseek-ai/cordis'
import { expect, test } from 'vitest'
import { SessionLogService } from '@omne-harness-lite/session-log/cordis'
import { SessionAccessService } from '@omne-harness-lite/session-tenancy/cordis'
import { ClockService } from '@omne-harness-lite/offer-expiry/cordis'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import type { ContextSourceHandle, ContextSource } from '@omne-harness-lite/runtime-context'
import { runtimeContextLocal } from '../src/cordis.ts'
import { host, init, scope, at } from './fixture.ts'

test('Cordis source contribution withdraws immediately and drains its original pending callback', async () => {
  const h = await host(),
    ctx = new Context(),
    entered = Promise.withResolvers<void>(),
    response = Promise.withResolvers<Awaited<ReturnType<ContextSource['read']>>>()
  const parsed = instantFromRfc3339(at)
  if (!('ok' in parsed)) throw new Error('clock fixture invalid')
  const instant = parsed.ok
  class Log extends SessionLogService {
    append = h.log.append
    readByKey = h.log.readByKey
    readSince = h.log.readSince
  }
  class Access extends SessionAccessService {
    authorize = h.auth.operations.authorize
  }
  class Time extends ClockService {
    now = () => instant
  }
  const dependencies = await ctx.plugin({
    name: 'context-test-dependencies',
    apply(inner: Context) {
      new Log(inner)
      new Access(inner)
      new Time(inner)
    },
  })
  const runtime = await ctx.plugin(runtimeContextLocal, {})
  let handle: ContextSourceHandle | undefined
  const contribution = await ctx.plugin({
    name: 'context-test-source',
    inject: ['runtimeContext'],
    apply(inner: Context) {
      handle = inner.runtimeContext.registerSource({
        name: 'session',
        recovery: 'reread_source',
        consumers: ['tool'],
        requiredKeys: [],
        async read() {
          entered.resolve()
          return response.promise
        },
      })
    },
  })
  try {
    await init(h)
    const current = await ctx.runtimeContext.registrations(h.access, scope)
    if (current.kind !== 'registrations') throw new Error('registration fixture missing')
    const registered = await ctx.runtimeContext.register(
      h.access,
      scope,
      {
        key: 'public',
        source: 'session',
        config: null,
        consumers: ['tool'],
        required: false,
        recovery: 'reread_source',
      },
      current.revision,
    )
    expect(registered.kind).toBe('applied')
    const bound = await ctx.runtimeContext.bind(h.tool, scope, 'tool')
    if (bound.kind !== 'bound' || !handle) throw new Error('source fixture missing')
    const reading = bound.reader.read(['public'])
    await entered.promise
    const draining = contribution.dispose()
    let drained = false
    void draining.then(() => {
      drained = true
    })
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(await bound.reader.read(['public'])).toMatchObject({ reason: 'sourceUnavailable' })
    expect(drained).toBe(false)
    response.resolve({
      kind: 'values',
      values: [{ key: 'public', revision: 'one', observedAt: at, value: 'late' }],
    })
    expect(await reading).toMatchObject({ reason: 'sourceUnavailable' })
    await draining
    await handle.dispose()
    expect(drained).toBe(true)
  } finally {
    response.resolve({ kind: 'values', values: [] })
    await contribution.dispose()
    await runtime.dispose()
    await dependencies.dispose()
    await ctx.fiber.dispose()
    await h.close()
  }
})
