import { expect, it } from 'vitest'

it('the public entries export the registry, its ports and the test doubles', async () => {
  const root = (await import('@omne-harness/goal')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(
    ['ask', 'changedIn', 'commitGoal', 'createGoals', 'decideCommand', 'decideWrite'].concat([
      'describeProposal',
      'digestOf',
      'proposedBody',
    ]),
  )
  const testing = (await import('@omne-harness/goal/testing')) as Record<string, unknown>
  expect(Object.keys(testing)).toContain('storeConformance')
})
