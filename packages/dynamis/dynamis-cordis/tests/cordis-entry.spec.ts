import { Context } from '@deepseek-ai/cordis'
import { expect, it } from 'vitest'

it('./cordis 入口经构建产物装进一棵真的树', async () => {
  const cordis = await import('@omne-harness/dynamis-cordis/cordis')
  expect(Object.keys(cordis).sort()).toEqual(['DynamisRefused', 'DynamisService', 'dynamisKey'])
  expect(cordis.dynamisKey).toBe('dynamis')
  const ctx = new Context()
  await ctx.plugin(cordis.DynamisService)
  const dynamis = ctx.get(cordis.dynamisKey) as InstanceType<typeof cordis.DynamisService>
  await ctx.plugin({
    name: 'mod',
    inject: ['dynamis'],
    apply: inner =>
      void inner.dynamis.put([
        { point: 'host.list', key: 'k', id: 'a', scope: [], rank: 0, digest: 'd', item: null },
      ]),
  })
  expect(dynamis.registry().placed.map(placed => placed.instance)).toEqual([
    { fiber: 'mod', generation: 1 },
  ])
})

it('经构建产物：要排空的批在卸载时先正在撤下，排空完才取走', async () => {
  const cordis = await import('@omne-harness/dynamis-cordis/cordis')
  const ctx = new Context()
  await ctx.plugin(cordis.DynamisService)
  const dynamis = ctx.get(cordis.dynamisKey) as InstanceType<typeof cordis.DynamisService>
  let open: () => void = () => undefined
  const drain = (): Promise<void> => new Promise(resolve => void (open = resolve))
  const item = {
    point: 'host.list',
    key: 'k',
    id: 'a',
    scope: [],
    rank: 0,
    digest: 'd',
    item: null,
  }
  const fiber = await ctx.plugin({
    name: 'mod',
    inject: ['dynamis'],
    apply: inner => void inner.dynamis.put([item], { drain }),
  })
  const unloading = fiber.dispose()
  await new Promise(resolve => setTimeout(resolve, 5))
  expect(dynamis.registry().retiring).toEqual([{ fiber: 'mod', generation: 1 }])
  expect(dynamis.registry().placed).toHaveLength(1)
  open()
  await unloading
  expect(dynamis.registry().retiring).toEqual([])
  expect(dynamis.registry().placed).toEqual([])
})
