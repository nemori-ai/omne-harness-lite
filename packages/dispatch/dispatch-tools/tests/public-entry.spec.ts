import { expect, it } from 'vitest'

it('exports the tool module, its executors, the port of a call and the protocol', async () => {
  const root = (await import('@omne-harness/dispatch-tools')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DISPATCH_CLOSED_RESULT',
    'LIST_RELATIONS',
    'agentsAdoption',
    'agentsCommandNames',
    'agentsContract',
    'agentsExecutor',
    'agentsOf',
    'agentsParameterCodec',
    'agentsSummaries',
    'agentsToolModule',
    'answerAgents',
    'attachAgents',
    'bindAgents',
    'createAgentsAuthor',
    'dispatchExecutor',
  ])
})
