import { Context, type Plugin } from '@deepseek-ai/cordis'
import { standing, type Instance, type Registry } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import { DynamisService } from '../src/cordis.ts'
import { entry } from './support.ts'

const a1 = entry('host.list', 'k', { id: 'a1' })
const a2 = entry('host.list', 'k', { id: 'a2' })

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))
const ids = (registry: Registry): string[] => registry.placed.map(placed => placed.id)
const named = (instances: readonly Instance[]): string[] =>
  instances.map(instance => `${instance.fiber}#${instance.generation}`)

type Gate = Readonly<{
  drain: (instance: Instance) => Promise<void>
  asked: Instance[]
  open: () => void
  fail: (reason: Error) => void
}>

function gate(): Gate {
  const asked: Instance[] = []
  let open: () => void = () => undefined
  let fail: (reason: Error) => void = () => undefined
  const done = new Promise<void>((resolve, reject) => {
    open = resolve
    fail = reject
  })
  return {
    drain: instance => {
      asked.push(instance)
      return done
    },
    asked,
    open: () => open(),
    fail: reason => fail(reason),
  }
}

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

describe('要排空的批（DC-2）', () => {
  it('卸载：实例先正在撤下并通知一次，排空完才取走并再通知一次；卸载等它', async () => {
    const { ctx, dynamis, seen } = await tree()
    const held = gate()
    const fiber = await ctx.plugin(
      mod('mod', inner => void inner.dynamis.put([a1], { drain: held.drain })),
    )
    seen.length = 0
    let unloaded = false
    const unloading = fiber.dispose().then(() => {
      unloaded = true
    })
    await settle()
    expect(held.asked).toEqual([{ fiber: 'mod', generation: 1 }])
    expect(named(dynamis.registry().retiring)).toEqual(['mod#1'])
    expect(named(dynamis.registry().serving)).toEqual([])
    expect(ids(dynamis.registry())).toEqual(['a1'])
    expect(seen).toHaveLength(1)
    expect(unloaded).toBe(false)
    held.open()
    await unloading
    expect(unloaded).toBe(true)
    expect(dynamis.registry().retiring).toEqual([])
    expect(ids(dynamis.registry())).toEqual([])
    expect(seen).toHaveLength(2)
  })

  it('同一个实例里不要排空的批：一起留到排空完，只撤它自己的函数不动登记表', async () => {
    const { ctx, dynamis } = await tree()
    const held = gate()
    const fiber = await ctx.plugin(
      mod('mod', inner => {
        inner.dynamis.put([a1], { drain: held.drain })
        inner.dynamis.put([a2])
      }),
    )
    const unloading = fiber.dispose()
    await settle()
    expect(ids(dynamis.registry())).toEqual(['a1', 'a2'])
    expect(standing(dynamis.registry(), { fiber: 'mod', generation: 1 })).toBe('retiring')
    held.open()
    await unloading
    expect(ids(dynamis.registry())).toEqual([])
  })

  it('两批都要排空：各调一次，都完成才取走', async () => {
    const { ctx, dynamis } = await tree()
    const first = gate()
    const second = gate()
    const fiber = await ctx.plugin(
      mod('mod', inner => {
        inner.dynamis.put([a1], { drain: first.drain })
        inner.dynamis.put([a2], { drain: second.drain })
      }),
    )
    const unloading = fiber.dispose()
    await settle()
    expect(first.asked).toHaveLength(1)
    expect(second.asked).toHaveLength(1)
    first.open()
    await settle()
    expect(named(dynamis.registry().retiring)).toEqual(['mod#1'])
    second.open()
    await unloading
    expect(dynamis.registry().retiring).toEqual([])
  })

  it('apply 抛错的 fiber：没有服务过，不调排空，什么都不留', async () => {
    const { ctx, dynamis, seen } = await tree()
    const held = gate()
    await ctx
      .plugin(
        mod('mod', inner => {
          inner.dynamis.put([a1], { drain: held.drain })
          throw new Error('apply failed')
        }),
      )
      .then(
        () => undefined,
        () => undefined,
      )
    await settle()
    expect(held.asked).toEqual([])
    expect(dynamis.registry().placed).toEqual([])
    expect(seen).toEqual([])
  })

  it('在位时单独撤这一批：立刻去掉，不调排空', async () => {
    const { ctx, dynamis } = await tree()
    const held = gate()
    let take: (() => unknown) | undefined
    await ctx.plugin(
      mod('mod', inner => {
        take = inner.dynamis.put([a1], { drain: held.drain })
      }),
    )
    await take?.()
    expect(held.asked).toEqual([])
    expect(ids(dynamis.registry())).toEqual([])
  })

  it('同名的新一代在旧一代撤下中时装上：新的在服务，旧的排空完只取走旧的', async () => {
    const { ctx, dynamis } = await tree()
    const held = gate()
    const old = await ctx.plugin(
      mod('mod', inner => void inner.dynamis.put([a1], { drain: held.drain })),
    )
    const unloading = old.dispose()
    await settle()
    await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a2])))
    expect(named(dynamis.registry().retiring)).toEqual(['mod#1'])
    expect(named(dynamis.registry().serving)).toEqual(['mod#2'])
    held.open()
    await unloading
    expect(dynamis.registry().retiring).toEqual([])
    expect(named(dynamis.registry().serving)).toEqual(['mod#2'])
    expect(ids(dynamis.registry())).toEqual(['a2'])
  })

  it('依赖的提供者卸载要等依赖它的排空完：排空期间依赖回不来，同一个 fiber 不会并着跑两代', async () => {
    const { ctx, dynamis } = await tree()
    const held = gate()
    const dep: Plugin.Object = { name: 'dep', apply: inner => void inner.provide('dep', {}) }
    const first = await ctx.plugin(dep)
    let runs = 0
    await ctx.plugin({
      name: 'mod',
      inject: ['dynamis', 'dep'],
      apply: inner => {
        runs += 1
        inner.dynamis.put([runs === 1 ? a1 : a2], runs === 1 ? { drain: held.drain } : {})
      },
    })
    let gone = false
    const leaving = first.dispose().then(() => {
      gone = true
    })
    await settle()
    expect(named(dynamis.registry().retiring)).toEqual(['mod#1'])
    expect(gone).toBe(false)
    await expect(ctx.plugin(dep)).rejects.toThrow('has been registered')
    expect(runs).toBe(1)
    held.open()
    await leaving
    await ctx.plugin(dep)
    await settle()
    expect(runs).toBe(2)
    expect(named(dynamis.registry().serving)).toEqual(['mod#2'])
    expect(dynamis.registry().retiring).toEqual([])
    expect(ids(dynamis.registry())).toEqual(['a2'])
  })

  it('排空失败：实例照样取走，失败交给等卸载的一方', async () => {
    const { ctx, dynamis } = await tree()
    const held = gate()
    const fiber = await ctx.plugin(
      mod('mod', inner => void inner.dynamis.put([a1], { drain: held.drain })),
    )
    const unloading = fiber.dispose()
    await settle()
    held.fail(new Error('drain failed'))
    await unloading.then(
      () => undefined,
      () => undefined,
    )
    await settle()
    expect(dynamis.registry().retiring).toEqual([])
    expect(ids(dynamis.registry())).toEqual([])
  })
})
