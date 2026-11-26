import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { describe, expect, it } from 'vitest'
import { defineEntry, swapRow, type Entry, type EntryEvent } from '../src/cordis.ts'

type Greeter = {
  greet(name: string, wait?: Promise<void>): Promise<string>
  version(): string
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))

/** A clock a test moves by hand: `delay` settles when the test says the deadline came. */
function handClock(): { delay: (ms: number) => Promise<void>; expire: () => void } {
  const waiting: (() => void)[] = []
  return {
    delay: () => new Promise<void>(resolve => void waiting.push(resolve)),
    expire: () => waiting.splice(0).forEach(resolve => resolve()),
  }
}

function greeterEntry(clock = handClock(), events: EntryEvent[] = []): Entry<Greeter> {
  return defineEntry<Greeter>({
    key: 'greeter',
    unavailable: { greet: async () => 'basis-unavailable', version: () => 'basis-unavailable' },
    drainTimeoutMs: 1000,
    clock,
    report: event => void events.push(event),
  })
}

const made = (version: string): Greeter => ({
  async greet(name, wait) {
    if (wait !== undefined) await wait
    return `${version}:${name}`
  },
  version: () => version,
})

/** One generation of the row: it offers its implementation to the entry in its `apply`. */
const generation = (entry: Entry<Greeter>, version: string): Plugin.Object => ({
  name: 'greeter',
  apply: (ctx: Context) => entry.offer(ctx, made(version)),
})

async function tree(entry: Entry<Greeter>): Promise<{
  ctx: Context
  greeter: () => Greeter
  consumerRuns: () => number
}> {
  const ctx = new Context()
  await ctx.plugin(DynamisService)
  let runs = 0
  ctx.plugin(entry.plugin)
  ctx.plugin({ name: 'consumer', inject: ['greeter'], apply: () => void (runs += 1) })
  return { ctx, greeter: () => ctx.get('greeter') as Greeter, consumerRuns: () => runs }
}

