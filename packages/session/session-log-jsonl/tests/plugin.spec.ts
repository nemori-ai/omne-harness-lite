import { Context, Fiber } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { openJsonlSessionLog } from '../src/index.ts'
import { Config, sessionLogJsonl } from '../src/plugin.ts'
import { applySessionLog } from '../src/plugin-owner.ts'
import { openWithIo } from '../src/open.ts'
import type { SessionLogOptions } from '../src/policy.ts'
import {
  processOwnership,
  deferred,
  entry,
  interceptFiles,
  root,
  session,
  unfenced,
  unconditional,
} from './support.ts'

const disposers: (() => Promise<void>)[] = []
const barriers: (() => void)[] = []
afterEach(async () => {
  for (const release of barriers.splice(0)) release()
  for (const dispose of disposers.splice(0)) await dispose()
})
describe('actual Cordis 4.0.4 thin provider ownership', () => {
  it.each([
    {},
    { processOwnership, dir: 'relative' },
    { processOwnership, dir: '/unused-invalid-policy', policy: { appendQueueLimit: 0 } },
    { processOwnership, dir: '/unused-invalid-policy', policy: { residentLogsLimit: 1.5 } },
  ])('invalid config fails before providing or acquiring files: %j', async config => {
    const ctx = new Context()
    const value: unknown = Reflect.apply(ctx.plugin, ctx, [sessionLogJsonl, config])
    if (!(value instanceof Fiber)) throw new Error('plugin did not return a Fiber')
    const fiber = value
    await expect(fiber).rejects.toThrow()
    expect(fiber.state).toBe(3)
    expect(ctx.get('sessionLog')).toBeUndefined()
  })
  it('has no inject/events and publishes exactly three operations with one owner cleanup', async () => {
    const dir = await root()
    const ctx = new Context()
    const fiber = await ctx.plugin(sessionLogJsonl, { processOwnership, dir })
    disposers.push(() => fiber.dispose())
    const service = ctx.get('sessionLog')
    if (service === undefined) throw new Error('service unavailable')
    expect(sessionLogJsonl.inject).toBeUndefined()
    expect(
      Object.keys(service)
        .filter(key => typeof Reflect.get(service, key) === 'function')
        .sort(),
    ).toEqual(['append', 'readByKey', 'readSince'])
    expect(service).not.toHaveProperty('close')
    expect(service).not.toHaveProperty('log')
    expect(
      fiber.getEffects().filter(effect => effect.label === 'session-log-jsonl.close'),
    ).toHaveLength(1)
    expect(await service.append(session(), [entry()], unfenced, unconditional)).toEqual({
      positions: [1],
      tail: 1,
    })
    await fiber.dispose()
    expect(ctx.get('sessionLog')).toBeUndefined()
    expect(
      await service.append(session(), [entry('old-reference')], unfenced, unconditional),
    ).toEqual({ failure: 'unavailable' })
    const next = await openJsonlSessionLog({ processOwnership, dir })
    try {
      expect(await next.readSince(session(), 0)).toHaveProperty('tail', 1)
    } finally {
      await next.close()
    }
  })
  it('provide is effect managed: a later body failure withdraws the actual service and releases owner', async () => {
    const dir = await root()
    const ctx = new Context()
    const fiber = ctx.plugin(
      {
        name: 'post-provide-failure',
        Config,
        async apply(inner: Context, config: SessionLogOptions) {
          await applySessionLog(inner, config)
          throw new Error('deliberate post-provide failure')
        },
      },
      { processOwnership, dir },
    )
    await expect(fiber).rejects.toThrow('deliberate post-provide failure')
    expect(ctx.get('sessionLog')).toBeUndefined()
    const next = await openJsonlSessionLog({ processOwnership, dir })
    await next.close()
  })
  it('restart waits for actual old file task and lock release before new plugin body can open', async () => {
    const dir = await root()
    const entered = deferred()
    const release = deferred()
    barriers.push(release.resolve)
    let blocked = true
    const io = interceptFiles((path, file) =>
      !path.endsWith('entries.jsonl')
        ? file
        : {
            ...file,
            async write(bytes) {
              const count = await file.write(bytes)
              if (blocked) {
                entered.resolve()
                await release.promise
                blocked = false
              }
              return count
            },
          },
    )
    let openings = 0
    const ctx = new Context()
    const fiber = await ctx.plugin(
      {
        ...sessionLogJsonl,
        async apply(inner: Context, config: SessionLogOptions) {
          openings++
          await applySessionLog(inner, config, options => openWithIo(options, io))
        },
      },
      { processOwnership, dir },
    )
    disposers.push(() => fiber.dispose())
    const old = ctx.get('sessionLog')
    if (old === undefined) throw new Error('service unavailable')
    const original = old.append(session(), [entry()], unfenced, unconditional)
    await entered.promise
    const restarting = fiber.restart()
    // Observe the real lifecycle transition, then verify ownership cannot transfer.
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(ctx.get('sessionLog')).toBeUndefined()
    expect(openings).toBe(1)
    await expect(openJsonlSessionLog({ processOwnership, dir })).rejects.toThrow()
    expect(await old.readSince(session(), 0)).toEqual({ failure: 'unavailable' })
    release.resolve()
    expect(await original).toEqual({ positions: [1], tail: 1 })
    await restarting
    expect(openings).toBe(2)
    const next = ctx.get('sessionLog')
    if (next === undefined) throw new Error('replacement unavailable')
    expect(await next.readSince(session(), 0)).toHaveProperty('tail', 1)
    expect(await old.append(session(), [entry('old')], unfenced, unconditional)).toEqual({
      failure: 'unavailable',
    })
  })
})
