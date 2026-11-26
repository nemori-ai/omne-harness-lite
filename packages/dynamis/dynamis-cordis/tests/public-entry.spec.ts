import { expect, it } from 'vitest'

it('根入口的导出名固定', async () => {
  const root = (await import('@omne-harness/dynamis-cordis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'drained',
    'drop',
    'gone',
    'instanceFor',
    'leaving',
    'noSeats',
    'put',
    'ready',
    'rollout',
  ])
})
