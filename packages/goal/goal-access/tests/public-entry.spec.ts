import { expect, it } from 'vitest'

it('the root entry exports the contribution, and the Cordis entry the plugin that mounts it', async () => {
  const root = (await import('@omne-harness/goal-access')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createGoalContribution'])
  const cordis = (await import('@omne-harness/goal-access/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['createGoalAccessPlugin'])
})
