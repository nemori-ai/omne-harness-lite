import { Context, type Plugin } from '@deepseek-ai/cordis'
import { empty, type Instance, type Registry } from '@omne-harness/dynamis'
import { describe, expect, it, vi } from 'vitest'
import { DynamisRefused, DynamisService } from '../src/cordis.ts'
import { entry } from './support.ts'

const a1 = entry('host.list', 'k', { id: 'a1' })
const a2 = entry('host.list', 'k', { id: 'a2' })
const b1 = entry('host.list', 'k', { id: 'b1' })

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))
const ids = (registry: Registry): string[] => registry.placed.map(placed => placed.id)
const holders = (registry: Registry): string[] =>
  registry.serving.map(instance => `${instance.fiber}#${instance.generation}`)

async function tree(): Promise<
  Readonly<{ ctx: Context; dynamis: DynamisService; seen: Registry[] }>
> {
  const ctx = new Context()
  await ctx.plugin(DynamisService)
  const seen: Registry[] = []
  ctx.on('dynamis-cordis/changed', registry => void seen.push(registry))
  return { ctx, dynamis: ctx.get('dynamis') as DynamisService, seen }
}

const mod = (
  name: string,
  apply: (ctx: Context) => unknown,
  inject = ['dynamis'],
): Plugin.Object => ({
  name,
  inject,
  apply,
})

