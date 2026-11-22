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
