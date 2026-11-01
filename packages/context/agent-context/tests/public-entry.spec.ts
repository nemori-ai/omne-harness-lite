import { expect, it } from 'vitest'

it('the root entry exports the outlet factory and the absent resolver, and no Cordis value', async () => {
  const root = (await import('@omne-harness/agent-context')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual(['absentAccountTarget', 'createAgentAccountOutlet'])
})

it('the Cordis entry exports the plugin class only', async () => {
  const cordis = (await import('@omne-harness/agent-context/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis)).toEqual(['AgentAccountOutletProvider'])
})