describe('服务 dynamis（DC-1、DC-2、DC-3）', () => {
  it('apply 里放的两批在就绪之前看不见，就绪时整份出现，只通知一次', async () => {
    const { ctx, dynamis, seen } = await tree()
    let during: Registry | undefined
    await ctx.plugin(
      mod('mod', inner => {
        inner.dynamis.put([a1])
        inner.dynamis.put([a2])
        during = dynamis.registry()
      }),
    )
    expect(during).toBe(empty)
    expect(ids(dynamis.registry())).toEqual(['a1', 'a2'])
    expect(holders(dynamis.registry())).toEqual(['mod#1'])
    expect(seen).toHaveLength(1)
    expect(seen[0]).toBe(dynamis.registry())
  })

  it('放一批是调用方 fiber 上的效应：单独撤一批只撤这一批', async () => {
    const { ctx, dynamis } = await tree()
    let take: (() => unknown) | undefined
    await ctx.plugin(
      mod('mod', inner => {
        take = inner.dynamis.put([a1])
        inner.dynamis.put([a2])
      }),
    )
    await take?.()
    expect(ids(dynamis.registry())).toEqual(['a2'])
    await take?.()
    expect(ids(dynamis.registry())).toEqual(['a2'])
  })

  it('卸载：整份取走，只通知一次，服务还在', async () => {
    const { ctx, dynamis, seen } = await tree()
    const fiber = await ctx.plugin(
      mod('mod', inner => {
        inner.dynamis.put([a1])
        inner.dynamis.put([a2])
      }),
    )
    seen.length = 0
    await fiber.dispose()
    await settle()
    expect(dynamis.registry()).toEqual(empty)
    expect(seen.map(ids)).toEqual([[]])
    expect(ctx.get('dynamis') !== undefined).toBe(true)
  })

  it('依赖丢失：整份取走；依赖回来：整份回来，是新的一代', async () => {
    const { ctx, dynamis, seen } = await tree()
    const dep: Plugin.Object = { name: 'dep', apply: inner => void inner.provide('dep', {}) }
    const first = await ctx.plugin(dep)
    await ctx.plugin(
      mod(
        'mod',
        inner => {
          inner.dynamis.put([a1])
          inner.dynamis.put([a2])
        },
        ['dynamis', 'dep'],
      ),
    )
    expect(holders(dynamis.registry())).toEqual(['mod#1'])
    seen.length = 0

    await first.dispose()
    await settle()
    expect(dynamis.registry()).toEqual(empty)

    await ctx.plugin(dep)
    await settle()
    expect(holders(dynamis.registry())).toEqual(['mod#2'])
    expect(seen.map(ids)).toEqual([[], ['a1', 'a2']])
  })

  it('apply 抛错：它放的东西从不出现，一次通知都没有', async () => {
    const { ctx, dynamis, seen } = await tree()
    const fiber = ctx.plugin(
      mod('bad', inner => {
        inner.dynamis.put([a1])
        throw new Error('boom')
      }),
    )
    await expect(fiber).rejects.toThrow('boom')
    await settle()
    expect(dynamis.registry()).toBe(empty)
    expect(seen).toEqual([])
  })

  it('被拒绝的放入：抛出，登记表不变，不通知，之后的卸载是干净的', async () => {
    const { ctx, dynamis, seen } = await tree()
    let refused: unknown
    const fiber = await ctx.plugin(
      mod('mod', inner => {
        inner.dynamis.put([a1])
        try {
          inner.dynamis.put([a1])
        } catch (error) {
          refused = error
        }
      }),
    )
    expect(refused).toBeInstanceOf(DynamisRefused)
    expect((refused as DynamisRefused).reason).toBe('held')
    expect((refused as DynamisRefused).name).toBe('DynamisRefused')
    expect((refused as Error).message).toContain('two entries of this instance at one spot')
    expect(ids(dynamis.registry())).toEqual(['a1'])
    expect(seen).toHaveLength(1)
    expect(fiber.getEffects().filter(effect => effect.label === 'dynamis.put')).toHaveLength(1)
    await fiber.dispose()
    await settle()
    expect(dynamis.registry()).toEqual(empty)
  })

  it('已经就绪的 fiber 再放：立刻在位，通知一次', async () => {
    const { ctx, dynamis, seen } = await tree()
    let held: Context | undefined
    await ctx.plugin(
      mod('mod', inner => {
        inner.dynamis.put([a1])
        held = inner
      }),
    )
    seen.length = 0
    held?.dynamis.put([a2])
    expect(ids(dynamis.registry())).toEqual(['a1', 'a2'])
    expect(holders(dynamis.registry())).toEqual(['mod#1'])
    expect(seen).toHaveLength(1)
  })

  it('就绪之后才第一次放：没有座位也立刻在位', async () => {
    const { ctx, dynamis, seen } = await tree()
    let held: Context | undefined
    await ctx.plugin(mod('mod', inner => void (held = inner)))
    held?.dynamis.put([a1])
    expect(ids(dynamis.registry())).toEqual(['a1'])
    expect(seen).toHaveLength(1)
  })

  it('两个同名的 fiber 各有自己的实例，后占的名字带后缀', async () => {
    const { ctx, dynamis } = await tree()
    const twin = mod('twin', inner => void inner.dynamis.put([a1]))
    const one = await ctx.plugin(twin)
    await ctx.plugin(twin)
    expect(holders(dynamis.registry())).toEqual(['twin#1', 'twin~2#1'])
    await one.dispose()
    await settle()
    expect(holders(dynamis.registry())).toEqual(['twin~2#1'])
  })

  it('两家放在同一处：两份都在登记表里，与谁先装无关', async () => {
    const forward = await tree()
    const backward = await tree()
    const left = mod('left', inner => void inner.dynamis.put([a1]))
    const right = mod('right', inner => void inner.dynamis.put([{ ...a1, digest: 'other' }, b1]))
    await forward.ctx.plugin(left)
    await forward.ctx.plugin(right)
    await backward.ctx.plugin(right)
    await backward.ctx.plugin(left)
    expect(forward.dynamis.registry()).toEqual(backward.dynamis.registry())
    expect(ids(forward.dynamis.registry())).toEqual(['a1', 'a1', 'b1'])
  })

  it('条目可以由实例算出：放之前就知道自己是谁的哪一代', async () => {
    const { ctx, dynamis } = await tree()
    const seenInstances: Instance[] = []
    await ctx.plugin(
      mod('mod', inner => {
        inner.dynamis.put(instance => {
          seenInstances.push(instance)
          return [{ ...a1, digest: `${instance.fiber}#${instance.generation}` }]
        })
        inner.dynamis.put(instance => {
          seenInstances.push(instance)
          return [a2]
        })
      }),
    )
    expect(seenInstances).toEqual([
      { fiber: 'mod', generation: 1 },
      { fiber: 'mod', generation: 1 },
    ])
    expect(dynamis.registry().placed[0]?.digest).toBe('mod#1')
  })

  it('监听者抛错不改变已经放上的东西', async () => {
    const { ctx, dynamis } = await tree()
    ctx.on('dynamis-cordis/changed', () => {
      throw new Error('listener')
    })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => undefined)
    await ctx.plugin(mod('mod', inner => void inner.dynamis.put([a1])))
    expect(ids(dynamis.registry())).toEqual(['a1'])
    expect(warn).toHaveBeenCalledWith('dynamis: a listener of dynamis-cordis/changed threw')
  })

  it('已经开始卸载的 fiber 放不进去', async () => {
    const { ctx, dynamis } = await tree()
    let late: Context | undefined
    const fiber = await ctx.plugin(mod('mod', inner => void (late = inner)))
    await fiber.dispose()
    expect(() => late?.dynamis.put([a1])).toThrow()
    expect(dynamis.registry()).toBe(empty)
  })
})
