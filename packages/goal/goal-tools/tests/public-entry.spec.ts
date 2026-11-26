import { expect, it } from 'vitest'

it('the public entry exports the tool module, its port, the propose executor and the protocol', async () => {
  const root = (await import('@omne-harness/goal-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'GOAL_GATES',
    'PROPOSE_CLOSED_RESULT',
    'PROPOSE_CONDITIONS',
    'answerGoal',
    'attachGoal',
    'bindGoal',
    'cardOf',
    'createGoalAuthor',
    'goalAdoption',
    'goalCommandNames',
    'goalContract',
    'goalExecutor',
    'goalOf',
    'goalParameterCodec',
    'goalSummaries',
    'goalToolModule',
    'proposeExecutor',
    'replyOf',
    'shown',
  ])
})
