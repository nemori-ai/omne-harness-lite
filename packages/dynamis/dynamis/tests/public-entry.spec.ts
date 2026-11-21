import { expect, it } from 'vitest'

it('根入口的导出名固定（DY-14）', async () => {
  const root = (await import('@omne-harness/dynamis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CATALOG',
    'ask',
    'candidates',
    'catalogContract',
    'declare',
    'distinct',
    'empty',
    'exactlyOne',
    'install',
    'list',
    'listed',
    'mostSpecific',
    'placedBy',
    'remove',
    'report',
    'retire',
    'standing',
    'standingOf',
    'visible',
    'withUnread',
    'withdrawOf',
  ])
})
