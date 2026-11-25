import { expect, it } from 'vitest'

it('the public entry exports the sources, the reminder texts and the adapter', async () => {
  const root = (await import('@omne-harness/goal-session')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'GOAL_SOURCES',
    'createGoalSessions',
    'goalInputSources',
    'resumeText',
    'startText',
  ])
})
