import { expect, it } from 'vitest'

it('the root entry exports the factories, the absent sources and the tools source, and no Cordis value', async () => {
  const root = (await import('@omne-harness/agent-context')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DEFINITION_SECTION_PREFIX',
    'absentDefinitions',
    'absentToolLookup',
    'createAgentRequests',
    'createContextMaterials',
    'definitionContributions',
    'definitionSourceOf',
    'toolsSourceOf',
  ])
})

it('the Cordis entry exports the plugin class, the measured plugin factory and the X-3 key name', async () => {
  const cordis = (await import('@omne-harness/agent-context/cordis')) as Record<string, unknown>
  expect(Object.keys(cordis).sort()).toEqual([
    'AgentContextProvider',
    'MODEL_PREPARATION_RESOURCES',
    'createAgentContextPlugin',
  ])
})
