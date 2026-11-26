import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import { standing, type Instance, type Registry } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { DynamisRefused, DynamisService } from '../src/cordis.ts'
import { entry } from './support.ts'

const a1 = entry('host.list', 'k', { id: 'a1' })
const a2 = entry('host.list', 'k', { id: 'a2' })
const b2 = entry('host.list', 'k', { id: 'b2' })
const mod1 = { fiber: 'mod', generation: 1 }
const mod2 = { fiber: 'mod', generation: 2 }

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))
const ids = (registry: Registry): string[] => registry.placed.map(placed => placed.id)

async function tree(): Promise<
  Readonly<{ ctx: Context; dynamis: DynamisService; seen: Registry[] }>
> {
  const ctx = new Context()
  await ctx.plugin(DynamisService)
  const seen: Registry[] = []
  ctx.on('dynamis-cordis/changed', registry => void seen.push(registry))
  return { ctx, dynamis: ctx.get('dynamis') as DynamisService, seen }
}

const mod = (name: string, apply: (ctx: Context) => unknown): Plugin.Object => ({
  name,
  inject: ['dynamis'],
  apply,
})

/** Loads `impl` the way a loader stages a generation: it says whom it succeeds before `apply` runs. */
function staged(ctx: Context, dynamis: DynamisService, old: Fiber, impl: Plugin.Object): Fiber {
  const next = ctx.plugin(impl)
  dynamis.succeed(next, old)
  return next
}

