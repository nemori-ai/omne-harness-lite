import { expect, it } from 'vitest'

it('the public entry exports the adapter, its consumer name, its source and the proof of a handoff', async () => {
  const root = (await import('@omne-harness/goal-decisions')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'GOAL_DECISIONS_CONSUMER',
    'GOAL_DECISIONS_SOURCE',
    'createGoalDecisions',
    'decisionCompletion',
    'verifyDecisionHandoff',
  ])
})
