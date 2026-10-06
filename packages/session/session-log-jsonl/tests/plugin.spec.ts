import { Context, Fiber } from '@deepseek-ai/cordis'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openJsonlSessionLog } from '../src/index.ts'
import { Config, createSessionLogJsonl } from '../src/cordis.ts'
import { applySessionLog } from '../src/plugin-owner.ts'
import { openWithIo } from '../src/open.ts'
import {
  processOwnership,
  deferred,
  entry,
  interceptFiles,
  root,
  session,
  unfenced,
  unconditional,
  paths,
} from './support.ts'

let sessionLogJsonl: ReturnType<typeof createSessionLogJsonl>
beforeEach(() => {
  sessionLogJsonl = createSessionLogJsonl({ processOwnership })
})
const disposers: (() => Promise<void>)[] = []
const barriers: (() => void)[] = []
afterEach(async () => {
  for (const release of barriers.splice(0)) release()
  for (const dispose of disposers.splice(0)) await dispose()
})
describe('actual Cordis 4.0.4 thin provider ownership', () => {
  it.each([
    {},
    { appendQueueLimit: 1 },
    { residentLogsLimit: 2 },
    { appendQueueLimit: 1, residentLogsLimit: 2 },
  ])('preserves each supplied serialized policy field: %j', policy => {
    const input = { dir: '/serialized-log', policy }
    const parsed = Config.parse(JSON.parse(JSON.stringify(input)))
    expect(parsed).toEqual(input)
    expect(Object.keys(parsed.policy!).sort()).toEqual(Object.keys(policy).sort())
    expect(Config.parse({ dir: input.dir })).not.toHaveProperty('policy')
  })
  it.each([
    { processOwnership: {} },
    { processOwnership: { current: '', observeExit: async () => 'unknown' } },
    { processOwnership, diagnostic: 'not-a-function' },
  ])('rejects invalid trusted live bindings before mounting: %j', bindings => {
    expect(() => Reflect.apply(createSessionLogJsonl, undefined, [bindings])).toThrow(TypeError)
  })
  it.each([
    { dir: 'relative' },
    { dir: '/invalid\u0000path' },
    { dir: '/serialized-log', policy: { appendQueueLimit: 0 } },
    { dir: '/serialized-log', policy: { appendQueueLimit: 1.5 } },
    { dir: '/serialized-log', policy: { residentLogsLimit: 0 } },
    { dir: '/serialized-log', policy: { residentLogsLimit: 1.5 } },
  ])('rejects invalid serialized config without invoking a provider: %j', input => {
    expect(Config.safeParse(input).success).toBe(false)
  })
  it.each([
    {},
    { dir: '/unused-live-config', processOwnership },
    { dir: '/unused-live-config', diagnostic: () => {} },
    { dir: 'relative' },
    { dir: '/unused-invalid-policy', policy: { appendQueueLimit: 0 } },
    { dir: '/unused-invalid-policy', policy: { residentLogsLimit: 1.5 } },
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
    const plugin = createSessionLogJsonl({ processOwnership })
    const fiber = await ctx.plugin(plugin, { dir })
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
  it('retains the trusted legacy observer receiver and diagnostic sink during real recovery', async () => {
    const dir = await root()
    const original = await openJsonlSessionLog({ processOwnership, dir })
    await original.append(session(), [entry()], unfenced, unconditional)
    await original.close()
    await unlink(join(paths(dir).directory, 'recovery.json'))
    let observed = 0
    const events: unknown[] = []
    const ownership = {
      ...processOwnership,
      async observeLegacyExit(directory: string): Promise<'exited'> {
        expect(this).toBe(ownership)
        expect(directory).toBe(paths(dir).directory)
        observed++
        return 'exited'
      },
    }
    const plugin = createSessionLogJsonl({
      processOwnership: ownership,
      diagnostic: event => events.push(event),
    })
    const ctx = new Context()
    const fiber = await ctx.plugin(plugin, { dir })
    disposers.push(() => fiber.dispose())
    const service = ctx.get('sessionLog')
    if (!service) throw new Error('service unavailable')
    expect(await service.readSince(session(), 0)).toHaveProperty('tail', 1)
    expect(observed).toBe(1)
    expect(events).toContainEqual(
      expect.objectContaining({
        stage: 'recovery',
        recoverySource: 'legacy',
        ownerObserved: 'exited',
      }),
    )
  })
  it('provide is effect managed: a later body failure withdraws the actual service and releases owner', async () => {
    const dir = await root()
    const ctx = new Context()
    const fiber = ctx.plugin(
      {
        name: 'post-provide-failure',
        Config,
        async apply(inner: Context, config: ReturnType<typeof Config.parse>) {
          await applySessionLog(inner, { ...config, processOwnership })
          throw new Error('deliberate post-provide failure')
        },
      },
      { dir },
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
        async apply(inner: Context, config: ReturnType<typeof Config.parse>) {
          openings++
          await applySessionLog(inner, { ...config, processOwnership }, options =>
            openWithIo(options, io),
          )
        },
      },
      { dir },
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
