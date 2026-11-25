import { expect, it } from 'vitest'

it('the public entry exports the check, its two members and its owner name', async () => {
  const root = (await import('@omne-harness/goal-check')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'GOAL_CHECK_MEMBERS',
    'GOAL_CHECK_OWNER',
    'createGoalCheck',
  ])
})
