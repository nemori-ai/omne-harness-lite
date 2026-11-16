import { expect, it } from 'vitest'

it('根入口只给出卡的存放与三处视图', async () => {
  const root = (await import('@omne-harness/human-intervention-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CardsHub',
    'DecisionsPage',
    'PendingBadge',
    'SessionCards',
  ])
})
