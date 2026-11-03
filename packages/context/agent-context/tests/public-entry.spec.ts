import { expect, it } from 'vitest'

it('the root entry exports the factories, the absent sources and the tools source, and no Cordis value', async () => {
  const root = (await import('@omne-harness/agent-context')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DEFINITION_SECTION_PREFIX',
    'absentAccountTarget',
    'absentDefinitions',
    'absentStepResults',
    'absentToolLookup',
    'createAgentAccountOutlet',
    'createAgentModelContext',
    'createAgentRequests',
    'createContextMaterials',
    'definitionContributions',
    'definitionSourceOf',
    'toolsSourceOf',
  ])
})

it('the Cordis entry exports the two plugin classes, the measured plugin factory, the X-3 key name and the material capacity', async () => {
  const cordis = (await import('@omne-harness/agent-context/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'AgentAccountOutletProvider',
    'AgentContextProvider',
    'DEFAULT_MATERIAL_CAPACITY',
    'MODEL_PREPARATION_RESOURCES',
    'createAgentContextPlugin',
  ])
})