describe('入口：依赖方注入的对象不换，实现在背后换（AS-13、AS-14）', () => {
  it('第一代站稳之前服务键不在：依赖方等着；站稳了才提供', async () => {
    const entry = greeterEntry()
    const { ctx, greeter, consumerRuns } = await tree(entry)
    await settle()
    expect([consumerRuns(), entry.standing()]).toEqual([0, { kind: 'basis-unavailable' }])
    await ctx.plugin(generation(entry, 'v1'))
    await settle()
    expect([consumerRuns(), entry.standing()]).toEqual([1, { kind: 'serving', generation: 1 }])
    expect(greeter()).toBe(entry.service)
    expect([await greeter().greet('a'), greeter().version()]).toEqual(['v1:a', 'v1'])
  })

  it('背后换两代：依赖方的 apply 只跑 1 次，注入的对象是同一个', async () => {
    const entry = greeterEntry()
    const { ctx, greeter, consumerRuns } = await tree(entry)
    let old: Fiber = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    const injected = greeter()
    for (const version of ['v2', 'v3']) {
      const swapped = await swapRow(ctx, {
        old,
        next: generation(entry, version),
        entries: [entry],
      })
      if (swapped.kind !== 'swapped') throw new Error(swapped.detail)
      await swapped.drained
      old = swapped.fiber
      expect(await greeter().greet('a')).toBe(`${version}:a`)
    }
    expect([consumerRuns(), greeter() === injected]).toEqual([1, true])
    expect(entry.standing()).toEqual({ kind: 'serving', generation: 3 })
  })

  it('换的时候有调用在途：它在旧的一代上做完，新调用到新的一代；旧的做完才卸载', async () => {
    const entry = greeterEntry()
    const { ctx, greeter } = await tree(entry)
    const old = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    let release: () => void = () => undefined
    const inFlight = greeter().greet('held', new Promise<void>(resolve => (release = resolve)))
    const swapped = await swapRow(ctx, { old, next: generation(entry, 'v2'), entries: [entry] })
    if (swapped.kind !== 'swapped') throw new Error(swapped.detail)
    let unloaded = false
    void swapped.drained.then(() => (unloaded = true))
    expect(await greeter().greet('new')).toBe('v2:new')
    await settle()
    expect(unloaded).toBe(false)
    release()
    expect(await inFlight).toBe('v1:held')
    await swapped.drained
    expect(unloaded).toBe(true)
  })

  it('新的一代 apply 抛错：这一步被拒并带原因，那个 fiber 被撤掉，旧的一代照常答', async () => {
    const entry = greeterEntry()
    const { ctx, greeter, consumerRuns } = await tree(entry)
    const old = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    const swapped = await swapRow(ctx, {
      old,
      next: {
        name: 'greeter',
        apply(inner: Context) {
          entry.offer(inner, made('v2'))
          throw new Error('v2 cannot start')
        },
      },
      entries: [entry],
    })
    expect(swapped).toMatchObject({ kind: 'refused', reason: 'did-not-start' })
    expect(swapped.kind === 'refused' && swapped.detail).toContain('v2 cannot start')
    expect([await greeter().greet('a'), consumerRuns()]).toEqual(['v1:a', 1])
    expect(entry.standing()).toEqual({ kind: 'serving', generation: 1 })
    // The generation that failed is spent: the next one to try is a new generation.
    const again = await swapRow(ctx, { old, next: generation(entry, 'v3'), entries: [entry] })
    expect(again.kind).toBe('swapped')
    expect(entry.standing()).toEqual({ kind: 'serving', generation: 3 })
  })

  it('这一行自己说还没站稳：这一步被拒，旧的照常', async () => {
    const entry = greeterEntry()
    const { ctx, greeter } = await tree(entry)
    const old = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    const swapped = await swapRow(ctx, {
      old,
      next: generation(entry, 'v2'),
      entries: [entry],
      ready: () => false,
    })
    expect(swapped).toMatchObject({ kind: 'refused', reason: 'not-ready' })
    expect(await greeter().greet('a')).toBe('v1:a')
    // The generation that was refused is unloaded: nothing stands by, so the next one can.
    const again = await swapRow(ctx, { old, next: generation(entry, 'v3'), entries: [entry] })
    expect(again.kind).toBe('swapped')
    expect(await greeter().greet('a')).toBe('v3:a')
  })

  it('这一行还往登记表上放东西：入口与座位在同一步里换；座位换不成，整步被拒', async () => {
    const entry = greeterEntry()
    const { ctx, greeter } = await tree(entry)
    const dynamis = ctx.get('dynamis') as DynamisService
    const placed = (id: string) => ({
      point: 'host.list',
      key: 'k',
      id,
      scope: [],
      rank: 0,
      digest: id,
      item: {},
    })
    const row = (version: string): Plugin.Object => ({
      name: 'greeter',
      inject: ['dynamis'],
      apply(inner: Context) {
        entry.offer(inner, made(version))
        inner.dynamis.put([placed(version)])
      },
    })
    const ids = (): string[] => dynamis.registry().placed.map(each => each.id)
    const old = await ctx.plugin(row('v1'))
    await settle()
    const changes: string[][] = []
    ctx.on('dynamis-cordis/changed', () => void changes.push([greeter().version(), ...ids()]))
    const told: string[] = []
    const swapped = await swapRow(ctx, {
      old,
      next: row('v2'),
      entries: [entry],
      // Told in the step itself: the new generation serves and the old one has not begun to unload.
      swapped: () => void told.push(`${greeter().version()} old:${String(old.state)}`),
    })
    if (swapped.kind !== 'swapped') throw new Error(swapped.detail)
    expect(told).toEqual(['v2 old:2'])
    await swapped.drained
    expect([greeter().version(), ids()]).toEqual(['v2', ['v2']])
    // Whoever is told of the change finds the entry on the new generation already.
    expect(changes).toEqual([['v2', 'v2']])
    // The old seat leaves while the next generation is told to stand up: the seats refuse the step.
    const lost = await swapRow(ctx, {
      old: swapped.fiber,
      next: row('v3'),
      entries: [entry],
      ready: async () => {
        await swapped.fiber.dispose()
        return true
      },
    })
    expect(lost).toMatchObject({ kind: 'refused', reason: 'seats' })
    expect([entry.standing(), ids()]).toEqual([{ kind: 'basis-unavailable' }, []])
  })

  it('新的一代没有把实现交给入口：这一步被拒，旧的照常', async () => {
    const entry = greeterEntry()
    const { ctx, greeter } = await tree(entry)
    const old = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    const swapped = await swapRow(ctx, {
      old,
      next: { name: 'greeter', apply: () => undefined },
      entries: [entry],
    })
    expect(swapped).toMatchObject({ kind: 'refused', reason: 'not-offered' })
    expect(await greeter().greet('a')).toBe('v1:a')
  })

  it('没有在服务的一代：方法答依据不可用，不抛出；服务键还在，依赖方没有重跑', async () => {
    const entry = greeterEntry()
    const { ctx, greeter, consumerRuns } = await tree(entry)
    const only = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    await only.dispose()
    expect(entry.standing()).toEqual({ kind: 'basis-unavailable' })
    expect([await greeter().greet('a'), greeter().version()]).toEqual([
      'basis-unavailable',
      'basis-unavailable',
    ])
    expect(consumerRuns()).toBe(1)
    // A generation that comes when none serves is in service once its fiber is ready.
    await ctx.plugin(generation(entry, 'v2'))
    await settle()
    expect([await greeter().greet('a'), consumerRuns()]).toEqual(['v2:a', 1])
  })

  it('旧的一代到了排空的期限还有调用在途：它们记成未知，旧的照样卸载', async () => {
    const clock = handClock()
    const events: EntryEvent[] = []
    const entry = greeterEntry(clock, events)
    const { ctx, greeter } = await tree(entry)
    const old = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    const stuck = greeter().greet('stuck', new Promise<void>(() => undefined))
    void stuck
    const swapped = await swapRow(ctx, { old, next: generation(entry, 'v2'), entries: [entry] })
    if (swapped.kind !== 'swapped') throw new Error(swapped.detail)
    await settle()
    expect(events).toEqual([])
    clock.expire()
    await swapped.drained
    expect(events).toEqual([{ kind: 'unknown', key: 'greeter', generation: 1, calls: 1 }])
    expect(await greeter().greet('a')).toBe('v2:a')
  })

  it('在服务的一代自己没了：名下在途的记成未知', async () => {
    const events: EntryEvent[] = []
    const entry = greeterEntry(handClock(), events)
    const { ctx, greeter } = await tree(entry)
    const only = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    void greeter().greet('stuck', new Promise<void>(() => undefined))
    await only.dispose()
    expect(events).toEqual([{ kind: 'unknown', key: 'greeter', generation: 1, calls: 1 }])
  })

  it('新的一代里的子 fiber 晚一步才放东西：等它也站稳了才换，登记表只变一次', async () => {
    const entry = greeterEntry()
    const { ctx } = await tree(entry)
    const dynamis = ctx.get('dynamis') as DynamisService
    const placed = (id: string) => ({
      point: 'host.list',
      key: 'k',
      id,
      scope: [],
      rank: 0,
      digest: id,
      item: {},
    })
    const row = (version: string, fails = false): Plugin.Object => ({
      name: 'greeter',
      apply(inner: Context) {
        entry.offer(inner, made(version))
        inner.plugin({
          name: 'greeter-late',
          inject: ['dynamis'],
          async apply(child: Context) {
            await new Promise(resolve => setTimeout(resolve, 20))
            if (fails) throw new Error('the late part cannot start')
            child.dynamis.put([placed(version)])
          },
        })
      },
    })
    const ids = (): string[] => dynamis.registry().placed.map(each => each.id)
    const old = await ctx.plugin(row('v1'))
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(ids()).toEqual(['v1'])
    const changes: string[][] = []
    ctx.on('dynamis-cordis/changed', () => void changes.push(ids()))
    const swapped = await swapRow(ctx, { old, next: row('v2'), entries: [entry] })
    if (swapped.kind !== 'swapped') throw new Error(swapped.detail)
    await swapped.drained
    expect(changes).toEqual([['v2']])
    // A late part that cannot start refuses the step: the generation did not stand up.
    const failed = await swapRow(ctx, {
      old: swapped.fiber,
      next: row('v3', true),
      entries: [entry],
    })
    expect(failed).toMatchObject({ kind: 'refused', reason: 'did-not-start' })
    expect(failed.kind === 'refused' && failed.detail).toContain('the late part cannot start')
    expect([ids(), entry.standing()]).toEqual([['v2'], { kind: 'serving', generation: 2 }])
  })

  it('新的一代里有一个 fiber 等着一样没有的依赖：没站稳，被拒并点名，旧的照常', async () => {
    const entry = greeterEntry()
    const { ctx, greeter } = await tree(entry)
    const old = await ctx.plugin(generation(entry, 'v1'))
    await settle()
    const swapped = await swapRow(ctx, {
      old,
      next: {
        name: 'greeter',
        apply(inner: Context) {
          entry.offer(inner, made('v2'))
          inner.plugin({
            name: 'greeter-needs',
            inject: ['nobody-provides-this'],
            apply: () => undefined,
          })
        },
      },
      entries: [entry],
    })
    expect(swapped).toEqual({
      kind: 'refused',
      reason: 'not-ready',
      detail: 'greeter-needs is not active',
    })
    expect(await greeter().greet('a')).toBe('v1:a')
  })

  it('同步抛出的方法：照样放开这次调用', async () => {
    const entry = defineEntry<{ fail(): never }>({
      key: 'thrower',
      unavailable: {
        fail: () => {
          throw new Error('unavailable')
        },
      },
      drainTimeoutMs: 1000,
      clock: handClock(),
    })
    const ctx = new Context()
    ctx.plugin(entry.plugin)
    const fails = (version: string): Plugin.Object => ({
      name: 'thrower',
      apply: (inner: Context) =>
        entry.offer(inner, {
          fail: () => {
            throw new Error(version)
          },
        }),
    })
    const old = await ctx.plugin(fails('v1'))
    await settle()
    expect(() => entry.service.fail()).toThrow('v1')
    const swapped = await swapRow(ctx, { old, next: fails('v2'), entries: [entry] })
    if (swapped.kind !== 'swapped') throw new Error(swapped.detail)
    // Nothing is held by the old generation, so it drains at once.
    await swapped.drained
    expect(() => entry.service.fail()).toThrow('v2')
  })
})
