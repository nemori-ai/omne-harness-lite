import { expect, it } from 'vitest'

it('exports the agent-host plugin with its static inject list', async () => {
  const cordis = (await import('@omne-harness/agent-host-local/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['agentHostPlugin', 'createAgentHostLocalPlugin'])
  const plugin = cordis.agentHostPlugin as { name: string; inject: readonly string[] }
  expect(plugin.name).toBe('agent-host')
  expect(plugin.inject).toEqual([
    'agentAccessCheck',
    'agentJournal',
    'agentAdoptions',
    'agentConditions',
    'agentRequests',
    'agentModelSelection',
    'agentModelContext',
    'agentMessageHandoff',
    'agentClock',
    'modelRuntime',
    'agentJournalEntries',
    'agentMaterials',
    'agentReceivedCommits',
    'agentModelReceptionTargets',
    'agentAccountOutlet',
    'agentHostPrincipal',
  ])
})
