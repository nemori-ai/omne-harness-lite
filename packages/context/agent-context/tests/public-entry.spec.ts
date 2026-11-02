import { expect, it } from 'vitest'

it('the root entry exports the factories and the first-wave sources, and no Cordis value', async () => {
  const root = (await import('@omne-harness/agent-context')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'absentAccountTarget',
    'absentStepResults',
    'createAgentAccountOutlet',
    'createAgentModelContext',
    'createAgentRequests',
    'createContextMaterials',
    'firstWaveTools',
  ])
})

it('the Cordis entry exports the two plugin classes, the X-3 key name and the material capacity', async () => {
  const cordis = (await import('@omne-harness/agent-context/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'AgentAccountOutletProvider',
    'AgentContextProvider',
    'DEFAULT_MATERIAL_CAPACITY',
    'MODEL_PREPARATION_RESOURCES',
  ])
})
