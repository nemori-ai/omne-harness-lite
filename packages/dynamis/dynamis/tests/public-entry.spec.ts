import { expect, it } from 'vitest'

it('根入口的导出名固定（DY-14）', async () => {
  const root = (await import('@omne-harness/dynamis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'empty',
    'install',
    'placedBy',
    'remove',
    'retire',
    'standing',
    'withUnread',
  ])
})
