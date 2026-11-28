import { expect, it } from 'vitest'

it('the root entry exports the driver and the panel, and the Cordis entry the module', async () => {
  const root = (await import('@omne-harness/goal-ui')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['GoalDriver', 'GoalPanel'])
  const cordis = (await import('@omne-harness/goal-ui/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'GOAL_IN_SESSION',
    'GOAL_TAB_ORDER',
    'createGoalUiModule',
    'goalParts',
  ])
})
