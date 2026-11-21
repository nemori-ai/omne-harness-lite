import { expect, it } from 'vitest'

it('根入口的导出名固定（DY-14）', async () => {
  const root = (await import('@omne-harness/dynamis')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CATALOG',
    'adopt',
    'ask',
    'bound',
    'candidates',
    'catalogContract',
    'declare',
    'distinct',
    'empty',
    'exactlyOne',
    'find',
    'install',
    'list',
    'listed',
    'mostSpecific',
    'placedBy',
    'refersTo',
    'remove',
    'render',
    'report',
    'resolve',
    'retire',
    'standing',
    'standingOf',
    'tree',
    'visible',
    'withUnread',
    'withdrawOf',
  ])
})
