import { expect, it } from 'vitest'

it('the public entry exports the sources, the reminder texts and the adapter', async () => {
  const root = (await import('@omne-harness/goal-session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'CITED_PAGE_LIMIT',
    'CLOSE_LOOKS',
    'CLOSE_WAIT_MS',
    'EXAMINER_REUSE_MS',
    'GOAL_SOURCES',
    'HISTORY_PAGE_LIMIT',
    'NO_ENTRY',
    'answeredCalls',
    'continueText',
    'createGoalCalls',
    'createGoalHistory',
    'createGoalSessions',
    'createSessionExamining',
    'examinerStanding',
    'goalInputSources',
    'lastSaid',
    'madeCalls',
    'plainOf',
    'resumeText',
    'startText',
  ])
})
