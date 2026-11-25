import { expect, it } from 'vitest'

it('the public entry exports the sources, the reminder texts and the adapter', async () => {
  const root = (await import('@omne-harness/goal-session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CITED_PAGE_LIMIT',
    'GOAL_SOURCES',
    'HISTORY_PAGE_LIMIT',
    'answeredCalls',
    'continueText',
    'createGoalCalls',
    'createGoalHistory',
    'createGoalSessions',
    'goalInputSources',
    'madeCalls',
    'plainOf',
    'resumeText',
    'startText',
  ])
})