describe('换代接到 Cordis 上（DC-5）', () => {
  it('新的一代就绪了仍备着；一声令下，一次变化里旧的撤下、新的在位；旧的卸载时排空', async () => {
    const { ctx, dynamis, seen } = await tree()
    const asked: Instance[] = []
    let drained: () => void = () => undefined
    const drain = (instance: Instance): Promise<void> => {
      asked.push(instance)
      return new Promise(resolve => (drained = resolve))
    }
    const old = await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a1], { drain })))
    seen.length = 0
    const told: Instance[] = []
    const next = await staged(
      ctx,
      dynamis,
      old,
      mod('mod', inner => void inner.dynamis.put(instance => (told.push(instance), [a2]))),
    )
    await settle()
    expect(told).toEqual([mod2])
    expect([ids(dynamis.registry()), dynamis.registry().serving, seen]).toEqual([
      ['a1'],
      [mod1],
      [],
    ])

    const alongside: string[][] = []
    const rolled = dynamis.rollout(next, () => void alongside.push(ids(dynamis.registry())))
    expect(rolled).toEqual({ kind: 'rolled', seated: [mod2] })
    // What runs alongside runs before the change shows and before anyone is told.
    expect(alongside).toEqual([['a1']])
    expect(seen).toHaveLength(1)
    expect(dynamis.registry().serving).toEqual([mod2])
    expect(standing(dynamis.registry(), mod1)).toBe('retiring')

    const unloading = old.dispose()
    await settle()
    expect(asked).toEqual([mod1])
    expect(ids(dynamis.registry())).toEqual(['a1', 'a2'])
    drained()
    await unloading
    expect([ids(dynamis.registry()), dynamis.registry().retiring]).toEqual([['a2'], []])
    expect(dynamis.registry().serving).toEqual([mod2])
  })

  it('新的一代 apply 抛错：它放的从不出现，rollout 被拒，旧的照常在位', async () => {
    const { ctx, dynamis, seen } = await tree()
    const old = await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a1])))
    seen.length = 0
    const next = staged(
      ctx,
      dynamis,
      old,
      mod('mod', inner => {
        inner.dynamis.put([a2])
        throw new Error('the new generation cannot start')
      }),
    )
    await expect(next.await()).rejects.toThrow('the new generation cannot start')
    expect(dynamis.rollout(next)).toMatchObject({ kind: 'refused', reason: 'not-ready' })
    expect([ids(dynamis.registry()), dynamis.registry().serving, seen]).toEqual([
      ['a1'],
      [mod1],
      [],
    ])
    await next.dispose()
    expect([ids(dynamis.registry()), dynamis.registry().serving, seen]).toEqual([
      ['a1'],
      [mod1],
      [],
    ])
  })

  it('新的一代还在启动：rollout 被拒，什么都不变', async () => {
    const { ctx, dynamis, seen } = await tree()
    const old = await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a1])))
    seen.length = 0
    let go: () => void = () => undefined
    const next = staged(
      ctx,
      dynamis,
      old,
      mod('mod', async inner => {
        inner.dynamis.put([a2])
        await new Promise<void>(resolve => (go = resolve))
      }),
    )
    await settle()
    let ran = false
    expect(dynamis.rollout(next, () => (ran = true))).toMatchObject({
      kind: 'refused',
      reason: 'not-ready',
    })
    expect([ids(dynamis.registry()), seen, ran]).toEqual([['a1'], [], false])
    go()
    await next.await()
    await settle()
    expect(dynamis.rollout(next)).toEqual({ kind: 'rolled', seated: [mod2] })
    expect(ids(dynamis.registry())).toEqual(['a2'])
  })

  it('同一个旧的一代已经有一代等着：后来的那一代放不上，抛 awaited', async () => {
    const { ctx, dynamis } = await tree()
    const old = await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a1])))
    await staged(
      ctx,
      dynamis,
      old,
      mod('mod', inner => void inner.dynamis.put([a2])),
    )
    let thrown: unknown
    const second = staged(
      ctx,
      dynamis,
      old,
      mod('mod', inner => {
        try {
          inner.dynamis.put([b2])
        } catch (error) {
          thrown = error
        }
      }),
    )
    await second.await()
    expect(thrown).toBeInstanceOf(DynamisRefused)
    expect((thrown as DynamisRefused).reason).toBe('awaited')
  })

  it('放东西的是新的一代里的子 fiber：照样等换代，接替旧的一代里同名的那一个', async () => {
    const { ctx, dynamis } = await tree()
    const nested = (made: typeof a1): Plugin.Object => ({
      name: 'row',
      apply: (holder: Context) =>
        void holder.plugin(mod('mod', inner => void inner.dynamis.put([made]))),
    })
    const old = await ctx.plugin(nested(a1))
    await settle()
    const next = await staged(ctx, dynamis, old, nested(a2))
    await settle()
    expect([ids(dynamis.registry()), dynamis.registry().serving]).toEqual([['a1'], [mod1]])
    expect(dynamis.rollout(next)).toEqual({ kind: 'rolled', seated: [mod2] })
    expect([ids(dynamis.registry()), dynamis.registry().serving]).toEqual([['a2'], [mod2]])
  })

  it('新的一代里找不到被接替者的 fiber 照平常的座位走：就绪就在位', async () => {
    const { ctx, dynamis } = await tree()
    const old = await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a1])))
    const next = await staged(
      ctx,
      dynamis,
      old,
      mod('other', inner => void inner.dynamis.put([b2])),
    )
    await settle()
    expect(dynamis.registry().serving).toEqual([mod1, { fiber: 'other', generation: 1 }])
    expect(dynamis.rollout(next)).toEqual({ kind: 'rolled', seated: [] })
  })

  it('换过之后新的一代依赖丢了再回来：是这个名字的下一代，不再等谁', async () => {
    const { ctx, dynamis } = await tree()
    const old = await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a1])))
    const dependency = ctx.plugin({ name: 'dep', apply: inner => void inner.provide('dep', {}) })
    await dependency
    const next = await staged(ctx, dynamis, old, {
      name: 'mod',
      inject: ['dynamis', 'dep'],
      apply: (inner: Context) => void inner.dynamis.put([a2]),
    })
    await settle()
    expect(dynamis.rollout(next)).toEqual({ kind: 'rolled', seated: [mod2] })
    await old.dispose()
    await dependency.dispose()
    await settle()
    expect(dynamis.registry().serving).toEqual([])
    await ctx.plugin({ name: 'dep', apply: inner => void inner.provide('dep', {}) })
    await settle()
    expect(dynamis.registry().serving).toEqual([{ fiber: 'mod', generation: 3 }])
  })
})
