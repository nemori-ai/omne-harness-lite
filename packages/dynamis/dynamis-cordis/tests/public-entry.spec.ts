import { expect, it } from 'vitest'

it('根入口的导出名固定', async () => {
  const root = (await import('@omne-harness/dynamis-cordis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'drop',
    'gone',
    'instanceFor',
    'noSeats',
    'put',
    'ready',
  ])
})
